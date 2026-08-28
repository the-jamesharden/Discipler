-- ---------------------------------------------------------------------------
-- The gender check closes its race, and holds when a membership is reopened
-- ---------------------------------------------------------------------------

-- The previous migration claimed this rule went "where the participation caps went,
-- for the reason ADR-0004 gives". That cited the ADR backwards and the citation is
-- withdrawn.
--
-- The caps went into **partial unique indexes**, and ADR-0004 rejected a
-- sibling-counting trigger precisely because "concurrent inserts see each other's
-- uncommitted absence and both pass". `app.reject_gender_mismatch` is that shape: it
-- reads the relationship's other `relationship_member` rows, so two transactions
-- admitting members of different genders to the same relationship could each miss the
-- other and both commit. Today's only writer inserts every member in one transaction,
-- which makes the hole unreachable -- but "correct because the current write path
-- happens to be shaped this way" is the argument the caps were moved into the database
-- to stop making.
--
-- It cannot be an index. A unique index can say "one open group per leader" because
-- that is a property of single rows; "everyone here shares one gender" is a property
-- of a *set*, and no index on `relationship_member` can see the set.
--
-- So the trigger stays and takes a lock. ADR-0004 rejected locking for the caps
-- because their scope is the whole Ministry -- every pairing would contend with every
-- other. This scope is **one relationship row**, taken only while somebody is being
-- added to that one relationship, so two Admins pairing different people never meet.
-- That is a different trade-off from the one the ADR turned down, and it is the reason
-- the answer differs.

-- SECURITY DEFINER, which the first version was not, and the omission was the more
-- serious of the two faults in it. `app.current_gender` is a definer function, but the
-- sibling `EXISTS` below reads `relationship_member` *directly*, so it ran under the
-- inserting role's row-level security. Any role that may insert a membership without
-- being able to select the relationship's other rows saw an empty set and passed --
-- a safeguarding rule failing open, silently, which is the exact inversion of "a
-- violation surfaces as a user-facing error rather than a silent no-op".
--
-- The readiness triggers get away with being invoker-side because everything they read
-- is behind `public.participation_status`, which is itself a definer. This one reads a
-- table, so it has to be the definer.
create or replace function app.reject_gender_mismatch()
returns trigger
language plpgsql
security definer
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

  -- Serialises everybody joining *this* relationship, and nothing else. Without it
  -- the check below reads a snapshot that cannot see a concurrent insert, which is
  -- the failure ADR-0004 names. Taken before the read, because a lock taken after one
  -- is a lock that guarantees nothing.
  perform 1 from public.relationship where id = new.relationship_id for update;

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

comment on function app.reject_gender_mismatch() is
  'Refuses a membership whose gender differs from the relationship''s other open '
  'members. Compared against the other members rather than against the leader, so it '
  'holds however the rows arrive and states the rule honestly for a group -- which is '
  'people who meet together, not several pairings with the leader.';

-- A membership can be reopened as well as inserted. Nothing in Discipler does that
-- today -- readmission is a second row, which is why the primary key is a surrogate --
-- but the whole reason this rule is in the database is that it must not depend on
-- what the write paths currently happen to do.
--
-- Scoped to the two updates that can introduce a mismatch: reopening a closed
-- membership, and moving a membership onto a different Person. An UPDATE trigger
-- firing on every change would re-check the row somebody is *closing*, and a
-- relationship that had somehow gone mismatched could then not even be ended.
create trigger relationship_member_gender_matches_on_reopen
  before update on relationship_member
  for each row
  when (
    (old.ended_at is not null and new.ended_at is null)
    or old.person_id is distinct from new.person_id
  )
  execute function app.reject_gender_mismatch();
