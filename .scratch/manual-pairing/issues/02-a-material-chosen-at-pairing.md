# 02 - A Material chosen at pairing

**What to build:** The Material an Admin picks while forming a relationship, held until the relationship is accepted and written into its history at that instant.

**Blocked by:** 01

**Status:** ready-for-agent

## Why

The prototype's group panel carries a Program / book select, and an Admin forming a group knows what it is about to run.
`relationship.assign_material` refuses while `acceptedAt` is null (`src/domain/boundary.ts:3121`), and a relationship formed a moment ago is never accepted, so the pick cannot be an assignment.

It does not need to be.
`20260908000100_material_assignment.sql:292` states that assigning a Material at the instant of acceptance is permitted, produces a zero-length period, and that the period carrying no Material sorts ahead of anything sharing its instant, "which is not a tiebreak invented to settle that coin toss but the rule itself".

So the pick is recorded on the relationship as an intention, and acceptance spends it.
Nothing about the gapless invariant changes.

## Acceptance

- Migration: `relationship.intended_material_id uuid references material (id) on delete set null`, nullable.
  Commented as: what an Admin chose while forming this relationship, spent at acceptance and meaningless afterwards.
  `on delete set null` and not cascade: a Ministry deleting a Material must not delete relationships.
- `discipler_command` gains the grant it needs to write the column on insert and to clear it at acceptance. No new grant for `authenticated`.
- The column is **not** immutable the way `kind` and `declared_gender` are. It is an intention, not a fact about what happened, and it is cleared once spent.
- `relationship.create` gains `readonly materialId?: MaterialId`, documented beside `name` and `joinRequiresApproval`: absent means none, and it is an intention rather than an assignment for the reason above.
- The boundary refuses a `materialId` naming a Material this Ministry does not hold, or one already removed, with a `PairingRefused` code added to `PairingRefusal` and worded in `app/roster/copy.ts`.
  A new code and not a silent drop: `REFUSALS` is a `Record`, so forgetting the wording fails the build, which is the property that file exists for.
- A `materialId` on a one-to-one is kept, not dropped.
  Unlike a group name, which changes what the weekly question calls two people, a Material binds identically whatever the shape, which is the same reasoning `declaredGender` already carries at `src/domain/boundary.ts:2166`.
- At acceptance (`src/domain/boundary.ts:4733`), when `activatesRelationship` and the relationship carries an intended Material, a second `assignMaterial` effect is pushed at the same instant, carrying that Material and `assignedBy: null`.
  It sits after the existing `materialId: null` effect, which is the opening period and must stay first.
  `assignedBy` is null because no Admin performed *this* act; the Admin who chose it is on the pairing event.
- The intended Material is cleared when spent, so a relationship that is accepted, ended and re-read carries no stale intention.
- A relationship whose intended Material was removed between pairing and acceptance activates with the opening period alone and no refusal.
  Acceptance is a Leader's act and must never fail on an Admin's stale choice.
- Domain tests: the two-period history at one instant satisfies `app.reject_broken_material_history`; the opening period sorts first; a one-to-one carries it; a removed Material at acceptance is skipped; no intention leaves a single opening period exactly as today.
- Over-HTTP: form a group with a Material, accept it as its Leader, and the Materials tab files it under that Material's folder with no "Previously" line.
- `CONTEXT.md` names the intention and points at the boundary for when it is spent, stating no duration and no cap.

## Notes for whoever picks this up

The Admin's choice is recorded in the pairing ministry event as well as on the column.
The column is spent and cleared; the event is history and stays.

Do not reach for `relationship.assign_material` here. It carries an `assignedBy` and an Admin, appends its own history, and refuses unaccepted relationships. This is a different act with a different shape, and routing it through that command would mean loosening the acceptance check that ticket exists to hold.
