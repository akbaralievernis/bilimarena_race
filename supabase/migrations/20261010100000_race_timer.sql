-- Bilim Arena Race — Stage 7: race timer.
--
--   races.time_limit_seconds   optional limit, 1–120 minutes, set by the teacher
--   races.ends_at              started_at + limit, fixed when the race starts
--   set_race_time_limit(race, seconds | null)   owner: set, change, extend, remove
--   finish_expired_race(race)  any member: closes the race once its time is up
--
-- When the time is up the database refuses every answer and move (trigger,
-- code race_time_over), so a late answer never counts even if nobody has
-- closed the race yet. The first phone whose countdown reaches zero calls
-- finish_expired_race(); finished_at is the planned end, not that moment.
--
-- get_lobby() is wrapped: the Stage 4 function moves to private.get_lobby_v4
-- unchanged and the public one adds race.timeLimitSeconds, race.endsAt and
-- race.remainingSeconds (server clock, so a phone with a wrong clock still
-- counts down correctly).

alter table public.races
  add column time_limit_seconds integer
    constraint races_time_limit_range check (time_limit_seconds between 60 and 7200),
  add column ends_at timestamptz;

-- ---------------------------------------------------------------------------
-- No answers and no moves after the end
-- ---------------------------------------------------------------------------

create function private.guard_race_clock()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_race public.races;
begin
  select * into v_race from public.races where id = new.race_id;
  if v_race.status = 'running' and v_race.ends_at is not null and v_race.ends_at <= now() then
    raise exception using errcode = 'P0001', message = 'race_time_over';
  end if;
  return new;
end;
$$;

create trigger task_submissions_guard_clock
  before insert on public.task_submissions
  for each row execute function private.guard_race_clock();

create trigger teams_guard_clock
  before update of current_position on public.teams
  for each row
  when (new.current_position is distinct from old.current_position)
  execute function private.guard_race_clock();

-- ---------------------------------------------------------------------------
-- Teacher: set the limit
-- ---------------------------------------------------------------------------

create function public.set_race_time_limit(p_race_id uuid, p_seconds integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_race public.races := private.lock_owned_race(p_race_id);
  v_ends_at timestamptz;
begin
  if v_race.status = 'finished' then
    perform private.fail('race_finished');
  end if;
  if p_seconds is not null and p_seconds not between 60 and 7200 then
    perform private.fail('invalid_time_limit');
  end if;

  if v_race.status = 'running' and p_seconds is not null then
    v_ends_at := v_race.started_at + make_interval(secs => p_seconds);
    -- A limit that is already over would end the race at once: refuse it.
    if v_ends_at <= now() then
      perform private.fail('invalid_time_limit');
    end if;
  end if;

  update public.races
  set time_limit_seconds = p_seconds,
      ends_at = case when status = 'running' then v_ends_at end
  where id = v_race.id;
end;
$$;

revoke all on function public.set_race_time_limit(uuid, integer) from public, anon;
grant execute on function public.set_race_time_limit(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- start_race: + ends_at
-- ---------------------------------------------------------------------------

create or replace function public.start_race(p_race_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_race public.races := private.lock_owned_race(p_race_id);
begin
  if not private.can_transition(v_race.status, 'running') then
    perform private.fail('invalid_status_transition');
  end if;
  update public.races
  set status = 'running',
      started_at = now(),
      ends_at = case when time_limit_seconds is not null then now() + make_interval(secs => time_limit_seconds) end
  where id = v_race.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Any member: close a race whose time is up
-- ---------------------------------------------------------------------------

create function public.finish_expired_race(p_race_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user_id();
  v_race public.races;
begin
  select * into v_race from public.races where id = p_race_id for update;
  if not found
     or (v_race.created_by <> v_user_id
         and not exists (select 1 from public.participants where race_id = p_race_id and user_id = v_user_id)) then
    perform private.fail('race_not_found');
  end if;

  if v_race.status <> 'running' or v_race.ends_at is null or v_race.ends_at > now() then
    return false;
  end if;

  update public.races
  set status = 'finished', finished_at = v_race.ends_at
  where id = v_race.id;
  return true;
end;
$$;

revoke all on function public.finish_expired_race(uuid) from public, anon;
grant execute on function public.finish_expired_race(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- get_lobby: + the race clock
-- ---------------------------------------------------------------------------

alter function public.get_lobby(uuid) rename to get_lobby_v4;
alter function public.get_lobby_v4(uuid) set schema private;
revoke all on function private.get_lobby_v4(uuid) from public, anon, authenticated;

create function public.get_lobby(p_race_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- Checks access and builds the Stage 4 snapshot.
  v_lobby jsonb := private.get_lobby_v4(p_race_id);
  v_race public.races;
begin
  select * into v_race from public.races where id = p_race_id;
  return jsonb_set(
    v_lobby,
    '{race}',
    (v_lobby -> 'race') || jsonb_build_object(
      'timeLimitSeconds', v_race.time_limit_seconds,
      'endsAt', v_race.ends_at,
      'remainingSeconds',
        case when v_race.status = 'running' and v_race.ends_at is not null
             then greatest(0, ceil(extract(epoch from (v_race.ends_at - now()))))::integer
        end
    )
  );
end;
$$;

revoke all on function public.get_lobby(uuid) from public, anon;
grant execute on function public.get_lobby(uuid) to authenticated;
