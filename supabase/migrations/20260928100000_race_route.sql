-- Bilim Arena Race — Stage 2: race route and team positions.
--
-- Route model: every race has an ordered list of points
--   position 0      START       (type 'start')
--   positions 1..N  checkpoints (type 'checkpoint'), 1 ≤ N ≤ 20
--   position N+1    FINISH      (type 'finish')
-- A team's position is the index of the point it stands on (0 = START).
--
-- Same security model as Stage 1: clients get column-limited SELECT only;
-- the route is written by create_race() and positions by advance_team()
-- (20260928100100_race_route_functions.sql). The route is immutable once
-- created.

create type public.checkpoint_type as enum ('start', 'checkpoint', 'finish');

create table public.checkpoints (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  position integer not null,
  title text not null,
  type public.checkpoint_type not null,
  created_at timestamptz not null default now(),
  -- One point per position: the route is strictly ordered.
  constraint checkpoints_race_position_key unique (race_id, position),
  constraint checkpoints_position_non_negative check (position >= 0),
  constraint checkpoints_start_is_first check ((type = 'start') = (position = 0)),
  constraint checkpoints_title_valid check (
    title = btrim(title) and char_length(title) between 1 and 60 and title !~ '[[:cntrl:]]'
  )
);

create unique index checkpoints_one_finish_per_race on public.checkpoints (race_id) where type = 'finish';

-- Route names used for races created without an explicit route (Stage 1
-- clients) and for races that existed before this migration.
create function private.default_checkpoint_titles()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['Чекпоинт 1', 'Чекпоинт 2', 'Чекпоинт 3'];
$$;

-- Writes START, the given checkpoints (already validated) and FINISH.
create function private.insert_route(p_race_id uuid, p_titles text[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.checkpoints (race_id, position, title, type)
  values (p_race_id, 0, 'Старт', 'start');

  insert into public.checkpoints (race_id, position, title, type)
  select p_race_id, item.ordinality::integer, item.title, 'checkpoint'
  from unnest(p_titles) with ordinality as item (title, ordinality);

  insert into public.checkpoints (race_id, position, title, type)
  values (p_race_id, cardinality(p_titles) + 1, 'Финиш', 'finish');
end;
$$;

revoke all on function private.default_checkpoint_titles() from public;
revoke all on function private.insert_route(uuid, text[]) from public;

-- Races created in Stage 1 get the default route.
select private.insert_route(r.id, private.default_checkpoint_titles())
from public.races r
where not exists (select 1 from public.checkpoints c where c.race_id = r.id);

-- ---------------------------------------------------------------------------
-- Route integrity (checked at commit, so a route can be written row by row)
-- ---------------------------------------------------------------------------

-- A race must have exactly: START at 0, 1–20 checkpoints, FINISH last, no gaps.
create function private.assert_valid_route()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  -- tg_argv[0] names the column holding the race id ('id' for races).
  v_race_id uuid := (v_row ->> tg_argv[0])::uuid;
  v_count integer;
  v_last integer;
  v_finish integer;
begin
  -- The race itself was deleted in this transaction: nothing left to check.
  if not exists (select 1 from public.races where id = v_race_id) then
    return null;
  end if;

  select count(*), max(position) into v_count, v_last
  from public.checkpoints where race_id = v_race_id;
  select position into v_finish
  from public.checkpoints where race_id = v_race_id and type = 'finish';

  -- Unique positions >= 0 with count = last + 1 means exactly 0..last;
  -- position 0 is START by the table check.
  if v_count not between 3 and 22 or v_last <> v_count - 1 or v_finish is distinct from v_last then
    raise exception using errcode = 'P0001', message = 'invalid_route';
  end if;
  return null;
end;
$$;

revoke all on function private.assert_valid_route() from public;

create constraint trigger checkpoints_valid_route
  after insert or update or delete on public.checkpoints
  deferrable initially deferred
  for each row execute function private.assert_valid_route('race_id');

-- Every race gets its route in the same transaction that creates it.
create constraint trigger races_have_route
  after insert on public.races
  deferrable initially deferred
  for each row execute function private.assert_valid_route('id');

-- ---------------------------------------------------------------------------
-- Team position
-- ---------------------------------------------------------------------------

alter table public.teams
  add column current_position integer not null default 0,
  add constraint teams_current_position_non_negative check (current_position >= 0),
  -- The position must be a point of this race's route: beyond FINISH or in
  -- another race is impossible. Deferred so cascading deletes of a race can
  -- remove teams and route in any order.
  add constraint teams_position_on_route_fkey foreign key (race_id, current_position)
    references public.checkpoints (race_id, position)
    deferrable initially deferred;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.checkpoints enable row level security;

-- Supabase grants ALL on new public tables by default: take it back.
revoke all on table public.checkpoints from anon, authenticated;
grant select (id, race_id, position, title, type, created_at) on public.checkpoints to authenticated;

-- Position is readable like the rest of the team row; it is never writable.
grant select (current_position) on public.teams to authenticated;

create policy "Owners and participants can read the race route"
  on public.checkpoints for select to authenticated
  using (private.is_race_owner(race_id) or private.is_race_participant(race_id));

-- No INSERT / UPDATE / DELETE policies: the route is written only by
-- create_race() and team positions only by advance_team().
