-- ---------------------------------------------------------------------------
-- The discipleship Intake wizard: which side a Person offered to stand on
-- ---------------------------------------------------------------------------
--
-- A second Intake link opens a step-by-step form for discipleship, and its first
-- question asks which side the Person is offering to stand on. Both sides are then
-- asked the same things in the same order; the wording is all that differs.
--
-- Three columns land here and they answer three different questions.
--
-- `consent_record.intake_path` says *which form they were answering*.
-- `consent_record.source` already says *how they arrived* -- a link a pastor sent,
-- or a QR code -- and it stops answering that cleanly the moment a second form is
-- folded into the same enum. One path times two routes is already four
-- combinations, and one of them is `the discipleship wizard, scanned off a poster`.
--
-- `consent_record.declared_side` says *what they answered*. It is a preference the
-- Person stated and nothing more: it does not set `person.eligible_to_lead` and
-- must not, because ticket 16 made that a plan an Admin records and explicitly not
-- a self-declared fact. The Admin still decides; this only changes what they are
-- looking at when they do.
--
-- `intake_submission.first_time` is neither. It is a matching input the pairing
-- surface reads per candidate, not a fact about what the Person was agreeing to,
-- so it sits with the answers rather than with the consent.
--
-- All three are nullable, and null is a real state rather than a gap: it means the
-- Person answered a form that did not ask. Every record written before this
-- migration is null and none is backfilled with a guess -- the existing
-- `/intake/<ministry>` form goes on writing null until ticket 29 converts it.

-- ---------------------------------------------------------------------------
-- Which form, and which side
-- ---------------------------------------------------------------------------

-- One member today. Ticket 29 adds `group` having decided it, exactly the way
-- `consent_source` reserves its third value rather than shipping it early: an enum
-- member nothing writes is a claim about a form nobody can fill in.
create type intake_path as enum ('discipleship');

-- The two sides of a discipleship relationship, as the Person themselves named
-- them. Deliberately not `member_role`: that enum says what somebody *is* in a
-- relationship that exists, decided by an Admin at pairing, and this says what
-- somebody offered before there was one. Collapsing them would let an answer on a
-- form read as a role in a relationship nobody has formed.
create type declared_side as enum ('mentor', 'mentee');

alter table consent_record
  add column intake_path   intake_path,
  add column declared_side declared_side;

comment on column consent_record.intake_path is
  'Which Intake form produced this record. Null means the form did not ask -- every '
  'record written before the discipleship wizard existed, and every record the '
  'original /intake/<ministry> form still writes. Never backfilled with a guess.';

comment on column consent_record.declared_side is
  'Mentor or mentee, as the Person answered it on the wizard''s first screen. A '
  'preference they stated, never an Admin''s decision: it does not touch '
  'person.eligible_to_lead. Null on any path that has no sides.';

-- A side without a path is a record that cannot say what question it answered, and
-- the discipleship path without a side is a wizard that skipped its first screen.
-- Both are refused at the boundary already; the constraint is here for the reason
-- `source` is not defaulted -- a consent record is read back in an audit, and the
-- one table whose whole job is to be legible afterwards should not depend on every
-- write path remembering.
--
-- Written as a CASE and not as two OR-ed conditions, which is not a style choice: a
-- comparison against a null `intake_path` is null rather than false, so the OR form
-- evaluates to null and a check constraint lets null through. The one row it would
-- have admitted is exactly the one worth refusing -- a side with no form.
--
-- The else branch says *a path with no sides carries none*, which is what ticket
-- 29's `group` will be. A path that does have sides has to say so here.
alter table consent_record
  add constraint consent_record_declared_side_follows_the_path
    check (
      case intake_path
        when 'discipleship' then declared_side is not null
        else declared_side is null
      end
    );

-- ---------------------------------------------------------------------------
-- Whether this is their first time
-- ---------------------------------------------------------------------------

alter table intake_submission
  add column first_time boolean;

comment on column intake_submission.first_time is
  'True where the Person said this is their first time -- being discipled, or '
  'mentoring, depending on the side they declared. Read per candidate by the '
  'pairing surface and by nothing else: it ranks nobody and refuses nobody. Null '
  'means the submission predates the question.';

-- ---------------------------------------------------------------------------
-- The Roster row carries both
-- ---------------------------------------------------------------------------

-- Derived, and not stored a second time on `person`. A Person who reopens Intake
-- and answers the other side has changed their offer, and the Roster says so for
-- free when the row reads the latest record rather than a column somebody has to
-- remember to update.
--
-- `is not null` on both subselects is doing real work: each reads the latest row
-- *that asked*, not the latest row. Null means the form did not ask, which is not
-- the Person withdrawing anything -- and the commonest reason a later row exists at
-- all is the tokenized link an Admin sends to correct a phone number, which asks
-- neither question. Without the filter, fixing somebody's number would silently
-- erase both the offer they made and the answer the pairing surface reads.
--
-- Dropped and recreated rather than replaced, because the result is widening by
-- two columns and Postgres refuses to change an existing function's return type in
-- place.
drop function public.roster(uuid);

create function public.roster(target_ministry_id uuid)
returns table (
  person_id uuid,
  full_name text,
  participation_status public.participation_status,
  eligible_to_lead boolean,
  declared_side public.declared_side,
  first_time boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         p.full_name,
         public.participation_status(p),
         p.eligible_to_lead,
         (select c.declared_side
            from public.consent_record c
           where c.person_id = p.id
             and c.declared_side is not null
           order by c.decided_at desc, c.created_at desc
           limit 1),
         (select i.first_time
            from public.intake_submission i
           where i.person_id = p.id
             and i.first_time is not null
           order by i.submitted_at desc, i.created_at desc
           limit 1)
    from public.person p
   where p.ministry_id = target_ministry_id
     and app.is_admin_of(target_ministry_id)
   order by p.full_name;
$$;

comment on function public.roster(uuid) is
  'One Ministry''s Roster as the Admin surface shows it: who is on it, each '
  'Person''s derived Participation Status, whether an Admin has marked them '
  'eligible to lead, which side they last offered to stand on at Intake, and '
  'whether their latest submission said this is their first time. No contact '
  'details -- a number is reached through public.contact_to_share and nowhere else.';

revoke execute on function public.roster(uuid) from public, anon;
grant execute on function public.roster(uuid) to authenticated;
