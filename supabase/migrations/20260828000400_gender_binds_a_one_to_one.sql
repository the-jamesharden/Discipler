-- ---------------------------------------------------------------------------
-- Gender binds a one-to-one. A group may be mixed, and may hold several Leaders.
-- ---------------------------------------------------------------------------

-- Both rules the previous two migrations installed were the wrong rules, and both
-- were argued for at length in the files that installed them, so this states the
-- correction rather than quietly replacing the text.
--
-- **Gender.** Men with men and women with women, in a one-to-one, for the pilot. A
-- group is people who meet together and may hold Leaders and Participants of any
-- gender. `app.reject_gender_mismatch` compared the joiner against every other open
-- member whatever the kind, and its own comment defended that as stating the rule
-- "honestly for a group" -- an honest statement of a rule Discipler does not have.
--
-- **Leaders.** `relationship_one_open_leader` was unique on `(relationship_id)` for
-- every kind. A group may be led by several people; a one-to-one is two people and
-- holds exactly one.
--
-- Both conditions read `kind`, and that is the cost worth naming. ADR-0004 scoped the
-- column to the participation caps, and a safeguarding rule is not a participation
-- cap, so the ADR is amended rather than stretched in silence. The alternative --
-- branching on the live Participant count, the way copy and derivation must -- is the
-- wrong shape for a constraint: the first rows of a nascent group read as N=1, so
-- insert order would decide whether a mixed-gender group were legal at all. `kind` is
-- frozen at formation and therefore stable at write time, which is the case ADR-0004
-- exists for.
--
-- The consequence, stated so it is not discovered later: a group that drops to one
-- Participant keeps `kind = 'group'` and stays gender-free, while a relationship
-- formed as a one-to-one is bound. That is what a declaration means, and it is the
-- side of the trade the caps already took.

-- ---------------------------------------------------------------------------
-- A group may hold several Leaders
-- ---------------------------------------------------------------------------

drop index if exists relationship_one_open_leader;

-- Renamed as well as rescoped. Leaving a name that says "one open leader per
-- relationship" over an index that means "per one-to-one" is the stale comment this
-- migration exists to correct, in the one place a reader cannot avoid it.
create unique index one_to_one_one_open_leader
  on relationship_member (relationship_id)
  where role = 'leader' and kind = 'one_to_one' and ended_at is null;

comment on index one_to_one_one_open_leader is
  'A one-to-one is two people and holds exactly one Leader. A group may be led by '
  'several, so it is excluded here rather than capped at a higher number.';

-- `leader_one_open_group` is untouched: a person still leads at most one open group,
-- and any number of one-to-ones. That cap is about how much one Leader carries, which
-- this change says nothing about.

-- ---------------------------------------------------------------------------
-- Gender binds a one-to-one only
-- ---------------------------------------------------------------------------

comment on function app.reject_gender_mismatch() is
  'Refuses a membership whose gender differs from the relationship''s other open '
  'members. Fired only for a one-to-one -- a group may be mixed. Compared against the '
  'other members rather than against the leader, so it holds however the rows arrive.';

drop trigger if exists relationship_member_gender_matches on relationship_member;
drop trigger if exists relationship_member_gender_matches_on_reopen on relationship_member;

-- The kind is on the membership row itself, carried there by the composite foreign
-- key, so the condition is a property of the row being written and costs no lookup.
create trigger relationship_member_gender_matches
  before insert on relationship_member
  for each row
  when (new.kind = 'one_to_one')
  execute function app.reject_gender_mismatch();

-- Still scoped to the two updates that can introduce a mismatch -- reopening a closed
-- membership, and moving one onto a different Person -- for the reason 20260828000300
-- gives: a blanket update trigger would re-check the row somebody is closing, leaving
-- a relationship that had somehow gone mismatched impossible to even end.
create trigger relationship_member_gender_matches_on_reopen
  before update on relationship_member
  for each row
  when (
    new.kind = 'one_to_one'
    and (
      (old.ended_at is not null and new.ended_at is null)
      or old.person_id is distinct from new.person_id
    )
  )
  execute function app.reject_gender_mismatch();

-- The omission the review pass caught on `app.current_gender` and not on its sibling.
-- Trigger-only signature, so the exposure is small, but every other definer in these
-- migrations is followed by this line.
revoke execute on function app.reject_gender_mismatch() from public;
