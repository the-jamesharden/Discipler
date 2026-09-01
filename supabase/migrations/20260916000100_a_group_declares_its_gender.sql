-- ---------------------------------------------------------------------------
-- A group declares its gender, and the declaration binds
-- ---------------------------------------------------------------------------

-- The missing third of the gender rule. `20260828000400` scoped the constraint to
-- `kind = 'one_to_one'` and left a group unconstrained, and the argument it made for
-- that -- "a group is people who meet together and may be mixed" -- answered the
-- wrong question. A men's small group with three Leaders is not a shape with no pair
-- to match; it is the ordinary case in a ministry, and the one where the
-- safeguarding rule earns its keep.
--
-- The question a constraint on a group must ask is not how many Leaders it holds but
-- **whether it declared itself single-gender**. So the relationship says which it is,
-- once, at formation:
--
--   * a **men's** or **women's** relationship -- every member, Leader and Participant
--     alike, must be of that gender;
--   * a **mixed** one -- no gender constraint, because the relationship has said what
--     it is and a constraint here would forbid the group rather than protect anyone
--     in it.
--
-- The one-to-one rule is untouched. Gender matches absolutely between two people
-- whether or not anything was declared, which is `relationship_member_gender_matches`
-- and stays exactly as `20260915000100` left it.

-- ---------------------------------------------------------------------------
-- The declaration
-- ---------------------------------------------------------------------------

-- Nullable, and null is *mixed*: this relationship declares no single gender. A
-- three-valued enum was the alternative and would have had nothing true to write for
-- a one-to-one, whose gender is implied by the two people in it and is never asked
-- for -- so the third value would have been a lie on every row of the commonest
-- shape.
--
-- On `relationship` rather than propagated onto `relationship_member` through the
-- composite foreign key the way `kind` is. `kind` had to travel because the
-- participation caps are partial indexes and an index can only see the row it is on.
-- This is read by a trigger that already opens the relationship row, so the copy
-- would buy nothing and would need a fourth column in the composite key to keep it
-- honest.
-- Every relationship that already exists becomes one declaring nothing, which for a
-- group means mixed. There is no backfill, because there is no answer to backfill
-- *with*: the members of an existing group happening to share a gender is not the same
-- fact as somebody having said the group is for them, and inventing the declaration
-- would be the silent derivation this ticket rejected, applied retroactively to
-- relationships nobody was asked about.
--
-- The consequence, stated so it is not discovered later: taken with the immutability
-- trigger below, a group formed before this migration can never declare a gender. Its
-- way to become a men's group is the way any relationship changes what it is -- end it
-- and form a new one, which is also what the history should say happened.
alter table relationship add column declared_gender gender;

comment on column relationship.declared_gender is
  'The gender every member of this relationship must be, or null where it declares '
  'none -- which for a group means mixed, and for a one-to-one means the rule is the '
  'absolute match between its two people rather than a declaration. Immutable after '
  'creation, for the reason `kind` is: a constraint that can be switched off after '
  'the fact is not a constraint.';

-- Immutable, and this is the load-bearing half of the rule. A declaration an Admin
-- could edit afterwards would turn a bound relationship into an unbound one with
-- nobody told and every member already in it -- which is the state the declaration
-- exists to make impossible. Changing what a relationship is means ending it and
-- forming a new one, which is also what the history should say happened.
--
-- Its own function rather than a shared one with `app.reject_kind_change`, because
-- the message names the column and a reader hitting this refusal is being told about
-- a different act.
create function app.reject_declared_gender_change()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'relationship.declared_gender is immutable: % cannot become %',
    coalesce(old.declared_gender::text, 'mixed'),
    coalesce(new.declared_gender::text, 'mixed')
    using errcode = 'restrict_violation';
end;
$$;

create trigger relationship_declared_gender_immutable
  before update of declared_gender on relationship
  for each row when (old.declared_gender is distinct from new.declared_gender)
  execute function app.reject_declared_gender_change();

-- ---------------------------------------------------------------------------
-- The declaration binds every member
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER for the reason `20260828000300` gives about its sibling: this
-- reads `relationship` directly, so under the inserting role's row-level security a
-- role that may write a membership without being able to select the relationship
-- would see no declaration and pass. A safeguarding rule that fails open silently is
-- the exact inversion of the guarantee.
--
-- **No lock, unlike the one-to-one check, and the difference is the point.** That one
-- compares the joiner against the relationship's *other members* -- a property of a
-- set, which two concurrent inserts can each miss. This one compares the joiner
-- against a single immutable value on the relationship row. There is no set to race
-- against and nothing that can change underneath it, so serialising everybody joining
-- the same group would cost contention to prevent nothing.
--
-- **Not gated on `ministry.suggest_gender_match`.** That setting is the deliberate
-- disable for the rule Discipler applies on a Ministry's behalf -- the automatic
-- match between two people in a one-to-one. This is a statement an Admin made about
-- one relationship, on purpose, and honouring it does not depend on a Ministry-wide
-- toggle. A Ministry that has turned the automatic rule off has said mixed one-to-ones
-- are permitted for them; it has not said that a women's group they themselves
-- declared should quietly admit a man.
create function app.reject_declared_gender_mismatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  declared public.gender;
  joining  public.gender;
begin
  select r.declared_gender into declared
    from public.relationship r
   where r.id = new.relationship_id;

  -- Mixed, or a one-to-one that was never asked. Either way this relationship
  -- declares no gender and there is nothing here to check.
  if declared is null then return new; end if;

  joining := app.current_gender(new.person_id);

  -- No Intake, so no answer. The readiness triggers refuse this row a moment later
  -- with a refusal that tells the Admin what is actually missing; answering "this is
  -- a women's group" here would send them looking for the wrong problem. The same
  -- restraint `app.reject_gender_mismatch` shows, for the same reason.
  if joining is null then return new; end if;

  if joining is distinct from declared then
    raise exception
      'this relationship was declared % and % is not', declared, new.person_id
      using errcode = 'check_violation',
            constraint = 'relationship_member_matches_declared_gender';
  end if;

  return new;
end;
$$;

comment on function app.reject_declared_gender_mismatch() is
  'Refuses a membership whose gender is not the one the relationship declared. '
  'Applies to every kind: a declared men''s or women''s relationship binds Leaders '
  'and Participants alike, and a relationship declaring none is untouched. Separate '
  'from `app.reject_gender_mismatch`, which is the absolute match between the two '
  'people in a one-to-one and is a different rule with a different refusal.';

revoke execute on function app.reject_declared_gender_mismatch() from public;

-- Unconditional, where its sibling carries `when (new.kind = 'one_to_one')`. The
-- declaration lives on `relationship` and not on the membership row, so a WHEN clause
-- -- which sees only the row being written -- cannot ask about it. The function's
-- first statement is the early return that costs a relationship declaring nothing one
-- indexed lookup and no more.
create trigger relationship_member_matches_declared_gender
  before insert on relationship_member
  for each row execute function app.reject_declared_gender_mismatch();

-- Scoped to the updates that can introduce a mismatch, for the reason 20260828000300
-- gives: a blanket update trigger would re-check the row somebody is closing, leaving
-- a relationship that had somehow gone mismatched impossible to even end.
--
-- **Three of them, where 20260828000300 named two.** Reopening a closed membership and
-- moving one onto a different Person are its two. The third is `relationship_id`, and
-- it exists here because this rule is a property of the *relationship row* rather than
-- of the member set: moving a membership onto another relationship changes which
-- declaration governs it while leaving the Person and `ended_at` exactly as they were.
-- The composite foreign key carries `kind` and deliberately not `declared_gender`, so
-- the key would happily move a woman into a declared men's group of the same kind and
-- Ministry. Copying the sibling's WHEN clause verbatim would have been correct because
-- the current write paths happen not to do that -- which is the argument 20260828000300
-- exists to stop making.
create trigger relationship_member_matches_declared_gender_on_reopen
  before update on relationship_member
  for each row
  when (
    (old.ended_at is not null and new.ended_at is null)
    or old.person_id is distinct from new.person_id
    or old.relationship_id is distinct from new.relationship_id
  )
  execute function app.reject_declared_gender_mismatch();

-- ---------------------------------------------------------------------------
-- The same hole, in the rule this ticket did not come here to change
-- ---------------------------------------------------------------------------

-- `relationship_member_gender_matches_on_reopen` has been missing the same update
-- since 20260828000300 installed it, and the review of *this* migration is what found
-- it. A membership moved from one one-to-one onto another is re-scoped to a different
-- pair of people without the Person or `ended_at` changing, so the trigger never fires
-- and two people of different genders are left alone together -- the exact outcome the
-- rule exists to prevent.
--
-- Corrected here rather than left for its own ticket. It is one clause of the same
-- rule, found by the same reasoning, and a known safeguarding hole is not a thing to
-- schedule. Stated rather than quietly widened, because 20260828000300 argued its WHEN
-- clause at length and a reader will find that argument first.
--
-- The function is untouched. This is the firing condition and nothing else, so the
-- absolute match between two people is the rule it always was.
create or replace trigger relationship_member_gender_matches_on_reopen
  before update on relationship_member
  for each row
  when (
    new.kind = 'one_to_one'
    and (
      (old.ended_at is not null and new.ended_at is null)
      or old.person_id is distinct from new.person_id
      or old.relationship_id is distinct from new.relationship_id
    )
  )
  execute function app.reject_gender_mismatch();
