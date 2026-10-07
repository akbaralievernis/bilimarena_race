-- Bilim Arena Race — Stage 5: race history and teacher analytics.
--
--   get_race_report(race)   owner only: final standings, per-task analysis,
--                           student activity and the race timeline
--
-- Read-only: no new tables. Like every snapshot before, the report never reads
-- private.checkpoint_task_keys and never contains the text of a correct answer:
-- tasks show only how often they were solved and the most common WRONG answers,
-- the timeline only says "right" or "wrong".
--
-- Conventions as before: security definer, search_path = '', P0001 + code.

create function public.get_race_report(p_race_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user_id();
  v_race public.races;
begin
  select * into v_race from public.races where id = p_race_id;
  -- "No such race" and "not your race" look the same on purpose.
  if not found or v_race.created_by <> v_user_id then
    perform private.fail('race_not_found');
  end if;

  return jsonb_build_object(
    'race', jsonb_build_object(
      'id', v_race.id,
      'code', v_race.code,
      'title', v_race.title,
      'status', v_race.status,
      'createdAt', v_race.created_at,
      'startedAt', v_race.started_at,
      'finishedAt', v_race.finished_at
    ),

    -- Final (or current) standings with each team's answers.
    'teams', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'place', st.place,
          'score', st.score,
          'finishOrder', st.finish_order,
          'finishedAt', st.finished_at,
          'position', t.current_position,
          'memberCount', (select count(*) from public.participants p where p.team_id = t.id),
          'correct', (select count(*) from public.task_submissions s where s.team_id = t.id and s.is_correct),
          'wrong', (select count(*) from public.task_submissions s where s.team_id = t.id and not s.is_correct)
        )
        order by st.place, t.name, t.id
      )
      from public.teams t
      join private.team_standings(p_race_id) st on st.team_id = t.id
      where t.race_id = p_race_id
    ), '[]'::jsonb),

    -- One entry per checkpoint task, in route order.
    'tasks', coalesce((
      select jsonb_agg(task_row.item order by task_row.position)
      from (
        select
          c.position,
          jsonb_build_object(
            'position', c.position,
            'title', c.title,
            'type', k.type,
            'question', k.question,
            'options', k.options,
            'attempts', (select count(*) from public.task_submissions s where s.task_id = k.id),
            'correct', (select count(*) from public.task_submissions s where s.task_id = k.id and s.is_correct),
            'wrong', (select count(*) from public.task_submissions s where s.task_id = k.id and not s.is_correct),
            'teamsTried', (select count(distinct s.team_id) from public.task_submissions s where s.task_id = k.id),
            'teamsPassed', (select count(distinct s.team_id) from public.task_submissions s where s.task_id = k.id and s.is_correct),
            -- Teams whose very first answer to this task was right.
            'firstTryCorrect', (
              select count(*)
              from (
                select distinct on (s.team_id) s.is_correct
                from public.task_submissions s
                where s.task_id = k.id
                order by s.team_id, s.submitted_at, s.id
              ) first_answer
              where first_answer.is_correct
            ),
            -- From reaching the previous point (race start for checkpoint 1)
            -- to passing this one, averaged over the teams that passed it.
            'avgSolveSeconds', (
              select round(avg(extract(epoch from (pass.passed_at - coalesce(prev.passed_at, v_race.started_at)))))::integer
              from public.team_passes pass
              left join public.team_passes prev on prev.team_id = pass.team_id and prev.position = pass.position - 1
              where pass.race_id = p_race_id and pass.position = c.position
            ),
            -- Up to three most common wrong answers: option text for a choice,
            -- the typed text (grouped case- and space-insensitively) otherwise.
            'topWrong', coalesce((
              select jsonb_agg(jsonb_build_object('answer', w.label, 'count', w.n) order by w.n desc, w.label)
              from (
                select
                  case when k.type = 'single_choice'
                       then coalesce(k.options ->> (min(s.answer)::integer), min(s.answer))
                       else min(s.answer)
                  end as label,
                  count(*) as n
                from public.task_submissions s
                where s.task_id = k.id and not s.is_correct
                group by private.normalize_answer(s.answer)
                order by count(*) desc, min(s.answer)
                limit 3
              ) w
            ), '[]'::jsonb)
          ) as item
        from public.checkpoint_tasks k
        join public.checkpoints c on c.id = k.checkpoint_id
        where k.race_id = p_race_id
      ) task_row
    ), '[]'::jsonb),

    -- Every student: team and how actively they answered.
    'participants', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'displayName', p.display_name,
          'teamName', tm.name,
          'answers', (select count(*) from public.task_submissions s where s.participant_id = p.id),
          'correct', (select count(*) from public.task_submissions s where s.participant_id = p.id and s.is_correct)
        )
        order by p.display_name, p.id
      )
      from public.participants p
      left join public.teams tm on tm.id = p.team_id
      where p.race_id = p_race_id and p.role = 'student'
    ), '[]'::jsonb),

    -- What happened, in order: start, every answer, every finish, end.
    -- Capped at the latest 2000 answers to keep the response small.
    'timeline', coalesce((
      select jsonb_agg(ev.item order by ev.at, ev.seq)
      from (
        select v_race.started_at as at, 0 as seq, jsonb_build_object('at', v_race.started_at, 'kind', 'start') as item
        where v_race.started_at is not null
        union all
        select * from (
          select
            s.submitted_at,
            1,
            jsonb_build_object(
              'at', s.submitted_at,
              'kind', 'answer',
              'teamName', tm.name,
              'participantName', p.display_name,
              'position', c.position,
              'checkpointTitle', c.title,
              'correct', s.is_correct,
              'points', s.points
            )
          from public.task_submissions s
          join public.teams tm on tm.id = s.team_id
          join public.checkpoint_tasks k on k.id = s.task_id
          join public.checkpoints c on c.id = k.checkpoint_id
          left join public.participants p on p.id = s.participant_id
          where s.race_id = p_race_id
          order by s.submitted_at desc
          limit 2000
        ) answers
        union all
        select
          st.finished_at,
          2,
          jsonb_build_object('at', st.finished_at, 'kind', 'finish', 'teamName', tm.name, 'finishOrder', st.finish_order)
        from private.team_standings(p_race_id) st
        join public.teams tm on tm.id = st.team_id
        where st.finished_at is not null
        union all
        select v_race.finished_at, 3, jsonb_build_object('at', v_race.finished_at, 'kind', 'race_finish')
        where v_race.finished_at is not null
      ) ev
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_race_report(uuid) from public, anon;
grant execute on function public.get_race_report(uuid) to authenticated;
