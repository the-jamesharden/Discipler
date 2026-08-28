-- A consent record carries its decision, and one function answers what is current.
--
-- The bug this closes is a sentence rather than a line of code. `consent_record` was
-- built so that only a *grant* writes a row, on the reasoning that absence is what the
-- send-time check reads and "a record saying false would make `exists` the wrong
-- question". `exists` was already the wrong question. Existence can express *has ever
-- granted*. It cannot express *granted, then withdrew*, because the withdrawal has no
-- row to be.
--
-- Nothing can produce that state today: the only writer is a first Intake submission.
-- Ticket 16 adds the second -- an Admin-sent link reopening a Person's own Intake --
-- and under the old shape a re-submission declining contact sharing wrote nothing at
-- all, leaving the earlier grant standing as the only record. Their Leader would keep
-- seeing a number the Person had just withdrawn, which is the exact check ticket 15
-- performs at display time so that it *can* be withdrawn.
--
-- A decline that was never recorded cannot be recovered from anywhere, so this lands
-- before the re-submission path and before there is any pilot data.

-- ---------------------------------------------------------------------------
-- The decision itself
-- ---------------------------------------------------------------------------

-- Defaulted so the column can be added not-null, then undefaulted, exactly as
-- `source` was added. The backfill is correct rather than convenient: every row that
-- exists today was written by a grant, because a decline wrote nothing.
alter table consent_record
  add column granted boolean not null default true;

alter table consent_record alter column granted drop default;

-- `granted_at` on a row where `granted` is false is a false statement, inside the one
-- table whose purpose is to be read back in an audit.
alter table consent_record rename column granted_at to decided_at;

comment on column consent_record.granted is
  'What the Person decided about this consent on this submission. A decline is a '
  'recorded decision, not an absent row: the current decision is the latest record '
  'for that Person and consent kind, never whether any record exists.';

comment on column consent_record.decided_at is
  'When the Person made this decision. Records are never updated, so a change of mind '
  'is a later row and this column is what orders them.';

-- ---------------------------------------------------------------------------
-- One definition of what is currently consented
-- ---------------------------------------------------------------------------

-- There are four readers of consent in this schema and the application above it --
-- `participation_status`, the `outbound_message` insert trigger, the sending layer's
-- recipient check, and its contact-sharing check -- and ticket 15's Leader Dashboard
-- will be a fifth. Left inline, that is five chances to write the rule differently,
-- and the odds all five agree are poor. The rule lives here instead, the same way
-- Participation Status is one function rather than a condition repeated per screen.
--
-- `decided_at` comes from the injected clock, which tests advance deliberately, so two
-- rows can legitimately share it. `created_at` then `id` make the ordering total: a
-- non-deterministic answer here is a consent check that flickers.
--
-- SECURITY DEFINER because its callers include a definer function and a trigger, and
-- because the tables under it are not readable by every role that must ask the
-- question. It is deliberately not granted to `authenticated`: a browser session
-- calling this directly would be probing any Person's consent in any Ministry, and the
-- surfaces that legitimately ask are the ones that already perform a visibility check.
create function app.current_consent(target_person_id uuid, target_consent consent_kind)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select c.granted
    from public.consent_record c
   where c.person_id = target_person_id
     and c.consent = target_consent
   order by c.decided_at desc, c.created_at desc, c.id desc
   limit 1
$$;

comment on function app.current_consent(uuid, consent_kind) is
  'The Person''s current decision on one consent kind, or NULL where they have never '
  'been asked. Callers must test `is true`: NULL and false are both "do not", and '
  '`= true` would let a never-asked Person fall through as neither.';

revoke execute on function app.current_consent(uuid, consent_kind) from public;
grant execute on function app.current_consent(uuid, consent_kind)
  to service_role, discipler_command;

-- ---------------------------------------------------------------------------
-- The existing readers, rewritten onto it
-- ---------------------------------------------------------------------------

-- Unchanged except for the consent test. `is true` rather than `exists`: a Person who
-- has never been asked and a Person who declined are both "not consented", and the
-- three-valued form says so without a coalesce at every call site.
create or replace function public.participation_status(p public.person)
returns public.participation_status
language sql
stable
security definer
set search_path = ''
as $$
  select case
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

    when exists (
      select 1 from public.relationship_member m
       where m.person_id = p.id and m.role = 'participant' and m.ended_at is null
    ) then 'paired'

    when not exists (select 1 from public.intake_submission i where i.person_id = p.id)
      or app.current_consent(p.id, 'sms') is not true
      then 'no_intake_submitted'

    else 'ready_to_pair'
  end::public.participation_status;
$$;

-- The consent floor under the sending layer. Same change, same reason: a Person who
-- withdrew SMS consent must be refused as firmly as one who never gave it.
create or replace function app.reject_message_without_consent()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.person_id is null then return new; end if;

  if exists (
    select 1 from public.person_opt_out o
     where o.person_id = new.person_id and o.ended_at is null
  ) then
    raise exception 'this Person has opted out and receives nothing further'
      using errcode = 'check_violation',
            constraint = 'outbound_message_recipient_has_not_opted_out';
  end if;

  if app.current_consent(new.person_id, 'sms') is not true then
    raise exception 'this Person has not consented to be texted'
      using errcode = 'check_violation',
            constraint = 'outbound_message_recipient_has_given_sms_consent';
  end if;

  return new;
end;
$$;
