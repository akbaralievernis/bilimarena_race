-- Bilim Arena Race — Stage 3: trusted task operations.
--
--   create_race(..., p_tasks)          tasks are written with the route
--   submit_answer(team, task, answer)  the only way to pass a checkpoint with a task
--   advance_team(team, to)             Stage 2 move, now refused for task checkpoints
--   get_lobby(race)                    + current task (never its answer) + statistics
--
-- Conventions as before: security definer, search_path = '', P0001 + code.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Short answers are compared case-insensitively, with collapsed whitespace and
-- ё = е, so "  Три " and "три" both match "Три".
create function private.normalize_answer(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(lower(private.clean_text(p_value)), 'ё', 'е');
$$;

-- Validates p_tasks (one object per checkpoint, in route order) and writes the
-- tasks with their keys. Raises invalid_tasks / invalid_task.
create function private.insert_tasks(p_race_id uuid, p_tasks jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_task jsonb;
  v_index integer := 0;
  v_type text;
  v_question text;
  v_options jsonb;
  v_option jsonb;
  v_clean_options text[];
  v_correct jsonb;
  v_answer text;
  v_checkpoint_id uuid;
  v_task_id uuid;
begin
  -- Separate IFs: SQL does not promise left-to-right OR, and the length
  -- functions raise on non-arrays.
  if jsonb_typeof(p_tasks) is distinct from 'array' then
    perform private.fail('invalid_tasks');
  end if;
  if jsonb_array_length(p_tasks) <> (
    select count(*) from public.checkpoints where race_id = p_race_id and type = 'checkpoint'
  ) then
    perform private.fail('invalid_tasks');
  end if;

  for v_task in select value from jsonb_array_elements(p_tasks) loop
    v_index := v_index + 1;
    if jsonb_typeof(v_task) <> 'object' then
      perform private.fail('invalid_task');
    end if;

    v_type := v_task ->> 'type';
    -- Keep line breaks in questions, drop other control characters.
    v_question := btrim(regexp_replace(coalesce(v_task ->> 'question', ''), '\r\n?', E'\n', 'g'));
    if v_type is null or v_type not in ('single_choice', 'short_answer')
       or char_length(v_question) not between 1 and 500
       or v_question ~ E'[\\x01-\\x09\\x0b-\\x1f\\x7f]' then
      perform private.fail('invalid_task');
    end if;

    select id into v_checkpoint_id
    from public.checkpoints
    where race_id = p_race_id and position = v_index;

    if v_type = 'single_choice' then
      v_options := v_task -> 'options';
      v_correct := v_task -> 'correctOption';
      if jsonb_typeof(v_options) is distinct from 'array' then
        perform private.fail('invalid_task');
      end if;
      if jsonb_array_length(v_options) not between 2 and 6 then
        perform private.fail('invalid_task');
      end if;
      v_clean_options := array[]::text[];
      for v_option in select value from jsonb_array_elements(v_options) loop
        if jsonb_typeof(v_option) <> 'string'
           or char_length(private.clean_text(v_option #>> '{}')) not between 1 and 200 then
          perform private.fail('invalid_task');
        end if;
        v_clean_options := v_clean_options || private.clean_text(v_option #>> '{}');
      end loop;
      if (select count(distinct lower(o)) from unnest(v_clean_options) o) <> cardinality(v_clean_options) then
        perform private.fail('invalid_task');
      end if;
      if jsonb_typeof(v_correct) is distinct from 'number' then
        perform private.fail('invalid_task');
      end if;
      if (v_correct #>> '{}') !~ '^[0-9]$' then
        perform private.fail('invalid_task');
      end if;
      if (v_correct #>> '{}')::integer >= cardinality(v_clean_options) then
        perform private.fail('invalid_task');
      end if;

      insert into public.checkpoint_tasks (race_id, checkpoint_id, type, question, options)
      values (p_race_id, v_checkpoint_id, 'single_choice', v_question, to_jsonb(v_clean_options))
      returning id into v_task_id;
      insert into private.checkpoint_task_keys (task_id, correct_option)
      values (v_task_id, (v_correct #>> '{}')::smallint);
    else
      v_answer := private.clean_text(v_task ->> 'correctAnswer');
      if char_length(v_answer) not between 1 and 200 or v_answer ~ '[[:cntrl:]]'
         or (v_task ? 'options' and v_task -> 'options' <> 'null'::jsonb) then
        perform private.fail('invalid_task');
      end if;

      insert into public.checkpoint_tasks (race_id, checkpoint_id, type, question)
      values (p_race_id, v_checkpoint_id, 'short_answer', v_question)
      returning id into v_task_id;
      insert into private.checkpoint_task_keys (task_id, correct_answer)
      values (v_task_id, v_answer);
    end if;
  end loop;
end;
$$;

revoke all on function private.normalize_answer(text) from public;
revoke all on function private.insert_tasks(uuid, jsonb) from public;

-- ---------------------------------------------------------------------------
-- create_race: + p_tasks
-- ---------------------------------------------------------------------------

drop function public.create_race(text, text, text[]);

-- p_tasks: null (no tasks — Stage 1/2 callers, Stage 2 button moves) or an
-- array with exactly one task object per checkpoint, in route order:
--   {"type":"single_choice","question":"…","options":["…","…"],"correctOption":1}
--   {"type":"short_answer","question":"…","correctAnswer":"…"}
-- All or nothing: a partially tasked route is rejected.
create function public.create_race(
  p_title text,
  p_description text default null,
  p_checkpoints text[] default null,
  p_tasks jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user_id();
  v_title text := private.clean_text(p_title);
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_input text[] := coalesce(p_checkpoints, private.default_checkpoint_titles());
  v_checkpoints text[] := array[]::text[];
  v_item text;
  v_teacher_name text;
  v_race_id uuid;
  v_attempt int := 0;
begin
  if private.is_anonymous_user() then
    perform private.fail('teacher_account_required');
  end if;
  if char_length(v_title) not between 3 and 80 or v_title ~ '[[:cntrl:]]' then
    perform private.fail('invalid_title');
  end if;
  if v_description is not null and char_length(v_description) > 500 then
    perform private.fail('invalid_description');
  end if;

  if coalesce(array_ndims(v_input), 1) <> 1 or cardinality(v_input) not between 1 and 20 then
    perform private.fail('invalid_route');
  end if;
  foreach v_item in array v_input loop
    v_item := private.clean_text(v_item);
    if char_length(v_item) not between 1 and 60 or v_item ~ '[[:cntrl:]]' then
      perform private.fail('invalid_checkpoint_title');
    end if;
    v_checkpoints := v_checkpoints || v_item;
  end loop;

  if (
    select count(*) from public.races
    where created_by = v_user_id and status <> 'finished'
  ) >= 50 then
    perform private.fail('too_many_active_races');
  end if;

  loop
    v_attempt := v_attempt + 1;
    begin
      insert into public.races (code, title, description, status, created_by)
      values (private.generate_room_code(), v_title, v_description, 'lobby', v_user_id)
      returning id into v_race_id;
      exit;
    exception when unique_violation then
      if v_attempt >= 10 then
        perform private.fail('room_code_unavailable');
      end if;
    end;
  end loop;

  perform private.insert_route(v_race_id, v_checkpoints);
  if p_tasks is not null then
    perform private.insert_tasks(v_race_id, p_tasks);
  end if;

  v_teacher_name := btrim(left(private.clean_text(coalesce(
    nullif(private.clean_text(auth.jwt() -> 'user_metadata' ->> 'display_name'), ''),
    split_part(auth.jwt() ->> 'email', '@', 1)
  )), 30));
  if char_length(v_teacher_name) < 2 or v_teacher_name ~ '[[:cntrl:]]' then
    v_teacher_name := 'Учитель';
  end if;

  insert into public.participants (race_id, user_id, display_name, role)
  values (v_race_id, v_user_id, v_teacher_name, 'teacher');

  return v_race_id;
end;
$$;

revoke all on function public.create_race(text, text, text[], jsonb) from public, anon;
grant execute on function public.create_race(text, text, text[], jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Shared: lock the caller's team for a move
-- ---------------------------------------------------------------------------

-- Returns the caller's team locked for update, after locking its race for
-- share (lock order race → team, as in every team function). Raises
-- team_not_found for "no such team" and "not your team" alike, then
-- race_finished / race_not_started unless the race is running.
create function private.lock_member_team(p_team_id uuid)
returns public.teams
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user_id();
  v_race_id uuid;
  v_status public.race_status;
  v_team public.teams;
begin
  select race_id into v_race_id from public.teams where id = p_team_id;
  if not found then
    perform private.fail('team_not_found');
  end if;

  -- FOR SHARE waits for start_race / finish_race and blocks
  -- assign_participant, so membership cannot change until this commits.
  select status into v_status from public.races where id = v_race_id for share;

  select t.* into v_team
  from public.teams t
  where t.id = p_team_id
    and exists (
      select 1 from public.participants p
      where p.team_id = t.id and p.user_id = v_user_id and p.role = 'student'
    )
  for update;
  if not found then
    perform private.fail('team_not_found');
  end if;

  if v_status = 'finished' then
    perform private.fail('race_finished');
  end if;
  if v_status <> 'running' then
    perform private.fail('race_not_started');
  end if;
  return v_team;
end;
$$;

revoke all on function private.lock_member_team(uuid) from public;

-- ---------------------------------------------------------------------------
-- advance_team: Stage 2 move, refused where a task guards the point
-- ---------------------------------------------------------------------------

create or replace function public.advance_team(p_team_id uuid, p_to_position integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team public.teams := private.lock_member_team(p_team_id);
  v_finish integer;
  v_moved boolean := false;
begin
  select position into v_finish
  from public.checkpoints
  where race_id = v_team.race_id and type = 'finish';

  if p_to_position is distinct from v_team.current_position then
    if v_team.current_position >= v_finish then
      perform private.fail('team_finished');
    end if;
    if p_to_position is null or p_to_position <> v_team.current_position + 1 then
      perform private.fail('invalid_move');
    end if;
    -- A checkpoint with a task is passed only by submit_answer().
    if exists (
      select 1
      from public.checkpoint_tasks k
      join public.checkpoints c on c.id = k.checkpoint_id
      where c.race_id = v_team.race_id and c.position = p_to_position
    ) then
      perform private.fail('task_required');
    end if;

    update public.teams
    set current_position = p_to_position
    where id = v_team.id
    returning * into v_team;
    insert into public.team_passes (team_id, race_id, position)
    values (v_team.id, v_team.race_id, p_to_position)
    on conflict do nothing;
    v_moved := true;
  end if;

  return jsonb_build_object(
    'teamId', v_team.id,
    'position', v_team.current_position,
    'finished', v_team.current_position = v_finish,
    'moved', v_moved
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- submit_answer: server-side check, the only way through a task checkpoint
-- ---------------------------------------------------------------------------

-- p_answer: the option index ("0".."5") for single_choice, the text for
-- short_answer. Returns {correct, moved, alreadyPassed, position, finished}
-- and never the correct answer.
--   * the task must belong to the team's current checkpoint (position + 1);
--   * a task the team already passed is a no-op (no second pass, no move);
--   * a correct answer moves the team one point; after the last checkpoint the
--     team also reaches FINISH in the same transaction.
create function public.submit_answer(p_team_id uuid, p_task_id uuid, p_answer text)
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
      'finished', v_team.current_position = v_finish
    );
  end if;
  if v_task_position <> v_team.current_position + 1 then
    perform private.fail('task_not_current');
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

  select id into v_participant_id
  from public.participants
  where race_id = v_team.race_id and user_id = private.require_user_id();

  insert into public.task_submissions (race_id, team_id, task_id, participant_id, answer, is_correct)
  values (v_team.race_id, v_team.id, v_task.id, v_participant_id, v_answer, v_correct)
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
    'finished', v_team.current_position = v_finish
  );
end;
$$;

revoke all on function public.submit_answer(uuid, uuid, text) from public, anon;
grant execute on function public.submit_answer(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- get_lobby: + tasks (without answers) + teacher statistics
-- ---------------------------------------------------------------------------

-- Additions to the Stage 2 snapshot:
--   route[].hasTask         every member
--   route[].task            teacher only: {type, question}
--   currentTask             student with a team, race running: the task of the
--                           team's next checkpoint {id, checkpointPosition,
--                           type, question, options}
--   teams[].stats           teacher only: {correct, wrong, passed, finishedAt}
-- Correct answers (private.checkpoint_task_keys) are never read here.
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
      'options', k.options
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
          'stats', case when v_is_owner then jsonb_build_object(
            'correct', (select count(*) from public.task_submissions s where s.team_id = t.id and s.is_correct),
            'wrong', (select count(*) from public.task_submissions s where s.team_id = t.id and not s.is_correct),
            'finishedAt', (
              select tp.passed_at
              from public.team_passes tp
              join public.checkpoints c on c.race_id = tp.race_id and c.position = tp.position
              where tp.team_id = t.id and c.type = 'finish'
            )
          ) end
        )
        order by t.created_at, t.id
      )
      from public.teams t
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
