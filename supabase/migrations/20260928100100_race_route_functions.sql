-- Bilim Arena Race — Stage 2: trusted route operations.
--
--   create_race(title, description, checkpoints)  route is created with the race
--   advance_team(team, to_position)               the only way to move a team
--   get_lobby(race)                               snapshot now includes the route
--                                                 and every team's position
--
-- Same conventions as Stage 1: security definer, search_path = '', errors are
-- SQLSTATE P0001 with a snake_case code, execution granted to authenticated.

-- ---------------------------------------------------------------------------
-- create_race: now also writes the route
-- ---------------------------------------------------------------------------

-- The signature changes (new parameter), so the Stage 1 function is replaced.
drop function public.create_race(text, text);

-- p_checkpoints: checkpoint titles in route order (1–20). Positions are
-- assigned here from that order; clients never send positions. When omitted
-- (Stage 1 clients) the default 3-checkpoint route is used.
create function public.create_race(
  p_title text,
  p_description text default null,
  p_checkpoints text[] default null
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

revoke all on function public.create_race(text, text, text[]) from public, anon;
grant execute on function public.create_race(text, text, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- advance_team: N → N+1 only
-- ---------------------------------------------------------------------------

-- Moves the caller's team to p_to_position, which must be exactly the next
-- point. Asking for the position the team already holds is a no-op
-- (double click, retry after a lost response, a teammate was faster), so a
-- team can never skip a point. Only students seated in the team may move it,
-- and only while the race is running.
create function public.advance_team(p_team_id uuid, p_to_position integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user_id();
  v_race_id uuid;
  v_status public.race_status;
  v_team public.teams;
  v_finish integer;
  v_moved boolean := false;
begin
  select race_id into v_race_id from public.teams where id = p_team_id;
  if not found then
    perform private.fail('team_not_found');
  end if;

  -- Lock order race → team, like the Stage 1 team functions (no deadlocks).
  -- FOR SHARE waits for a concurrent start_race / finish_race and blocks
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

  -- Same answer for "no such team" and "not your team".
  if not found then
    perform private.fail('team_not_found');
  end if;

  if v_status = 'finished' then
    perform private.fail('race_finished');
  end if;
  if v_status <> 'running' then
    perform private.fail('race_not_started');
  end if;

  select position into v_finish
  from public.checkpoints
  where race_id = v_race_id and type = 'finish';

  if p_to_position is distinct from v_team.current_position then
    if v_team.current_position >= v_finish then
      perform private.fail('team_finished');
    end if;
    if p_to_position is null or p_to_position <> v_team.current_position + 1 then
      perform private.fail('invalid_move');
    end if;

    update public.teams
    set current_position = p_to_position
    where id = v_team.id
    returning * into v_team;
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

revoke all on function public.advance_team(uuid, integer) from public, anon;
grant execute on function public.advance_team(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- get_lobby: + route, + team positions
-- ---------------------------------------------------------------------------

-- Same checks and shape as Stage 1, extended with "route" and teams[].position.
-- Every member sees the whole route and every team's position (the race map).
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
    'route', coalesce((
      select jsonb_agg(
        jsonb_build_object('position', c.position, 'title', c.title, 'type', c.type)
        order by c.position
      )
      from public.checkpoints c
      where c.race_id = p_race_id
    ), '[]'::jsonb),
    'teams', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'memberCount', (select count(*) from public.participants p where p.team_id = t.id),
          'position', t.current_position
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

-- Realtime: moving a team updates public.teams, which already broadcasts
-- "lobby_changed" on race:<id> (Stage 1 trigger). The route never changes
-- after creation, so checkpoints need no trigger.
