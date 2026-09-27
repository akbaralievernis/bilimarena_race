-- Minimal stand-in for the parts of a Supabase database that the migrations
-- rely on, so they can run inside PGlite for tests. It mirrors Supabase's
-- behaviour where it matters for security:
--   * roles anon / authenticated / service_role;
--   * auth.uid() / auth.jwt() read the request JWT claims exactly like Supabase;
--   * Supabase's default privileges: ALL on new public tables and functions is
--     granted to anon and authenticated (migrations must revoke explicitly);
--   * realtime.send() / realtime.topic() / realtime.messages with RLS enabled.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

-- auth ----------------------------------------------------------------------

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text,
  is_anonymous boolean not null default false,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create function auth.uid() returns uuid
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;
grant execute on function auth.jwt() to anon, authenticated, service_role;

-- realtime ------------------------------------------------------------------

create schema realtime;
grant usage on schema realtime to anon, authenticated, service_role;

create table realtime.messages (
  id bigserial primary key,
  topic text not null,
  extension text not null,
  payload jsonb,
  event text,
  private boolean default false,
  inserted_at timestamptz not null default now()
);

alter table realtime.messages enable row level security;
grant select, insert on realtime.messages to anon, authenticated;
grant usage on sequence realtime.messages_id_seq to anon, authenticated;

create function realtime.topic() returns text
language sql stable
as $$
  select nullif(current_setting('realtime.topic', true), '')
$$;

grant execute on function realtime.topic() to anon, authenticated, service_role;

create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void
language plpgsql
as $$
begin
  insert into realtime.messages (payload, event, topic, private, extension)
  values (payload, event, topic, private, 'broadcast');
end;
$$;
