-- Stage 11: the teacher controls who is in the race.
--
--   remove_participant(participant)          owner removes a student; that user cannot rejoin this race
--   set_join_locked(race, locked)            owner closes / opens joining by code
--   join_race(code, name)                    + closed and banned checks, + attempt limit,
--                                            unknown codes return null (see below)
--   get_lobby(race)                          + race.joinLocked
--   private.clean_text                       + strips invisible and direction-override characters
--   report_focus_leave(race)                 a student left the race tab while it runs: counted,
--                                            removed (and banned) on the 3rd time
--   get_lobby(race)                          + participants[].focusLeaves
--
-- Attempt limit: a failed lookup must be remembered, but an exception would roll the
-- record back, so an unknown code returns null instead of raising race_not_found
-- (the server action turns null into the same error). 20 unknown codes in 10 minutes
-- per user → too_many_attempts for the rest of the window.

-- ---------------------------------------------------------------------------
-- Names and titles: no zero-width, joiner or bidi-override characters
-- ---------------------------------------------------------------------------

create or replace function private.clean_text(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(
    regexp_replace(coalesce(p_value, ''), '[​-‏‪-‮⁠-⁤⁦-⁩﻿]', '', 'g'),
    '\s+', ' ', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table public.races add column join_locked boolean not null default false;

-- How many times the student left the race tab while the race was running.
alter table public.participants add column focus_leaves integer not null default 0
  check (focus_leaves between 0 and 3);

-- Users removed by the teacher: they cannot take a seat in that race again.
create table private.race_bans (
  race_id uuid not null references public.races (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (race_id, user_id)
);

-- Unknown codes per user, for the attempt limit. Old rows are pruned on insert.
create table private.join_attempts (
  user_id uuid not null,
  attempted_at timestamptz not null default now()
);
create index join_attempts_user_time on private.join_attempts (user_id, attempted_at);

revoke all on private.race_bans, private.join_attempts from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Teacher actions
-- ---------------------------------------------------------------------------

create function public.remove_participant(p_participant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_participant public.participants;
  v_race public.races;
begin
  select p.* into v_participant
  from public.participants p
  join public.races r on r.id = p.race_id
  where p.id = p_participant_id and r.created_by = private.require_user_id();

  if not found then
    perform private.fail('participant_not_found');
  end if;
  if v_participant.role <> 'student' then
    perform private.fail('cannot_assign_teacher');
  end if;

  v_race := private.lock_owned_race(v_participant.race_id);
  insert into private.race_bans (race_id, user_id)
  values (v_race.id, v_participant.user_id)
  on conflict do nothing;
  -- Answers already given stay in the report (task_submissions.participant_id → null).
  delete from public.participants where id = v_participant.id;
end;
$$;

create function public.set_join_locked(p_race_id uuid, p_locked boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_race public.races := private.lock_owned_race(p_race_id);
begin
  update public.races set join_locked = coalesce(p_locked, false) where id = v_race.id;
end;
$$;

-- A student's own report: the browser saw the race tab hidden while the race runs.
-- Browsers cannot stop a student from switching tabs, but they can tell; the 3rd
-- time the seat is removed like remove_participant does. Only the student can raise
-- their own count, so it cannot be used against classmates.
create function public.report_focus_leave(p_race_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user_id();
  v_participant public.participants;
  v_status public.race_status;
begin
  select status into v_status from public.races where id = p_race_id;
  select * into v_participant from public.participants
  where race_id = p_race_id and user_id = v_user_id and role = 'student'
  for update;
  if not found or v_status is distinct from 'running' then
    return jsonb_build_object('leaves', coalesce(v_participant.focus_leaves, 0), 'removed', false);
  end if;

  if v_participant.focus_leaves + 1 >= 3 then
    insert into private.race_bans (race_id, user_id) values (p_race_id, v_user_id) on conflict do nothing;
    delete from public.participants where id = v_participant.id;
    return jsonb_build_object('leaves', 3, 'removed', true);
  end if;
  update public.participants set focus_leaves = focus_leaves + 1 where id = v_participant.id;
  return jsonb_build_object('leaves', v_participant.focus_leaves + 1, 'removed', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- join_race
-- ---------------------------------------------------------------------------

create or replace function public.join_race(p_code text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user_id();
  v_code text := private.normalize_room_code(p_code);
  v_name text := private.clean_text(p_display_name);
  v_race public.races;
begin
  if (
    select count(*) from private.join_attempts
    where user_id = v_user_id and attempted_at > now() - interval '10 minutes'
  ) >= 20 then
    perform private.fail('too_many_attempts');
  end if;

  if v_code ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$' then
    select * into v_race from public.races where code = v_code;
  end if;
  if v_race.id is null then
    delete from private.join_attempts where attempted_at < now() - interval '1 hour';
    insert into private.join_attempts (user_id) values (v_user_id);
    return null;
  end if;

  if v_race.status = 'finished' then
    perform private.fail('race_finished');
  end if;
  if exists (select 1 from private.race_bans where race_id = v_race.id and user_id = v_user_id) then
    perform private.fail('join_closed');
  end if;

  -- Re-join (reload, second tab, double submit): return the existing seat.
  if exists (
    select 1 from public.participants
    where race_id = v_race.id and user_id = v_user_id
  ) then
    return v_race.id;
  end if;

  if v_race.status = 'draft' then
    perform private.fail('race_not_open');
  end if;
  if v_race.join_locked then
    perform private.fail('join_closed');
  end if;
  if char_length(v_name) not between 2 and 30 or v_name ~ '[[:cntrl:]]' then
    perform private.fail('invalid_display_name');
  end if;
  if (
    select count(*) from public.participants
    where race_id = v_race.id and role = 'student'
  ) >= 200 then
    perform private.fail('race_full');
  end if;
  if exists (
    select 1 from public.participants
    where race_id = v_race.id and role = 'student' and lower(display_name) = lower(v_name)
  ) then
    perform private.fail('display_name_taken');
  end if;

  insert into public.participants (race_id, user_id, display_name, role)
  values (v_race.id, v_user_id, v_name, 'student');
  return v_race.id;
exception
  when unique_violation then
    if exists (
      select 1 from public.participants
      where race_id = v_race.id and user_id = v_user_id
    ) then
      return v_race.id;
    end if;
    perform private.fail('display_name_taken');
end;
$$;

-- ---------------------------------------------------------------------------
-- get_lobby: + race.joinLocked
-- ---------------------------------------------------------------------------

alter function public.get_lobby(uuid) rename to get_lobby_v7;
alter function public.get_lobby_v7(uuid) set schema private;
revoke all on function private.get_lobby_v7(uuid) from public, anon, authenticated;

create function public.get_lobby(p_race_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- Checks access and builds the Stage 7 snapshot.
  v_lobby jsonb := private.get_lobby_v7(p_race_id);
begin
  v_lobby := jsonb_set(
    v_lobby,
    '{race,joinLocked}',
    to_jsonb(coalesce((select join_locked from public.races where id = p_race_id), false))
  );
  return jsonb_set(
    v_lobby,
    '{participants}',
    coalesce((
      select jsonb_agg(e.p || jsonb_build_object('focusLeaves', coalesce(pp.focus_leaves, 0)) order by e.ord)
      from jsonb_array_elements(coalesce(v_lobby -> 'participants', '[]'::jsonb)) with ordinality as e(p, ord)
      left join public.participants pp on pp.id = (e.p ->> 'id')::uuid
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_lobby(uuid) from public, anon;
grant execute on function public.get_lobby(uuid) to authenticated;

revoke all on function public.remove_participant(uuid) from public, anon;
revoke all on function public.set_join_locked(uuid, boolean) from public, anon;
revoke all on function public.join_race(text, text) from public, anon;
revoke all on function public.report_focus_leave(uuid) from public, anon;
grant execute on function public.report_focus_leave(uuid) to authenticated;
grant execute on function public.remove_participant(uuid) to authenticated;
grant execute on function public.set_join_locked(uuid, boolean) to authenticated;
grant execute on function public.join_race(text, text) to authenticated;
