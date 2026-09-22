# 01 - No group in mind

**What to build:** The dashed last option on the group form's step three, the `group_placement_wanted` Follow-Up kind it raises, the item as S-8 of `.lavish/materials/design.html` draws it, and the `relationship.place` act that closes it by putting the Person in a group the Admin names.

**Blocked by:** nothing

**Status:** ready-for-agent

**Built:** on `wave2/no-group-in-mind`, not merged. Migration `20261009000100_no_group_in_mind.sql` is not pushed to production.

## Acceptance

- Step three offers "I don't have a group in mind" as the last option in the same radio group, dashed, with the line "We'll let <Ministry> know you'd like to be placed in one."; choosing it and continuing reaches the contact step and the done page says the Ministry has been told, not that a group was joined.
- The intake boundary accepts `none` on the group path and records the submission with a null group; an empty field still raises `intake.group_not_selected`.
- Migration: the kind is added to the Follow-Up kind constraint and to the payload check; the one-open-item index already holds one item per Person and the migration proves it with a test.
- The item shows the tag "Wants a group", the Person's name, the line drawn from their Intake, a dropdown of the groups open to them (accepted, named, unended, open to their declared gender, mixed always) with "Place in this group", and Resolve.
- `relationship.place` writes the membership row, appends the ministry event, closes the item in the same transaction, runs the gender trigger at the insert, and refuses a group not open to the Person, a group not accepted or ended, a Person already in it, and a Person with no consent on file; `relationship.admit` is unchanged.
- The Follow-Up badge counts the new item on every tab.
- Domain, integration and over-HTTP tests as the spec lists them.
- `docs/product-flow.md` and the Care Needed rules doc name the kind and the act; `CONTEXT.md` gains "Group placement".

## Comments

### Implementer

Built on `wave2/no-group-in-mind`, cut from `wave1/assigning-a-material` (b118dae), in the worktree `discipler-worktrees/wave2-no-group-in-mind`.

**Where things are.**
- Migration `supabase/migrations/20261009000100_no_group_in_mind.sql`: the enum value, `follow_up_item_payload_matches_kind` rebuilt with `group_placement_wanted` carrying `{}`, a new check `follow_up_item_placement_names_only_a_person` (a Person and no relationship, which is what makes the existing one-open-item index hold one per Person), the definer read `public.group_placements_wanted(uuid)` (revoked from `public, anon, service_role`), and `follow_up_page` gaining `placements`.
- Domain: `NO_GROUP_IN_MIND` and the reading of `none` in `src/domain/intake.ts`; the item and its history event `person.group_placement_wanted` raised in `intake.submit`; `group.add_participant` resolving the Person's open placement item in `src/domain/boundary.ts`, loaded by `openPlacementWantedFor` in the service and the Postgres store.
- Screens: the dashed option in `app/intake/fields.tsx`, the done page's `outcome=placement`, the S-8 item in `app/follow-up/page.tsx` with its words in `app/follow-up/copy.ts`, the route `app/follow-up/place/route.ts`, and one rule pair in `public/discipler.css`.
- Tests: `tests/domain/no-group-in-mind.test.ts`, new cases in `tests/domain/an-admin-puts-somebody-into-a-group.test.ts`, `tests/app/no-group-in-mind-copy.test.ts`, `tests/integration/no-group-in-mind.test.ts`, `tests/integration/no-group-in-mind-over-http.test.ts`.
- Docs: `docs/product-flow.md`, `docs/product-rules.md` (the kinds table), `docs/pastor-dashboard.md` (the Follow-Up section, the Care Needed rules), and "Group Placement" in `CONTEXT.md`.

**How `relationship.place` was reconciled with what exists.**
There is no `relationship.place`.
Manual pairing ticket 22 built `group.add_participant`, the Roster's **Add to group**, after this ticket was written, and it already writes the membership row, appends `relationship.participant_added`, runs the gender, Intake and opt-out triggers at the insert, refuses an ended group (`joining.group_has_ended`), a Person already in it (`joining.already_in_the_group`), and a Person with no consent on file (`relationship.participant_has_not_completed_intake`, `relationship.participant_has_opted_out`).
The one thing missing was closing the item, so `group.add_participant` now also resolves the Person's open `group_placement_wanted` item in the same transaction, by the Admin, and names it as `placementItemId` in the event, the same way it already resolves an open Join Request for the same group.
**Place in this group** posts to `/follow-up/place`, which runs that command and nothing else.
What is texted is unchanged: the group's accepted Leaders get the join text `group.add_participant` already sends, and the Person gets nothing; the domain test asserts the messages are identical with and without an item.
`relationship.admit` was left unchanged at first; after review it changed in one way only, below.

**After review.**
- `relationship.admit` now also resolves the Person's open `group_placement_wanted` item in the same transaction, silently, by the Admin, and names it as `placementItemId` in `relationship.participant_admitted`. What is sent is unchanged, and a domain test and an integration test assert it. This is the only way the ticket's "`relationship.admit` is unchanged" is superseded.
- The item's dropdown leaves out any group the Person already holds an open membership in, as a Disciple or as a leader.
- Whether a group field answered *no group in mind* is decided once, by `answersNoGroupInMind` in `src/domain/intake.ts`, trimmed as the reader trims; the service and the submit route use it, so `" none "` reaches the same done page.

**Decisions made, each with its alternative.**
1. Any placement answers the item, from Follow-Up, from the Roster, or by admitting a Join Request of theirs: an Admin who puts them into a group through **Add to group**, or admits them to one from Intake forms, also closes it. Alternative: close it only when placed from the item, which would leave an item saying they want a group after they are in one.
2. The command carries no `followUpItemId`; the item is read by Person inside the transaction, as the Join Request is. Alternative: the ticket's `followUpItemId` on the command, redundant with at most one open item per Person.
3. "A group not accepted" is not refused by the act. `group.add_participant` takes a group still awaiting its Discipler (Manual pairing, ticket 22), and one act keeps one rule. The dropdown offers only accepted, named, unended groups open to the Person, exactly `groups_open_to_join` filtered on gender as the form filters it. Alternative: refuse an unaccepted group when placing from the item, a second rule on the same act.
4. On success the Admin lands on the Roster with the receipt **Add to group** gives ("... is in the group now. Its Discipler has been told ..."), so no new words and they see the Person in the group. Alternative: back to Follow-Up with a new toast.
5. A refusal comes back to `/follow-up?error=<code>` and is said in the joining's and pairing's existing words.
6. The line's date is the day the item was raised, in the Ministry's zone, as *9 Sep*; gender, age band and availability are from the latest Intake. Gender is said as S-8 draws it, "Men's" and "Women's".
7. Availability is said in parts of the day: morning before noon, afternoon noon to five, evening five to eight; days alike are gathered ("Tuesday and Thursday evenings"), with "every evening", "weekday evenings", "weekend evenings" and "all day". Nothing drew these boundaries.
8. When no group is open to them the dropdown is not drawn and the line ends "No group is open to them right now." Resolve stays. Not drawn in S-8.
9. The done page reads "You're on the list" and "We've let <Ministry> know you'd like to be placed in a group, and they'll be in touch about one. We've texted you to confirm." The Welcome text is unchanged. Not drawn.
10. The item has no **See contact details**, as S-8 draws it; their number is on their Roster page.
11. Somebody every group is closed to still sees "Nothing to join yet" rather than step three with only the dashed option. Alternative: show the dashed option alone.
12. A later submission that joins a group does not close an open placement item: the kind never clears itself.
13. On a phone the select takes its own row above **Place in this group**, and Resolve wraps below; the desktop row is as S-8 draws it.

**What was checked.**
Typecheck clean; `tests/domain` and `tests/app` whole green; the touched integration and over-HTTP suites green through the lock; a full `scripts/locked-tests.sh` run (see the final report for numbers).
Step three, the done page and the Follow-Up item were looked at in Chrome beside S-7 and S-8, desktop and a 390px frame, and **Place in this group** was pressed inside the phone frame and landed on the Roster receipt.
The phone check found the select squeezed to "Choose a g" beside the button, fixed in `public/discipler.css`.

**Needs James.**
- Push the migration by hand before the code merges.
- The wording in decisions 7, 8 and 9.
- Decisions 1, 3, 4, 11 and 12.

### James, 2026-09-22, in the Lavish review of the wave

- The three on-screen sentences: *Keep all three as written*.
- The six behaviours, each confirmed as built:
  placing the person from the Roster closes their item too;
  admitting them from a Join Request closes it as well;
  after *Place in this group* the Roster's existing receipt is the landing, with no new words;
  the item's dropdown offers only accepted, named groups open to them, though Add to group allows an unaccepted one;
  somebody every group is closed to still sees *Nothing to join yet*, not step three with only the new option;
  and an item stays open until the Admin resolves it, even if they join a group through the form later.

Nothing changed. Folded into the ship branch with the rest of the wave; the migration is still James's to push before this merges.

