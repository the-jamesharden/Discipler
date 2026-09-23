# 01 - Remove a person from the Roster

**What to build:** The Remove from the Roster card on a person's page, as `.lavish/remove-from-roster/index.html` draws it after James's review, the `person.remove` command that runs with their pairings' Unpair acts in one transaction, and Intake bringing a removed Person back.

**Blocked by:** nothing

**Status:** ready-for-human

**Built:** on `ship/remove-from-the-roster`, cut from `main`.
Migration `20261012000100_removing_a_person_from_the_roster.sql` was pushed to production on 2026-09-22.
Migration `20261012000200_a_departure_outlives_the_admin_who_recorded_it.sql`, from the code review, is not pushed yet.

## Acceptance

- The card sits at the foot of the page, the width of both columns, with no lead line, on everybody's page but an Admin's.
- Remove opens "Remove <name> from the Roster?" in place, adding "This will remove them from all current pairings and take any one-on-one pairings back to unpaired." where they hold a pairing, then a line for each group they are in ("Thursday Table goes on without them." or "Thursday Table ends, and Mia Chen and Zoe Park go back to unpaired."), with "Yes, remove <name>" and "Keep them"; only the first removes.
- The Roster then says "<name> has been removed", no longer lists them, and their page is a 404.
- Their pairings end or go on without them by the act Unpair would take, in the same transaction; a refusal anywhere changes nothing.
- Their open Follow-Up items are resolved, their open import plans closed refused, their queued texts withheld, and nothing is sent.
- The database refuses to pair them; Suggested Pairs leaves them out.
- A Discipler's account is deleted with them unless another Ministry's Roster holds it.
- A new Intake from their number brings the same Person back, Ready to Pair.
- An import row naming them is reported, not filed.

## Comments

### Implementer

**Where things are.**
- Migration `supabase/migrations/20261012000100_removing_a_person_from_the_roster.sql`: `person_removal`, the membership trigger `relationship_member_person_is_on_the_roster` (insert and reopen), `app.let_go_of_the_account`, `public.removed_people`, `public.admins_on_the_roster`, `roster_page` restated with the filter (Suggested Pairs reads that document, so it inherits it), and `app.sender_of_inbound` preferring the one on the Roster.
- Domain: `src/domain/removal.ts`; `person.remove` and the Intake restoration in `src/domain/boundary.ts`; `removed_from_the_roster` and `paired_with_removed` in `src/domain/roster.ts` and `src/domain/roster-import.ts`; two pairing refusals and `RemovalRefused` in `src/domain/errors.ts`.
- Service: `CommandService.removePerson` in `src/service/command-service.ts`; the store's `personToRemove`, `removePerson`, `restorePerson`; `recipient_was_removed` in the sending layer.
- Screens: the card in `app/roster/[personId]/page.tsx`, the route `app/roster/remove/route.ts`, the receipt on `app/roster/page.tsx`, the words in `app/roster/copy.ts`, one rule set in `public/discipler.css`.
- Tests: `tests/domain/removing-a-person-from-the-roster.test.ts`, `tests/integration/removing-a-person-from-the-roster.test.ts`, `tests/integration/removing-a-person-over-http.test.ts`.
- Docs: the rule in `docs/product-rules.md`, `docs/adr/0026-a-removal-keeps-the-person-and-takes-the-account.md`, "Removal" in `CONTEXT.md`, the Roster paragraph in `docs/pastor-dashboard.md`.

**Decisions made, each with its alternative.**
1. An ending the removal causes is recorded *discontinued*, reason *Removed from the Roster.*, and the confirmation asks nothing more, reading James's note ("yes but have a confirm button say ...") as replacing the per-pairing outcome question. Alternative: the Unpair outcome buttons for each pairing inside the confirmation.
2. The last Disciple of a group nobody has accepted, the one line Unpair offers nothing on, has that group withdrawn. Alternative: refuse the removal until the Admin withdraws it from its Discipler's page.
3. `public.roster` is untouched; the page documents filter instead, because `admin-leading-accepts-itself` and `wave3/one-of-two` both recreate it. `is_admin` is put under the row, so theirs wins where it lands. Alternative: recreate `public.roster` here and resolve by hand at merge.
4. An import row naming somebody removed is reported as *removed from the Roster* and filed nowhere; a pair naming them is not planned. Alternative: the import brings them back, which would be a second way back James did not choose.
5. A removed Person stays in the import's and Intake's reading of who holds a number, so a new name on their number is still held for an Admin to answer. Alternative: leave them out, and file a second Person on the number without asking.
6. The receipt sits under the Roster's numbers with the other receipts, not above the card as the mock-up drew it.
7. Open Follow-Up items about their relationships (not about them) are left to the rules those items already follow, as Unpair leaves them.
8. A text from a number only a removed Person holds still resolves to them, so a `STOP` is recorded; where somebody on the Roster shares it, it resolves to them.
9. The group lines (James, 2026-09-22: "include groups") come from `app/roster/removal.ts`, the same rule the route acts on, and name a group nobody named as "Their group with <the others>". Alternative: one generic sentence about groups, which could not say which ones end.
10. From the code review on 2026-09-23: a group line names as going back to unpaired only those left with no pairing in that role once the removal is done, and says "Thursday Table ends." where that is nobody. Alternative: name the whole other side, which told the Admin a Discipler leading three other groups would be unpaired.
11. The first press of Remove checks the session only and reopens the page at `#remove`, so the question is in view and the Roster is read once; a stale first press for somebody already gone lands on their page's 404 rather than on the Roster. A removal that loses a race to another Admin's lands on the Roster. Alternative: read the Roster on the first press as well, only to send a stale one to the Roster.
