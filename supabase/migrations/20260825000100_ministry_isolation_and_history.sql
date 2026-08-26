-- Walking skeleton: Ministries and access, append-only history, and the outbound queue.
--
-- Two invariants are enforced here in the database rather than in application code,
-- because both fail silently if they are only enforced by convention:
--   1. No Ministry's data is ever readable by another Ministry (row-level security).
--   2. History is append-only -- new facts never overwrite old ones (triggers).

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Ministries and who may reach them
-- ---------------------------------------------------------------------------

create table ministry (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) > 0),
  created_at  timestamptz not null default now()
);

-- Two access tiers only. `Coordinator`, `staff` and `pastor team` all name Admin
-- and must not become separate tiers.
create type access_tier as enum ('admin', 'leader');

create table ministry_member (
  id           uuid primary key default gen_random_uuid(),
  ministry_id  uuid not null references ministry (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  tier         access_tier not null,
  created_at   timestamptz not null default now(),
  unique (ministry_id, user_id)
);

create index ministry_member_user_id_idx on ministry_member (user_id);

-- Membership lookup for policies. SECURITY DEFINER so the policy on
-- ministry_member does not have to consult ministry_member to evaluate itself.
create function app.is_member_of(target_ministry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.ministry_member m
    where m.ministry_id = target_ministry_id
      and m.user_id = (select auth.uid())
  );
$$;

revoke execute on function app.is_member_of(uuid) from public;
grant execute on function app.is_member_of(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Roster
-- ---------------------------------------------------------------------------

-- Being on the Roster is not consent and is not readiness to pair; Participation
-- Status is derived from Intake and pairing, never stored as a flag here.
create table person (
  id           uuid primary key default gen_random_uuid(),
  ministry_id  uuid not null references ministry (id) on delete cascade,
  full_name    text not null check (length(btrim(full_name)) > 0),
  created_at   timestamptz not null default now()
);

create index person_ministry_id_idx on person (ministry_id);

-- ---------------------------------------------------------------------------
-- History -- append-only
-- ---------------------------------------------------------------------------

-- `occurred_at` comes from the domain's injected clock; `recorded_at` is when the
-- row landed. They differ whenever a command is replayed or a tick runs against an
-- advanced clock, and the distinction is why a late reply can attach to the
-- question it answers without rewriting an earlier week as answered.
create table ministry_event (
  id            uuid primary key default gen_random_uuid(),
  ministry_id   uuid not null references ministry (id) on delete cascade,
  occurred_at   timestamptz not null,
  recorded_at   timestamptz not null default now(),
  type          text not null check (length(btrim(type)) > 0),
  subject_type  text not null check (length(btrim(subject_type)) > 0),
  subject_id    uuid,
  payload       jsonb not null default '{}'::jsonb
);

create index ministry_event_ministry_occurred_idx
  on ministry_event (ministry_id, occurred_at desc, recorded_at desc);

create function app.reject_history_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'ministry_event is append-only: % is not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;

-- Triggers rather than grants alone: a privileged connection (migrations, the
-- service role, a psql session) bypasses row-level security but not these.
create trigger ministry_event_no_update
  before update on ministry_event
  for each row execute function app.reject_history_mutation();

create trigger ministry_event_no_delete
  before delete on ministry_event
  for each row execute function app.reject_history_mutation();

-- TRUNCATE fires truncate triggers, not delete triggers, and is not filtered by
-- row-level security either. Without this a single statement would erase a
-- Ministry's entire history past both of the guards above.
create trigger ministry_event_no_truncate
  before truncate on ministry_event
  for each statement execute function app.reject_history_mutation();

-- ---------------------------------------------------------------------------
-- Outbound queue
-- ---------------------------------------------------------------------------

-- Every outbound message leaves through this one queue, so the recipient-level
-- send checks have exactly one place to live. Delivery vendors sit behind it.
create table outbound_message (
  id            uuid primary key default gen_random_uuid(),
  ministry_id   uuid not null references ministry (id) on delete cascade,
  person_id     uuid references person (id) on delete set null,
  to_phone      text,
  body          text not null check (length(btrim(body)) > 0),
  enqueued_at   timestamptz not null,
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index outbound_message_ministry_idx on outbound_message (ministry_id, enqueued_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table ministry         enable row level security;
alter table ministry_member  enable row level security;
alter table person           enable row level security;
alter table ministry_event   enable row level security;
alter table outbound_message enable row level security;

alter table ministry         force row level security;
alter table ministry_member  force row level security;
alter table person           force row level security;
alter table ministry_event   force row level security;
alter table outbound_message force row level security;

create policy ministry_read_own on ministry
  for select to authenticated
  using (app.is_member_of(id));

create policy ministry_member_read_own on ministry_member
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy person_read_own_ministry on person
  for select to authenticated
  using (app.is_member_of(ministry_id));

create policy ministry_event_read_own_ministry on ministry_event
  for select to authenticated
  using (app.is_member_of(ministry_id));

create policy outbound_message_read_own_ministry on outbound_message
  for select to authenticated
  using (app.is_member_of(ministry_id));

-- Writes arrive through the command boundary on a trusted connection, never from
-- a browser session. No INSERT/UPDATE/DELETE policy is granted to `authenticated`,
-- so the absence of a policy denies those verbs by default.

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

-- Start from nothing rather than from whatever the platform's default privileges
-- happen to grant. Those defaults hand `anon` TRUNCATE, REFERENCES and TRIGGER on
-- every new table in this schema -- and TRUNCATE is filtered neither by row-level
-- security nor by a delete trigger.
revoke all on ministry, ministry_member, person, ministry_event, outbound_message
  from anon, authenticated, service_role;

grant usage on schema app to authenticated, service_role;

-- A browser session gets SELECT and nothing else. With the policies above that is
-- two independent barriers between a signed-in Admin and another Ministry's data:
-- no grant to write, and no policy that would permit the read.
grant select on ministry, ministry_member, person, ministry_event, outbound_message
  to authenticated;

-- Writes arrive on a trusted connection, through the command boundary.
grant select, insert, update, delete
  on ministry, ministry_member, person, outbound_message
  to service_role;

-- History is never updated, deleted or truncated by anyone.
grant select, insert on ministry_event to service_role;

-- `anon` is deliberately granted nothing: a signed-out visitor sees no Ministry.

-- ---------------------------------------------------------------------------
-- The command boundary's own role
-- ---------------------------------------------------------------------------

-- Writes arrive on a trusted connection, and a trusted connection is usually a
-- superuser one -- which bypasses row-level security entirely. That would leave
-- write-side isolation resting on the application remembering to pass the right
-- ministry_id on every statement, which is the failure mode ADR-0002 rejects when
-- it declines application-layer scoping.
--
-- So the command boundary drops into a role that cannot bypass RLS, and declares
-- which Ministry it is acting for. A command handling Riverside cannot write a row
-- belonging to Northgate even if it tries.
-- Roles are cluster-scoped rather than database-scoped, so unlike every other
-- statement in this file a bare `create role` cannot be replayed against a second
-- database in the same cluster -- a Supabase preview branch, say, which shares one.
do $$
begin
  if not exists (select from pg_catalog.pg_roles where rolname = 'discipler_command') then
    create role discipler_command nologin;
  end if;
end
$$;

grant discipler_command to postgres;

grant usage on schema app, public to discipler_command;

create function app.command_ministry_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('discipler.ministry_id', true), '')::uuid;
$$;

grant execute on function app.command_ministry_id() to discipler_command;

grant select, insert, update, delete on person, outbound_message to discipler_command;
grant select, insert on ministry_event to discipler_command;
grant select on ministry, ministry_member to discipler_command;

alter table ministry         force row level security;
alter table ministry_member  force row level security;

create policy ministry_command_read on ministry
  for select to discipler_command
  using (id = app.command_ministry_id());

create policy ministry_member_command_read on ministry_member
  for select to discipler_command
  using (ministry_id = app.command_ministry_id());

create policy person_command on person
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

create policy outbound_message_command on outbound_message
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

create policy ministry_event_command_read on ministry_event
  for select to discipler_command
  using (ministry_id = app.command_ministry_id());

create policy ministry_event_command_append on ministry_event
  for insert to discipler_command
  with check (ministry_id = app.command_ministry_id());
