-- Bilim Arena Race — Stage 1: realtime lobby.
--
-- Changes to races / teams / participants are announced on the private
-- Broadcast channel "race:<race_id>". The payload is only a signal
-- ({ table, op }); clients re-read the lobby through public.get_lobby(), which
-- applies the caller's permissions. Nothing sensitive travels over the socket.
--
-- Only the race owner and its participants may subscribe to the channel.
-- There is deliberately no INSERT policy on realtime.messages for the race
-- topics: browsers cannot broadcast fake "lobby_changed" events.

create function private.broadcast_lobby_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  -- tg_argv[0] names the column that holds the race id ('id' for races).
  v_race_id text := v_row ->> tg_argv[0];
begin
  -- A notification must never roll back the lobby change itself: clients also
  -- re-read the lobby on reconnect and focus, so a lost signal self-heals.
  begin
    perform realtime.send(
      jsonb_build_object('table', tg_table_name, 'op', lower(tg_op)),
      'lobby_changed',
      'race:' || v_race_id,
      true
    );
  exception when others then
    raise warning 'lobby_changed broadcast failed for race %: %', v_race_id, sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function private.broadcast_lobby_change() from public;

create trigger races_broadcast_lobby_change
  after insert or update or delete on public.races
  for each row execute function private.broadcast_lobby_change('id');

create trigger teams_broadcast_lobby_change
  after insert or update or delete on public.teams
  for each row execute function private.broadcast_lobby_change('race_id');

create trigger participants_broadcast_lobby_change
  after insert or update or delete on public.participants
  for each row execute function private.broadcast_lobby_change('race_id');

-- Channel authorization: topic "race:<uuid>" is readable by the race owner and
-- its participants only. Any other topic shape is rejected.
create function private.can_access_race_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_race_id uuid;
begin
  if p_topic is null
     or p_topic !~ '^race:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_race_id := substr(p_topic, 6)::uuid;
  return private.is_race_owner(v_race_id) or private.is_race_participant(v_race_id);
end;
$$;

revoke all on function private.can_access_race_topic(text) from public;
grant execute on function private.can_access_race_topic(text) to authenticated;

create policy "Race members can receive race broadcasts"
  on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and private.can_access_race_topic((select realtime.topic()))
  );
