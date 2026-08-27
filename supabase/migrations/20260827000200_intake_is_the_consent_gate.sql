-- Intake is the single consent gate, and nobody is paired before they pass it.
--
-- Two things land here, and they are the same rule seen from two sides.
--
-- The first is that a consent record now says how the Person reached the form that
-- produced it. There are two ways and only two: a pastor sends them the link, or
-- they scan a QR code that opens the same link. Both put the same form in front of
-- the same person and both produce the same record; the source is kept because
-- "who did this congregant hear from before they agreed" is the question a
-- compliance review asks, and a column added later cannot answer it retrospectively.
--
-- The second is that a Leader is now held to the same readiness Participants
-- already are. Ticket 02 checked Participants alone, on the reading that a Person
-- who has not completed Intake is an ordinary post-import state. It is -- but that
-- describes the Roster, not the pairing. The flow is import, then Intake, then
-- pairing, and nothing about leading makes the middle step optional.

-- ---------------------------------------------------------------------------
-- How a Person reached Intake
-- ---------------------------------------------------------------------------

-- Deliberately two values. Consent is obtained through the Intake form and through
-- nothing else: an Admin cannot attest to it on a congregant's behalf at import,
-- and an inbound keyword does not stand in for it. Inbound-initiated opt-in is
-- post-V1; if it arrives it arrives as a third value here, having been decided.
create type consent_source as enum ('pastor_link', 'qr_code');

-- Defaulted so the column can be added not-null, then undefaulted so that every
-- consent written from here on has to say where it came from. The default is not a
-- fallback -- a write that omits the source is a write that does not know how the
-- Person got to the form, and that is worth failing over.
alter table consent_record
  add column source consent_source not null default 'pastor_link';

alter table consent_record alter column source drop default;

comment on column consent_record.source is
  'Which route brought this Person to the Intake form: a link a pastor sent them, '
  'or a QR code that opens the same link. Both produce this same record. There is '
  'no route to consent that bypasses the form.';

-- ---------------------------------------------------------------------------
-- A Leader is paired no earlier than a Participant is
-- ---------------------------------------------------------------------------

-- Deliberately a second trigger rather than a widening of the first. The two roles
-- are refused for reasons that read differently to the Admin who hits them -- one
-- is "you cannot disciple this person yet", the other "this person cannot lead
-- yet" -- and a single function answering both would have to reconstruct which it
-- was in order to say so.
--
-- `paired` passes, and that is the point of reading the derivation rather than the
-- tables under it: a Person being discipled by somebody else is free to lead, and
-- Participation Status has never described what a Person may do, only whether they
-- are being discipled.
create function app.reject_unready_leader()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  status public.participation_status;
begin
  if new.role <> 'leader' then return new; end if;

  select public.participation_status(p) into status
    from public.person p where p.id = new.person_id;

  if status = 'opted_out' then
    raise exception 'this Person has opted out and cannot lead a relationship'
      using errcode = 'check_violation',
            constraint = 'relationship_member_leader_has_not_opted_out';
  end if;

  if status = 'no_intake_submitted' then
    raise exception 'this Person has not completed Intake and cannot lead a relationship'
      using errcode = 'check_violation',
            constraint = 'relationship_member_leader_has_completed_intake';
  end if;

  return new;
end;
$$;

create trigger relationship_member_leader_is_ready
  before insert on relationship_member
  for each row execute function app.reject_unready_leader();
