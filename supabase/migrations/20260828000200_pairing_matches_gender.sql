-- ---------------------------------------------------------------------------
-- Gender is an absolute constraint on pairing
-- ---------------------------------------------------------------------------

-- The two constraints on pairing are not the same kind of thing, and the schema
-- should not pretend they are.
--
-- The **age band** governs suggestion only. An Admin who knows a pairing is right
-- may cross it by hand, so it appears nowhere in this file and nowhere else in the
-- database: it is a filter the pairing scorer applies, and ticket 04 owns it.
--
-- **Gender matching is a safeguarding policy.** Manual pairing may never cross it,
-- which means it cannot live in the pairing command -- an application-side check
-- holds only until the first write path that forgets it, and this is the one rule in
-- Discipler that exists to protect people rather than to keep the product tidy. It
-- goes where the participation caps went, for the reason ADR-0004 gives.
--
-- A Ministry that wants mixed-gender relationships disables the rule deliberately in
-- settings. Those settings are ticket 22's, and until they exist the rule is on: the
-- safe default for a safeguarding constraint is enforced, never absent.

-- The Person's current answer, which is the latest one they gave. Intake may be
-- re-submitted (ticket 16), and a correction has to be the answer that counts --
-- reading any submission at all would let a stale row decide a safeguarding
-- question.
--
-- SECURITY DEFINER for the reason `app.current_consent` is: the caller is a trigger
-- running as `discipler_command`, and `intake_submission` is not its to read
-- directly. Not granted to `authenticated`, because a browser session calling this
-- would be probing any Person's gender in any Ministry.
create function app.current_gender(target_person_id uuid)
returns gender
language sql
stable
security definer
set search_path = ''
as $$
  select i.gender
    from public.intake_submission i
   where i.person_id = target_person_id
   order by i.submitted_at desc, i.created_at desc, i.id desc
   limit 1
$$;

comment on function app.current_gender(uuid) is
  'The gender on this Person''s most recent Intake submission, or NULL where they '
  'have never completed one. NULL is not a mismatch: a Person with no Intake is '
  'refused by the readiness triggers, which say something an Admin can act on.';

revoke execute on function app.current_gender(uuid) from public;
grant execute on function app.current_gender(uuid) to service_role, discipler_command;

-- Every open member of a relationship shares one gender, whatever their role.
--
-- Written against the other *members* rather than against the leader specifically,
-- so it holds however the rows arrive. A check that compared each Participant to the
-- Leader would depend on the Leader's row being inserted first, which is an ordering
-- the database does not promise and no future write path is obliged to honour. It is
-- also the honest statement of the rule for a group: a group of four is not "three
-- pairings with the leader", it is four people who meet together.
create function app.reject_gender_mismatch()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  joining public.gender;
begin
  joining := app.current_gender(new.person_id);

  -- No Intake, so no answer. The readiness triggers refuse this row a moment later
  -- with a refusal that tells the Admin what is actually missing; answering "genders
  -- do not match" here would send them looking for the wrong problem.
  if joining is null then return new; end if;

  if exists (
    select 1
      from public.relationship_member m
     where m.relationship_id = new.relationship_id
       and m.ended_at is null
       and m.person_id <> new.person_id
       and app.current_gender(m.person_id) is distinct from joining
  ) then
    raise exception 'everyone in a relationship must be of the same gender'
      using errcode = 'check_violation',
            constraint = 'relationship_member_gender_matches';
  end if;

  return new;
end;
$$;

-- Fires before the readiness triggers by name, which is deliberate only in that it
-- must not matter: the two refusals describe different problems and a row failing
-- both is refused either way.
create trigger relationship_member_gender_matches
  before insert on relationship_member
  for each row execute function app.reject_gender_mismatch();
