-- The Roster is populated by import, and Participation Status is derived from it.
--
-- Three facts arrive here, each of them an input the derivation cannot do without:
-- an Intake submission, a consent record, and an opt-out. Ticket 03 fills Intake and
-- consent out with what the form actually captures, and ticket 17 is what writes an
-- opt-out; what lands now is the identity of each fact and nothing more, because a
-- derivation over tables that do not exist cannot be written or tested.
--
-- Two invariants are enforced here rather than in application code, for the reason
-- the earlier migrations give: each fails silently otherwise.
--   1. A Person who has not completed Intake, or who has opted out, cannot be paired.
--   2. Nothing is sent to a Person who has not consented, or who has opted out.

-- ---------------------------------------------------------------------------
-- The Person gains the contact details an import carries
-- ---------------------------------------------------------------------------

-- Both are nullable: a Person can reach the Roster by routes other than an import --
-- an Admin's own Person row, ticket 18's dual-role case -- and those carry no
-- spreadsheet. The importer requires a number of its own accord, because everything
-- a Person ever receives from Discipler is SMS.
alter table person
  add column phone text,
  add column email text,
  add constraint person_phone_is_e164
    check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$'),
  add constraint person_email_shape
    check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');

-- A name and a number together identify a Person within a Ministry: that is what
-- lets a second upload of the same spreadsheet recognise who is already here rather
-- than filing everybody twice.
--
-- The number alone would be smaller and is wrong. A shared phone is ordinary -- a
-- married couple, a parent and a teenager -- and the per-phone serialisation this
-- product is built on exists precisely because a number may reach several people.
-- Keying on the number alone makes the second of them unrepresentable.
-- See docs/adr/0005-a-person-is-a-name-and-a-number.md.
--
-- Across Ministries it is deliberately not unique: one human may belong to two
-- congregations, and their two Person rows share nothing.
create unique index person_ministry_identity_uniq
  on person (ministry_id, phone, lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g')))
  where phone is not null;

comment on column person.phone is
  'E.164. The only channel Discipler reaches this Person on, and half of their '
  'identity within the Ministry -- the other half is their name, because a number '
  'may reach more than one of them. Sharing it is governed by contact-sharing '
  'consent, which is checked at send time and never assumed from enrolment.';

-- ---------------------------------------------------------------------------
-- Intake, consent, and opting out -- the inputs Participation Status reads
-- ---------------------------------------------------------------------------

-- Ticket 03 adds what the form captures: availability, the Discipleship Goal, age
-- band, gender, an optional email. What matters to the derivation is only that a
-- submission exists, so only that lands now.
create table intake_submission (
  id           uuid primary key default gen_random_uuid(),
  ministry_id  uuid not null,
  person_id    uuid not null,
  submitted_at timestamptz not null,
  created_at   timestamptz not null default now(),

  constraint intake_submission_person_fk
    foreign key (person_id, ministry_id) references person (id, ministry_id) on delete cascade
);

create index intake_submission_ministry_idx on intake_submission (ministry_id);
create index intake_submission_person_idx on intake_submission (person_id);

create type consent_kind as enum ('sms', 'contact_sharing');

-- Two separate decisions, each with its own timestamp and the version of the wording
-- the Person actually saw. A person can reasonably agree to hear from their church
-- and not agree to have their number handed to another congregant.
create table consent_record (
  id           uuid primary key default gen_random_uuid(),
  ministry_id  uuid not null,
  person_id    uuid not null,
  consent      consent_kind not null,
  version      text not null check (length(btrim(version)) > 0),
  granted_at   timestamptz not null,
  created_at   timestamptz not null default now(),

  constraint consent_record_person_fk
    foreign key (person_id, ministry_id) references person (id, ministry_id) on delete cascade
);

create index consent_record_ministry_idx on consent_record (ministry_id);
create index consent_record_person_idx on consent_record (person_id, consent);

-- Consent records are never migrated forward to a new version: each one keeps
-- pointing at the wording the Person saw. An update is therefore always a mistake,
-- and so is a TRUNCATE. DELETE is left alone so that removing a Ministry still
-- cascades; nothing else has the grant to attempt one.
create function app.reject_consent_rewrite()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'consent_record records what a Person agreed to and when: % is not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger consent_record_no_update
  before update on consent_record
  for each row execute function app.reject_consent_rewrite();

create trigger consent_record_no_truncate
  before truncate on consent_record
  for each statement execute function app.reject_consent_rewrite();

-- Dated rather than a flag, for the same reason membership is: `STOP` today and
-- `START` in six weeks are two facts, and a boolean can hold only the second. Ticket
-- 17 is what writes them.
create table person_opt_out (
  id           uuid primary key default gen_random_uuid(),
  ministry_id  uuid not null,
  person_id    uuid not null,
  started_at   timestamptz not null,
  ended_at     timestamptz,

  constraint person_opt_out_ends_after_it_starts
    check (ended_at is null or ended_at >= started_at),
  constraint person_opt_out_person_fk
    foreign key (person_id, ministry_id) references person (id, ministry_id) on delete cascade
);

create index person_opt_out_ministry_idx on person_opt_out (ministry_id);

create unique index person_one_open_opt_out
  on person_opt_out (person_id) where ended_at is null;

-- ---------------------------------------------------------------------------
-- Participation Status -- derived, in one place
-- ---------------------------------------------------------------------------

create type participation_status as enum (
  'no_intake_submitted',
  'ready_to_pair',
  'paired',
  'opted_out'
);

-- One function, and it answers one question: *is this person being discipled*.
-- Leading a relationship never sets it -- a Person leading two relationships and
-- discipled by nobody reads `ready_to_pair`, which is exactly the thing an Admin
-- should notice.
--
-- Written to take a `person` row rather than an id so that PostgREST exposes it as a
-- column on the Roster query: the read and the derivation stay one statement, and no
-- caller is able to fetch people and forget to ask for their status.
--
-- SECURITY DEFINER, because its inputs are readable by an Admin and not by a Leader,
-- and the status of someone you may see is not the same thing as their Intake. The
-- visibility test is therefore repeated here rather than borrowed from the tables it
-- reads: without it this function is a probe for the status of any Person in any
-- Ministry, which is precisely the leak the leader-scoped policies just closed.
create function public.participation_status(p public.person)
returns public.participation_status
language sql
stable
security definer
set search_path = ''
as $$
  select case
    -- `coalesce(..., false)`, and not for tidiness: `p.user_id = auth.uid()` is NULL
    -- rather than false for a Person with no account, and `not NULL` is NULL, which
    -- falls through the branch instead of refusing. Every Person on an imported
    -- Roster has no account, so the unguarded form denies nobody.
    when not coalesce(
      (select auth.uid()) is null
      or app.is_admin_of(p.ministry_id)
      or p.user_id = (select auth.uid())
      or app.leads_person(p.id),
      false
    ) then null

    when exists (
      select 1 from public.person_opt_out o
       where o.person_id = p.id and o.ended_at is null
    ) then 'opted_out'

    -- Being discipled, and nothing else. A paused relationship still counts, because
    -- the Person is still in it and is nobody else's to pair.
    when exists (
      select 1 from public.relationship_member m
       where m.person_id = p.id and m.role = 'participant' and m.ended_at is null
    ) then 'paired'

    -- Intake is one act producing two facts, and the pool requires both: a submission
    -- and SMS consent. A Person holding one without the other has not completed it.
    when not exists (select 1 from public.intake_submission i where i.person_id = p.id)
      or not exists (
        select 1 from public.consent_record c
         where c.person_id = p.id and c.consent = 'sms'
      ) then 'no_intake_submitted'

    else 'ready_to_pair'
  end::public.participation_status;
$$;

revoke execute on function public.participation_status(public.person) from public;
grant execute on function public.participation_status(public.person)
  to authenticated, service_role, discipler_command;

-- ---------------------------------------------------------------------------
-- An imported Person cannot be paired, and receives nothing
-- ---------------------------------------------------------------------------

-- Being on a Roster is not consent and is not a wish to participate. Enforced in the
-- database rather than in the pairing command, for the reason the participation caps
-- are: an application-side check holds only until the first write path that forgets
-- it, and this one guards against texting somebody who never agreed to hear from
-- their church at all.
create function app.reject_unready_participant()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  status public.participation_status;
begin
  if new.role <> 'participant' then return new; end if;

  select public.participation_status(p) into status
    from public.person p where p.id = new.person_id;

  if status = 'opted_out' then
    raise exception 'this Person has opted out and cannot be paired'
      using errcode = 'check_violation',
            constraint = 'relationship_member_participant_has_not_opted_out';
  end if;

  if status = 'no_intake_submitted' then
    raise exception 'this Person has not completed Intake and cannot be paired'
      using errcode = 'check_violation',
            constraint = 'relationship_member_participant_has_completed_intake';
  end if;

  return new;
end;
$$;

create trigger relationship_member_participant_is_ready
  before insert on relationship_member
  for each row execute function app.reject_unready_participant();

-- Discipler sends nothing to anyone whose record lacks SMS consent, and nothing
-- further to anyone who has opted out. This is the floor under ticket 03's send-time
-- checks, not a replacement for them: cooldowns, nudge limits and contact-sharing
-- consent are the sending layer's, and they sit above this.
create function app.reject_message_without_consent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A message to somebody who is not on the Roster -- an Admin, say -- is not
  -- governed by a congregant's consent record.
  if new.person_id is null then return new; end if;

  if exists (
    select 1 from public.person_opt_out o
     where o.person_id = new.person_id and o.ended_at is null
  ) then
    raise exception 'this Person has opted out and receives nothing further'
      using errcode = 'check_violation',
            constraint = 'outbound_message_recipient_has_not_opted_out';
  end if;

  if not exists (
    select 1 from public.consent_record c
     where c.person_id = new.person_id and c.consent = 'sms'
  ) then
    raise exception 'this Person has not consented to be texted'
      using errcode = 'check_violation',
            constraint = 'outbound_message_recipient_has_given_sms_consent';
  end if;

  return new;
end;
$$;

create trigger outbound_message_recipient_consented
  before insert on outbound_message
  for each row execute function app.reject_message_without_consent();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table intake_submission enable row level security;
alter table consent_record    enable row level security;
alter table person_opt_out    enable row level security;

alter table intake_submission force row level security;
alter table consent_record    force row level security;
alter table person_opt_out    force row level security;

-- Admin-only. What a Person said at Intake, and what they agreed to, is the pastor's
-- to read; a Leader sees the people they lead, not their answers. Participation
-- Status reaches a Leader through the function above, which is the derived fact
-- rather than the record behind it.
create policy intake_submission_read_own_ministry on intake_submission
  for select to authenticated
  using (app.is_admin_of(ministry_id));

create policy consent_record_read_own_ministry on consent_record
  for select to authenticated
  using (app.is_admin_of(ministry_id));

create policy person_opt_out_read_own_ministry on person_opt_out
  for select to authenticated
  using (app.is_admin_of(ministry_id));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on intake_submission, consent_record, person_opt_out
  from anon, authenticated, service_role;

grant select on intake_submission, consent_record, person_opt_out to authenticated;

grant select, insert, update, delete
  on intake_submission, person_opt_out to service_role;
grant select, insert on consent_record to service_role;

grant select, insert, update, delete
  on intake_submission, person_opt_out to discipler_command;
grant select, insert on consent_record to discipler_command;

create policy intake_submission_command on intake_submission
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

create policy person_opt_out_command on person_opt_out
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

create policy consent_record_command_read on consent_record
  for select to discipler_command
  using (ministry_id = app.command_ministry_id());

create policy consent_record_command_append on consent_record
  for insert to discipler_command
  with check (ministry_id = app.command_ministry_id());
