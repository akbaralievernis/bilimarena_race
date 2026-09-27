-- Bilim Arena Race — Stage 1: trusted operations.
--
-- Every write to races / teams / participants happens here. Each function is
-- security definer (runs as its owner, bypassing RLS) and therefore checks the
-- caller itself: authentication, ownership, race status and input.
--
-- Errors are raised with SQLSTATE P0001 and a stable snake_case message code
-- (e.g. 'race_not_found'); lib/race/errors.ts maps them to UI texts.

-- ---------------------------------------------------------------------------
-- Private helpers (not exposed through the Data API, not granted to clients)
-- ---------------------------------------------------------------------------

create function private.fail(p_code text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = p_code;
end;
$$;

create function private.require_user_id()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    perform private.fail('not_authenticated');
  end if;
  return v_user_id;
end;
$$;

create function private.is_anonymous_user()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

-- Collapses inner whitespace and trims.
create function private.clean_text(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g'));
$$;

-- Accepts user input like "a7k 9q2", "A7K-9Q2" or Cyrillic look-alikes typed on
-- a Russian keyboard layout ("А7К9Q2") and returns the canonical code.
create function private.normalize_room_code(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    upper(translate(
      coalesce(p_code, ''),
      'аАвВеЕкКмМнНоОрРсСтТхХуУ',
      'AABBEEKKMMHHOOPPCCTTXXYY'
    )),
    '[^0-9A-Z]', '', 'g'
  );
$$;

-- 6 characters from a 32-symbol alphabet without look-alikes (no 0/O, 1/I).
-- Randomness comes from gen_random_uuid(), which uses a cryptographically
-- strong generator; bytes 0-5 of a v4 UUID are fully random and 256 is a
-- multiple of 32, so every symbol is equally likely.
create function private.generate_room_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes bytea := uuid_send(gen_random_uuid());
  v_code text := '';
begin
  for i in 0..5 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_code;
end;
$$;

-- Locks a race owned by the caller. Missing and foreign races look the same,
-- so callers cannot probe which race ids exist.
create function private.lock_owned_race(p_race_id uuid)
returns public.races
language plpgsql
set search_path = ''
as $$
declare
  v_race public.races;
begin
  select * into v_race
  from public.races
  where id = p_race_id and created_by = private.require_user_id()
  for update;

  if not found then
    perform private.fail('race_not_found');
  end if;
  return v_race;
end;
$$;

-- Returns the race id of a team owned by the caller (locked for update).
create function private.lock_owned_team_race(p_team_id uuid)
returns public.races
language plpgsql
set search_path = ''
as $$
declare
  v_race_id uuid;
begin
  select t.race_id into v_race_id
  from public.teams t
  join public.races r on r.id = t.race_id
  where t.id = p_team_id and r.created_by = private.require_user_id();

  if not found then
    perform private.fail('team_not_found');
  end if;
  return private.lock_owned_race(v_race_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Races
-- ---------------------------------------------------------------------------

create function public.create_race(p_title text, p_description text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user_id();
  v_title text := private.clean_text(p_title);
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
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
  if (
    select count(*) from public.races
    where created_by = v_user_id and status <> 'finished'
  ) >= 50 then
    perform private.fail('too_many_active_races');
  end if;

  -- The code is generated here, never accepted from the client. A collision
  -- only triggers another attempt.
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

create function public.join_race(p_code text, p_display_name text)
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
  if v_code !~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$' then
    perform private.fail('race_not_found');
  end if;

  select * into v_race from public.races where code = v_code;
  if not found then
    perform private.fail('race_not_found');
  end if;
  if v_race.status = 'finished' then
    perform private.fail('race_finished');
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
    -- Two concurrent requests: the same user wins its own seat back,
    -- a different user lost the race for the name.
    if exists (
      select 1 from public.participants
      where race_id = v_race.id and user_id = v_user_id
    ) then
      return v_race.id;
    end if;
    perform private.fail('display_name_taken');
end;
$$;

create function public.start_race(p_race_id uuid)
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
  set status = 'running', started_at = now()
  where id = v_race.id;
end;
$$;

create function public.finish_race(p_race_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_race public.races := private.lock_owned_race(p_race_id);
begin
  if not private.can_transition(v_race.status, 'finished') then
    perform private.fail('invalid_status_transition');
  end if;
  update public.races
  set status = 'finished', finished_at = now()
  where id = v_race.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Teams
-- ---------------------------------------------------------------------------

create function public.create_team(p_race_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_race public.races := private.lock_owned_race(p_race_id);
  v_name text := private.clean_text(p_name);
  v_team_id uuid;
begin
  if v_race.status = 'finished' then
    perform private.fail('race_finished');
  end if;
  if char_length(v_name) not between 1 and 40 or v_name ~ '[[:cntrl:]]' then
    perform private.fail('invalid_team_name');
  end if;
  if (select count(*) from public.teams where race_id = v_race.id) >= 20 then
    perform private.fail('too_many_teams');
  end if;

  insert into public.teams (race_id, name)
  values (v_race.id, v_name)
  returning id into v_team_id;
  return v_team_id;
exception
  when unique_violation then
    perform private.fail('team_name_taken');
end;
$$;

create function public.rename_team(p_team_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_race public.races := private.lock_owned_team_race(p_team_id);
  v_name text := private.clean_text(p_name);
begin
  if v_race.status = 'finished' then
    perform private.fail('race_finished');
  end if;
  if char_length(v_name) not between 1 and 40 or v_name ~ '[[:cntrl:]]' then
    perform private.fail('invalid_team_name');
  end if;

  update public.teams set name = v_name where id = p_team_id;
exception
  when unique_violation then
    perform private.fail('team_name_taken');
end;
$$;

create function public.delete_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_race public.races := private.lock_owned_team_race(p_team_id);
begin
  if v_race.status = 'finished' then
    perform private.fail('race_finished');
  end if;
  if exists (select 1 from public.participants where team_id = p_team_id) then
    perform private.fail('team_not_empty');
  end if;

  delete from public.teams where id = p_team_id;
end;
$$;

-- p_team_id = null removes the participant from their team.
create function public.assign_participant(p_participant_id uuid, p_team_id uuid)
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
  if v_race.status = 'finished' then
    perform private.fail('race_finished');
  end if;
  if p_team_id is not null and not exists (
    select 1 from public.teams where id = p_team_id and race_id = v_race.id
  ) then
    perform private.fail('team_not_found');
  end if;

  update public.participants set team_id = p_team_id where id = p_participant_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

-- Lobby snapshot tailored to the caller. Students get their own seat and their
-- teammates only; internal auth ids are never returned.
create function public.get_lobby(p_race_id uuid)
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
    'teams', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'memberCount', (select count(*) from public.participants p where p.team_id = t.id)
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

-- Races created by the caller, newest first (teacher's "my races" list).
create function public.list_my_races()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'code', r.code,
      'title', r.title,
      'status', r.status,
      'createdAt', r.created_at
    )
    order by r.created_at desc
  ), '[]'::jsonb)
  from (
    select * from public.races
    where created_by = private.require_user_id()
    order by created_at desc
    limit 20
  ) r;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: only signed-in users (including anonymous students) may call
-- the public API; helpers stay internal.
-- ---------------------------------------------------------------------------

revoke all on function private.fail(text) from public;
revoke all on function private.require_user_id() from public;
revoke all on function private.is_anonymous_user() from public;
revoke all on function private.clean_text(text) from public;
revoke all on function private.normalize_room_code(text) from public;
revoke all on function private.generate_room_code() from public;
revoke all on function private.lock_owned_race(uuid) from public;
revoke all on function private.lock_owned_team_race(uuid) from public;

revoke all on function public.create_race(text, text) from public, anon;
revoke all on function public.join_race(text, text) from public, anon;
revoke all on function public.start_race(uuid) from public, anon;
revoke all on function public.finish_race(uuid) from public, anon;
revoke all on function public.create_team(uuid, text) from public, anon;
revoke all on function public.rename_team(uuid, text) from public, anon;
revoke all on function public.delete_team(uuid) from public, anon;
revoke all on function public.assign_participant(uuid, uuid) from public, anon;
revoke all on function public.get_lobby(uuid) from public, anon;
revoke all on function public.list_my_races() from public, anon;

grant execute on function public.create_race(text, text) to authenticated;
grant execute on function public.join_race(text, text) to authenticated;
grant execute on function public.start_race(uuid) to authenticated;
grant execute on function public.finish_race(uuid) to authenticated;
grant execute on function public.create_team(uuid, text) to authenticated;
grant execute on function public.rename_team(uuid, text) to authenticated;
grant execute on function public.delete_team(uuid) to authenticated;
grant execute on function public.assign_participant(uuid, uuid) to authenticated;
grant execute on function public.get_lobby(uuid) to authenticated;
grant execute on function public.list_my_races() to authenticated;
