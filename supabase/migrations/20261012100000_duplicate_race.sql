-- Bilim Arena Race — Stage 9: run a race again.
--
--   duplicate_race(race)   owner only: a new race in the lobby with a new room
--                          code — same title, description, route, tasks (with
--                          their correct answers), time limit and team names.
--                          Participants, answers and results are not copied.
--
-- The copy goes through create_race(), so it gets every check and default of
-- a race created by hand (limits, room code, the teacher's participant row).
-- Correct answers are read from private.checkpoint_task_keys inside the
-- function and never leave the database.

create function public.duplicate_race(p_race_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user_id();
  v_race public.races;
  v_titles text[];
  v_checkpoints integer;
  v_tasks jsonb;
  v_task_count integer;
  v_new_id uuid;
begin
  select * into v_race from public.races where id = p_race_id;
  -- "No such race" and "not your race" look the same on purpose.
  if not found or v_race.created_by <> v_user_id then
    perform private.fail('race_not_found');
  end if;

  select array_agg(c.title order by c.position), count(*)
  into v_titles, v_checkpoints
  from public.checkpoints c
  where c.race_id = p_race_id and c.type = 'checkpoint';

  select
    jsonb_agg(
      case when k.type = 'single_choice' then
        jsonb_build_object('type', 'single_choice', 'question', k.question, 'options', k.options, 'correctOption', key.correct_option)
      else
        jsonb_build_object('type', 'short_answer', 'question', k.question, 'correctAnswer', key.correct_answer)
      end
      order by c.position
    ),
    count(*)
  into v_tasks, v_task_count
  from public.checkpoint_tasks k
  join public.checkpoints c on c.id = k.checkpoint_id
  join private.checkpoint_task_keys key on key.task_id = k.id
  where k.race_id = p_race_id;

  -- A Stage 2 race (button moves, no tasks) is copied as a route only.
  if v_task_count <> v_checkpoints then
    v_tasks := null;
  end if;

  v_new_id := public.create_race(v_race.title, v_race.description, v_titles, v_tasks);

  update public.races set time_limit_seconds = v_race.time_limit_seconds where id = v_new_id;

  insert into public.teams (race_id, name)
  select v_new_id, t.name
  from public.teams t
  where t.race_id = p_race_id
  order by t.created_at, t.id;

  return v_new_id;
end;
$$;

revoke all on function public.duplicate_race(uuid) from public, anon;
grant execute on function public.duplicate_race(uuid) to authenticated;
