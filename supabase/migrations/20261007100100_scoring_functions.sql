-- Bilim Arena Race — Stage 4: scoring operations.
--
--   private.team_standings(race)        score, finish order and place of every team
--   submit_answer(team, task, answer)   + points, + 10-second pause after a wrong answer
--   get_lobby(race)                     + teams[].score / place, + currentTask.cooldownSeconds
--
-- Conventions as before: security definer, search_path = '', P0001 + code.

-- ---------------------------------------------------------------------------
-- Standings
-- ---------------------------------------------------------------------------

-- One row per team of the race:
--   score         max(0, sum of answer points) + finish bonus (100 / 60 / 30)
--   finish_order  1, 2, 3… by the time the team reached FINISH; null if not there
--   place         finished teams first (earlier is better), then by position on
--                 the route, then by score; equal teams share a place (rank)
-- Computed on read, so two teams finishing at the same moment can never take
-- the same finish bonus.
create function private.team_standings(p_race_id uuid)
returns table (team_id uuid, score integer, finished_at timestamptz, finish_order integer, place integer)
language sql
stable
set search_path = ''
as $$
  with finish as (
    select c.position
    from public.checkpoints c
    where c.race_id = p_race_id and c.type = 'finish'
  ),
  base as (
    select
      t.id,
      t.current_position,
      tp.passed_at as finished_at,
      greatest(0, coalesce((
        select sum(s.points) from public.task_submissions s where s.team_id = t.id
      ), 0))::integer as answer_points
    from public.teams t
    left join public.team_passes tp
      on tp.team_id = t.id and tp.position = (select position from finish)
    where t.race_id = p_race_id
  ),
  ordered as (
    select
      b.*,
      case when b.finished_at is not null then
        (row_number() over (order by b.finished_at is null, b.finished_at, b.id))::integer
      end as finish_order
    from base b
  ),
  scored as (
    select
      o.*,
      o.answer_points + coalesce((array[100, 60, 30])[o.finish_order], 0) as total
    from ordered o
  )
  select
    s.id,
    s.total,
    s.finished_at,
    s.finish_order,
    (rank() over (
      order by s.finished_at is null, s.finished_at, s.current_position desc, s.total desc
    ))::integer
  from scored s;
$$;

revoke all on function private.team_standings(uuid) from public;

-- ---------------------------------------------------------------------------
-- submit_answer: + points, + pause after a wrong answer
-- ---------------------------------------------------------------------------

-- Same contract as Stage 3, plus:
--   * a wrong answer earns −20 and locks the task for this team for 10 seconds
--     (answer_cooldown); the refused try is not recorded;
--   * a correct answer earns 100 + speed bonus: 50 minus one point for every
--     3 seconds since the team reached its current point (race start for START);
--   * the response adds {points, cooldownSeconds} and still never the answer.
create or replace function public.submit_answer(p_team_id uuid, p_task_id uuid, p_answer text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.teams := private.lock_member_team(p_team_id);
  v_participant_id uuid;
  v_task public.checkpoint_tasks;
  v_task_position integer;
  v_key private.checkpoint_task_keys;
  v_finish integer;
  v_answer text := btrim(coalesce(p_answer, ''));
  v_correct boolean;
  v_last_wrong timestamptz;
  v_reached_at timestamptz;
  v_points integer;
  v_submission_id uuid;
begin
  select * into v_task
  from public.checkpoint_tasks
  where id = p_task_id and race_id = v_team.race_id;
  if not found then
    perform private.fail('task_not_found');
  end if;
  select position into v_task_position from public.checkpoints where id = v_task.checkpoint_id;

  select position into v_finish
  from public.checkpoints
  where race_id = v_team.race_id and type = 'finish';

  -- Already passed: repeated or late submissions change nothing.
  if v_task_position <= v_team.current_position then
    return jsonb_build_object(
      'correct', null,
      'moved', false,
      'alreadyPassed', true,
      'position', v_team.current_position,
      'finished', v_team.current_position = v_finish,
      'points', 0,
      'cooldownSeconds', 0
    );
  end if;
  if v_task_position <> v_team.current_position + 1 then
    perform private.fail('task_not_current');
  end if;

  -- The team row is locked: teammates answering at the same moment queue up
  -- here, so the pause cannot be bypassed by sending answers in parallel.
  select max(submitted_at) into v_last_wrong
  from public.task_submissions
  where team_id = v_team.id and task_id = v_task.id and not is_correct;
  if v_last_wrong is not null and v_last_wrong > now() - interval '10 seconds' then
    perform private.fail('answer_cooldown');
  end if;

  if char_length(v_answer) not between 1 and 200 then
    perform private.fail('invalid_answer');
  end if;

  select * into v_key from private.checkpoint_task_keys where task_id = v_task.id;

  if v_task.type = 'single_choice' then
    if v_answer !~ '^[0-9]$' then
      perform private.fail('invalid_answer');
    end if;
    if v_answer::integer >= jsonb_array_length(v_task.options) then
      perform private.fail('invalid_answer');
    end if;
    v_correct := v_answer::integer = v_key.correct_option;
  else
    v_correct := private.normalize_answer(v_answer) = private.normalize_answer(v_key.correct_answer);
  end if;

  if v_correct then
    select coalesce(
      (select tp.passed_at from public.team_passes tp
       where tp.team_id = v_team.id and tp.position = v_team.current_position),
      (select r.started_at from public.races r where r.id = v_team.race_id),
      now()
    ) into v_reached_at;
    v_points := 100 + greatest(0, 50 - floor(extract(epoch from (now() - v_reached_at)) / 3)::integer);
  else
    v_points := -20;
  end if;

  select id into v_participant_id
  from public.participants
  where race_id = v_team.race_id and user_id = private.require_user_id();

  insert into public.task_submissions (race_id, team_id, task_id, participant_id, answer, is_correct, points)
  values (v_team.race_id, v_team.id, v_task.id, v_participant_id, v_answer, v_correct, v_points)
  returning id into v_submission_id;

  if v_correct then
    insert into public.team_passes (team_id, race_id, position, submission_id)
    values (v_team.id, v_team.race_id, v_task_position, v_submission_id);

    -- FINISH follows the last checkpoint directly: it carries no task.
    if v_task_position + 1 = v_finish then
      insert into public.team_passes (team_id, race_id, position, submission_id)
      values (v_team.id, v_team.race_id, v_finish, v_submission_id);
      v_task_position := v_finish;
    end if;

    update public.teams
    set current_position = v_task_position
    where id = v_team.id
    returning * into v_team;
  end if;

  return jsonb_build_object(
    'correct', v_correct,
    'moved', v_correct,
    'alreadyPassed', false,
    'position', v_team.current_position,
    'finished', v_team.current_position = v_finish,
    'points', v_points,
    'cooldownSeconds', case when v_correct then 0 else 10 end
  );
end;
$$;

revoke all on function public.submit_answer(uuid, uuid, text) from public, anon;
grant execute on function public.submit_answer(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- get_lobby: + score and place for every team, + pause left on the task
-- ---------------------------------------------------------------------------

-- Additions to the Stage 3 snapshot:
--   teams[].score, teams[].place     every member: the race leaderboard is public
--   teams[].finishOrder              every member: 1, 2, 3… or null
--   currentTask.cooldownSeconds      student: seconds left of the pause (0 = may answer)
-- Correct answers (private.checkpoint_task_keys) are still never read here.
create or replace function public.get_lobby(p_race_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user_id();
  v_race public.races;
  v_me public.participants;
  v_is_owner boolean;
  v_my_position integer;
  v_current_task jsonb;
begin
  select * into v_race from public.races where id = p_race_id;
  if not found then
    perform private.fail('race_not_found');
  end if;

  v_is_owner := v_race.created_by = v_user_id;
  select * into v_me
  from public.participants
  where race_id = p_race_id and user_id = v_user_id;

  if not v_is_owner and v_me.id is null then
    perform private.fail('race_not_found');
  end if;

  if not v_is_owner and v_me.team_id is not null and v_race.status = 'running' then
    select current_position into v_my_position from public.teams where id = v_me.team_id;
    select jsonb_build_object(
      'id', k.id,
      'checkpointPosition', c.position,
      'type', k.type,
      'question', k.question,
      'options', k.options,
      'cooldownSeconds', coalesce((
        select greatest(0, ceil(extract(epoch from (max(s.submitted_at) + interval '10 seconds' - now()))))::integer
        from public.task_submissions s
        where s.team_id = v_me.team_id and s.task_id = k.id and not s.is_correct
      ), 0)
    )
    into v_current_task
    from public.checkpoint_tasks k
    join public.checkpoints c on c.id = k.checkpoint_id
    where c.race_id = p_race_id and c.position = v_my_position + 1;
  end if;

  return jsonb_build_object(
    'race', jsonb_build_object(
      'id', v_race.id,
      'code', v_race.code,
      'title', v_race.title,
      'description', v_race.description,
      'status', v_race.status,
      'startedAt', v_race.started_at,
      'finishedAt', v_race.finished_at
    ),
    'viewer', jsonb_build_object(
      'role', case when v_is_owner then 'teacher' else 'student' end,
      'participantId', v_me.id,
      'displayName', v_me.display_name,
      'teamId', v_me.team_id
    ),
    'route', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'position', c.position,
          'title', c.title,
          'type', c.type,
          'hasTask', k.id is not null,
          'task', case when v_is_owner and k.id is not null
                       then jsonb_build_object('type', k.type, 'question', k.question)
                  end
        )
        order by c.position
      )
      from public.checkpoints c
      left join public.checkpoint_tasks k on k.checkpoint_id = c.id
      where c.race_id = p_race_id
    ), '[]'::jsonb),
    'currentTask', v_current_task,
    'teams', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'memberCount', (select count(*) from public.participants p where p.team_id = t.id),
          'position', t.current_position,
          'score', st.score,
          'place', st.place,
          'finishOrder', st.finish_order,
          'stats', case when v_is_owner then jsonb_build_object(
            'correct', (select count(*) from public.task_submissions s where s.team_id = t.id and s.is_correct),
            'wrong', (select count(*) from public.task_submissions s where s.team_id = t.id and not s.is_correct),
            'finishedAt', st.finished_at
          ) end
        )
        order by t.created_at, t.id
      )
      from public.teams t
      join private.team_standings(p_race_id) st on st.team_id = t.id
      where t.race_id = p_race_id
    ), '[]'::jsonb),
    'participants', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', p.id, 'displayName', p.display_name, 'teamId', p.team_id)
        order by p.created_at, p.id
      )
      from public.participants p
      where p.race_id = p_race_id
        and p.role = 'student'
        and (
          v_is_owner
          or p.id = v_me.id
          or (v_me.team_id is not null and p.team_id = v_me.team_id)
        )
    ), '[]'::jsonb),
    'studentCount', (
      select count(*) from public.participants p
      where p.race_id = p_race_id and p.role = 'student'
    )
  );
end;
$$;
