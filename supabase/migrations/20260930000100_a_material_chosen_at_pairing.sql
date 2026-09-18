-- Manual pairing, ticket 02 -- A Material chosen at pairing
--
-- An Admin forming a group knows what it is about to run, and the pairing form
-- is about to let them say so (`.scratch/manual-pairing/spec.md`). The choice
-- cannot be an assignment: Material periods begin at acceptance, a relationship
-- formed a moment ago is never accepted, and `app.assign_material` refuses one
-- that is not.
--
-- It does not need to be one. The Material history already says that assigning a
-- Material at the very instant of acceptance is permitted, produces a
-- zero-length opening period, and that the period carrying no Material sorts
-- ahead of anything sharing its instant (`20260908000100_material_assignment.sql`).
-- So the choice is held here as an intention and acceptance spends it, through
-- the same `app.assign_material` every other period opens through. Nothing about
-- the gapless invariant changes, and no function is touched.
-- ---------------------------------------------------------------------------

alter table relationship add column intended_material_id uuid;

comment on column relationship.intended_material_id is
  'What an Admin chose while forming this relationship: spent at acceptance, when '
  'it is written into the Material history and cleared, and meaningless '
  'afterwards. An intention and not a fact about what happened, so unlike kind '
  'and declared_gender it is not immutable. The choice itself stays on the '
  'relationship.created ministry event.';

-- Composite, like every other reference to a Material: the Ministry is part of
-- the key, so an intention can only ever name a Material of the relationship's
-- own Ministry, declaratively, whatever the boundary was handed.
--
-- `on delete set null`, and of this column alone. Not cascade: a Material's row
-- going must not take relationships with it. Nothing in the product deletes one,
-- since removing a Material is a flag, so this is what a row delete by hand
-- does. Not restrict either, which is what a *period* naming the Material does:
-- a period is history and an intention is not, so an unspent one quietly becomes
-- no intention. The column list is what keeps `ministry_id`, the other half of
-- the key, out of it.
alter table relationship
  add constraint relationship_intended_material_fk
  foreign key (intended_material_id, ministry_id) references material (id, ministry_id)
  on delete set null (intended_material_id);

-- Spent means cleared, stated once and where it cannot be forgotten: a
-- relationship somebody has accepted carries no intention. Acceptance stamps the
-- one and clears the other in a single statement, so a relationship that is
-- accepted, ended and re-read never offers a stale choice to anything that
-- looks. A Material removed between pairing and acceptance is cleared by the
-- same statement without ever being assigned.
alter table relationship
  add constraint relationship_intention_is_spent_at_acceptance
  check (accepted_at is null or intended_material_id is null);

-- The foreign key's own lookup when a Material's row is deleted, and nothing
-- else: partial, because almost every relationship carries no intention.
create index relationship_intended_material_idx
  on relationship (intended_material_id)
  where intended_material_id is not null;

-- No grant moves. `discipler_command` already holds insert and update on the
-- whole of `relationship` (`20260826000100_relationships_roles_and_leader_access.sql`),
-- which is what writes the column at pairing and clears it at acceptance, and
-- `authenticated` gains nothing it did not hold: its select on the table is
-- unchanged and the row policies scope it as before.
