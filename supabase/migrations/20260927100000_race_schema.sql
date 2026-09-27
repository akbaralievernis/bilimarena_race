-- Bilim Arena Race — Stage 1: races, teams, participants.
--
-- Security model:
--   * Clients never write these tables directly. INSERT/UPDATE/DELETE are
--     revoked from anon/authenticated, and there are no write policies.
--     Every mutation goes through the security-definer functions defined in
--     20260927100100_race_functions.sql, which check who is calling.
--   * Row Level Security limits direct reads to the race owner and the race's
--     participants. Internal auth ids (created_by, user_id) are not granted.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.race_status as enum ('draft', 'lobby', 'running', 'finished');
create type public.participant_role as enum ('teacher', 'student');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.races (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  title text not null,
  description text,
  status public.race_status not null default 'lobby',
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  constraint races_code_key unique (code),
  -- 6 characters, no look-alikes (0/O, 1/I).
  constraint races_code_format check (code ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$'),
  constraint races_title_valid check (
    title = btrim(title) and char_length(title) between 3 and 80 and title !~ '[[:cntrl:]]'
  ),
  constraint races_description_valid check (
    description is null
    or (description = btrim(description) and char_length(description) between 1 and 500)
  ),
  constraint races_finished_at_matches_status check ((status = 'finished') = (finished_at is not null))
);

create index races_created_by_idx on public.races (created_by);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint teams_name_valid check (
    name = btrim(name) and char_length(name) between 1 and 40 and name !~ '[[:cntrl:]]'
  ),
  -- Target of the composite foreign key from participants (team must be in the same race).
  constraint teams_race_id_id_key unique (race_id, id)
);

create unique index teams_race_name_key on public.teams (race_id, lower(name));

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races (id) on delete cascade,
  team_id uuid,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  role public.participant_role not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One participant row per user per race: re-joining never creates duplicates.
  constraint participants_race_user_key unique (race_id, user_id),
  -- A participant can only be in a team of the same race.
  constraint participants_team_in_same_race_fkey foreign key (race_id, team_id)
    references public.teams (race_id, id) on delete set null (team_id),
  constraint participants_display_name_valid check (
    display_name = btrim(display_name)
    and char_length(display_name) between 2 and 30
    and display_name !~ '[[:cntrl:]]'
  ),
  constraint participants_teacher_has_no_team check (role = 'student' or team_id is null)
);

create unique index participants_student_name_key
  on public.participants (race_id, lower(display_name)) where role = 'student';
create unique index participants_one_teacher_per_race
  on public.participants (race_id) where role = 'teacher';
create index participants_team_id_idx on public.participants (team_id);
create index participants_user_id_idx on public.participants (user_id);

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

-- Allowed status transitions. Mirrored in lib/race/status.ts for the UI;
-- this function is the authority.
create function private.can_transition(p_from public.race_status, p_to public.race_status)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_from, p_to) in (
    ('draft'::public.race_status, 'lobby'::public.race_status),
    ('lobby', 'running'),
    ('lobby', 'finished'),
    ('running', 'finished')
  );
$$;

create function private.guard_race_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.code is distinct from old.code or new.created_by is distinct from old.created_by then
    raise exception using errcode = 'P0001', message = 'immutable_field';
  end if;
  if new.status is distinct from old.status
     and not private.can_transition(old.status, new.status) then
    raise exception using errcode = 'P0001', message = 'invalid_status_transition';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger races_guard_update
  before update on public.races
  for each row execute function private.guard_race_update();

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger participants_set_updated_at
  before update on public.participants
  for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

-- Helpers are security definer to avoid recursive RLS checks. They live in the
-- private schema, which is not exposed through the Data API.
create function private.is_race_owner(p_race_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.races r
    where r.id = p_race_id and r.created_by = (select auth.uid())
  );
$$;

create function private.is_race_participant(p_race_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.participants p
    where p.race_id = p_race_id and p.user_id = (select auth.uid())
  );
$$;

create function private.my_team_id(p_race_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.team_id from public.participants p
  where p.race_id = p_race_id and p.user_id = (select auth.uid());
$$;

revoke all on function private.can_transition(public.race_status, public.race_status) from public;
revoke all on function private.is_race_owner(uuid) from public;
revoke all on function private.is_race_participant(uuid) from public;
revoke all on function private.my_team_id(uuid) from public;
grant execute on function private.is_race_owner(uuid) to authenticated;
grant execute on function private.is_race_participant(uuid) to authenticated;
grant execute on function private.my_team_id(uuid) to authenticated;

alter table public.races enable row level security;
alter table public.teams enable row level security;
alter table public.participants enable row level security;

-- Supabase grants ALL on new public tables to anon/authenticated by default.
-- Take everything back, then grant only column-limited reads.
revoke all on table public.races, public.teams, public.participants from anon, authenticated;

grant select (id, code, title, description, status, created_at, updated_at, started_at, finished_at)
  on public.races to authenticated;
grant select (id, race_id, name, created_at)
  on public.teams to authenticated;
grant select (id, race_id, team_id, display_name, role, created_at, updated_at)
  on public.participants to authenticated;

create policy "Owners and participants can read the race"
  on public.races for select to authenticated
  using (created_by = (select auth.uid()) or private.is_race_participant(id));

create policy "Owners and participants can read the race teams"
  on public.teams for select to authenticated
  using (private.is_race_owner(race_id) or private.is_race_participant(race_id));

create policy "Owners see everyone, students see themselves and teammates"
  on public.participants for select to authenticated
  using (
    private.is_race_owner(race_id)
    or user_id = (select auth.uid())
    or (team_id is not null and team_id = private.my_team_id(race_id))
  );

-- No INSERT / UPDATE / DELETE policies on purpose: see the header comment.
