-- Roles are relationship memberships, and Leaders reach only what they lead.
--
-- Three invariants are enforced here rather than in application code, for the same
-- reason as the first migration's two: each of them fails silently otherwise.
--   1. A membership's Person and its relationship belong to the same Ministry.
--   2. The participation caps hold -- one open group per Leader, one open
--      one-to-one per Participant.
--   3. A Leader reads only the relationships they lead, and only the people in them.
--
-- Nothing here stores a role on a Person, and nothing here stores a status. Role is
-- a membership; Participation Status and Relationship State are derived.

-- ---------------------------------------------------------------------------
-- The Person gains an account link and lead eligibility
-- ---------------------------------------------------------------------------

-- The Person is the human; the account is optional and hangs off them. Every Leader
-- who signs in has a Person row in that Ministry -- one without is an error, not a
-- supported state -- and `ministry_member` stays what it was: an access level, and
-- nothing about who leads a relationship.
alter table person
  add column user_id          uuid references auth.users (id) on delete set null,
  add column eligible_to_lead boolean not null default false;

create unique index person_ministry_user_uniq
  on person (ministry_id, user_id) where user_id is not null;

create index person_user_id_idx on person (user_id) where user_id is not null;

-- Referenced by relationship_member's composite foreign key, which is what carries
-- Ministry isolation onto membership rows declaratively.
alter table person add constraint person_id_ministry_uniq unique (id, ministry_id);

comment on column person.eligible_to_lead is
  'An Admin''s judgement that this Person may lead. Independent of whether they have '
  'an account, of whether they have completed Intake, and of how many relationships '
  'they already lead. This is the same field as ticket 16''s intended role.';

-- ---------------------------------------------------------------------------
-- Relationships
-- ---------------------------------------------------------------------------

-- A capacity declaration, not a second entity. Readable by the participation-cap
-- constraints below and by the pairing scorer, and by nothing else: message copy and
-- state derivation follow the live participant count. See
-- docs/adr/0004-relationship-kind-as-capacity-declaration.md.
create type relationship_kind as enum ('one_to_one', 'group');

create type member_role as enum ('leader', 'participant');

-- No status column. Lifecycle is derived from these two timestamps, and Relationship
-- State proper is derived from ministry_event -- neither is stored.
create table relationship (
  id           uuid primary key default gen_random_uuid(),
  ministry_id  uuid not null references ministry (id) on delete cascade,
  kind         relationship_kind not null,
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  ended_at     timestamptz,
  ended_reason text,

  -- Ticket 13: an ending always carries a recorded reason, so the Ministry can tell
  -- later whether a relationship completed or broke down.
  constraint relationship_ended_carries_reason
    check (ended_at is null or length(btrim(coalesce(ended_reason, ''))) > 0),
  constraint relationship_ended_after_accepted
    check (ended_at is null or accepted_at is null or ended_at >= accepted_at),

  -- The target of relationship_member's composite foreign key. Redundant against the
  -- primary key and deliberate: it is what makes both the Ministry check and the
  -- kind copy declarative rather than trigger-enforced.
  constraint relationship_id_ministry_kind_uniq unique (id, ministry_id, kind)
);

create index relationship_ministry_idx on relationship (ministry_id);

-- kind is immutable. The composite foreign key propagates it to every membership, so
-- an update would describe periods that ended under the old value as though they had
-- always been the new one. Converting a one-to-one into a group means ending it and
-- forming a new one, which is also what the history should say happened.
create function app.reject_kind_change()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'relationship.kind is immutable: % cannot become %', old.kind, new.kind
    using errcode = 'restrict_violation';
end;
$$;

create trigger relationship_kind_immutable
  before update of kind on relationship
  for each row when (old.kind is distinct from new.kind)
  execute function app.reject_kind_change();

-- ---------------------------------------------------------------------------
-- Membership -- where role actually lives
-- ---------------------------------------------------------------------------

-- A dated join. `ended_at` says *when* someone left, which a boolean cannot, and the
-- Week-by-Week History needs it to attribute each week to the membership that was
-- open at the time.
--
-- The primary key is a surrogate rather than (relationship_id, person_id) so that a
-- Participant who leaves and is readmitted gets a second row. Under a composite key
-- the readmission collides with the closed row, and the only escapes are reopening
-- the old membership, which rewrites history, or a second relationship, which
-- fragments it.
create table relationship_member (
  id              uuid primary key default gen_random_uuid(),
  ministry_id     uuid not null,
  relationship_id uuid not null,
  kind            relationship_kind not null,
  person_id       uuid not null,
  role            member_role not null,
  started_at      timestamptz not null,
  ended_at        timestamptz,

  constraint relationship_member_ends_after_it_starts
    check (ended_at is null or ended_at >= started_at),

  -- Ministry isolation, declared rather than triggered: the membership, the
  -- relationship it is on, and the Person it is for must all name the same Ministry.
  -- Writes arrive on a trusted connection that row-level security cannot police on
  -- its own, so this has to hold in the keys.
  constraint relationship_member_relationship_fk
    foreign key (relationship_id, ministry_id, kind)
    references relationship (id, ministry_id, kind) on delete cascade,
  constraint relationship_member_person_fk
    foreign key (person_id, ministry_id)
    references person (id, ministry_id) on delete restrict
);

create index relationship_member_relationship_idx
  on relationship_member (relationship_id);
create index relationship_member_person_idx
  on relationship_member (person_id) where ended_at is null;

-- One open membership per Person per relationship, in one role. Pairing someone with
-- themselves collides with their own row rather than producing a relationship where
-- one person is both sides of it.
create unique index relationship_member_one_open_per_person
  on relationship_member (relationship_id, person_id) where ended_at is null;

-- Exactly one Leader at a time. Leading many relationships stays unconstrained.
create unique index relationship_one_open_leader
  on relationship_member (relationship_id) where role = 'leader' and ended_at is null;

-- The participation caps. Both are conditioned on kind, which is why kind is stored.
create unique index leader_one_open_group
  on relationship_member (person_id)
  where role = 'leader' and kind = 'group' and ended_at is null;

create unique index participant_one_open_one_to_one
  on relationship_member (person_id)
  where role = 'participant' and kind = 'one_to_one' and ended_at is null;

-- ---------------------------------------------------------------------------
-- Who the caller is, and what they lead
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER throughout: these are consulted *by* the policies on the tables
-- they read, so a policed read here would recurse.

-- Admin is ministry-wide; Leader is not. `app.is_member_of` stays as it was, for the
-- things both tiers may see.
create function app.is_admin_of(target_ministry_id uuid)
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
      and m.tier = 'admin'
  );
$$;

-- Membership, not tier. An Admin who leads holds one ministry_member row and it says
-- `admin`, because unique (ministry_id, user_id) permits no second one -- so a
-- surface gated on tier = 'leader' would hide their own relationships from them.
create function app.leads_relationship(target_relationship_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.relationship_member m
    join public.person p on p.id = m.person_id
    where m.relationship_id = target_relationship_id
      and m.role = 'leader'
      and m.ended_at is null
      and p.user_id = (select auth.uid())
  );
$$;

-- The people the caller may see by virtue of leading: everyone in a relationship they
-- lead, themselves included. Being discipled contributes nothing -- a Participant's
-- membership grants them no sight of anyone, including the other Participants.
create function app.leads_person(target_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.relationship_member subject
    join public.relationship_member mine
      on mine.relationship_id = subject.relationship_id
    join public.person me on me.id = mine.person_id
    where subject.person_id = target_person_id
      and subject.ended_at is null
      and mine.role = 'leader'
      and mine.ended_at is null
      and me.user_id = (select auth.uid())
  );
$$;

revoke execute on function
  app.is_admin_of(uuid), app.leads_relationship(uuid), app.leads_person(uuid)
  from public;
grant execute on function
  app.is_admin_of(uuid), app.leads_relationship(uuid), app.leads_person(uuid)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table relationship        enable row level security;
alter table relationship_member enable row level security;
alter table relationship        force  row level security;
alter table relationship_member force  row level security;

-- The Roster is the Admin's view. Before this migration every member of a Ministry
-- could read every Person in it, which made ticket 06's promise -- a Leader sees only
-- their own relationships -- a claim held by application code alone.
drop policy person_read_own_ministry on person;

create policy person_read_own_ministry_admin on person
  for select to authenticated
  using (app.is_admin_of(ministry_id));

create policy person_read_self on person
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy person_read_led on person
  for select to authenticated
  using (app.leads_person(id));

-- History and the outbound queue are ministry-wide records. A Leader has no view
-- onto either; the Leader Dashboard carries no message history by design.
drop policy ministry_event_read_own_ministry on ministry_event;
drop policy outbound_message_read_own_ministry on outbound_message;

create policy ministry_event_read_own_ministry on ministry_event
  for select to authenticated
  using (app.is_admin_of(ministry_id));

create policy outbound_message_read_own_ministry on outbound_message
  for select to authenticated
  using (app.is_admin_of(ministry_id));

create policy relationship_read_own_ministry on relationship
  for select to authenticated
  using (app.is_admin_of(ministry_id) or app.leads_relationship(id));

create policy relationship_member_read_own_ministry on relationship_member
  for select to authenticated
  using (app.is_admin_of(ministry_id) or app.leads_relationship(relationship_id));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on relationship, relationship_member from anon, authenticated, service_role;

grant select on relationship, relationship_member to authenticated;

grant select, insert, update, delete
  on relationship, relationship_member to service_role;

grant select, insert, update, delete
  on relationship, relationship_member to discipler_command;

create policy relationship_command on relationship
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

create policy relationship_member_command on relationship_member
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());
