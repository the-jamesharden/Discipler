# 05 - The old Pair page retires

**What to build:** Every Pair button opens the popup, `/roster/pair` redirects into it, and the old page is deleted.
This is the moment the Discipler's side, built unlinked over old ticket 23 and then ticket 02 and ticket 04, becomes what an Admin gets.

**Blocked by:** 02, 04
It does not wait on ticket 03.

**Status:** ready-for-agent

**Built:** 2026-09-21, on `integration/manual-pairing`, not merged to `main`.
See *Implementer, 2026-09-21* under Comments.

**Old tickets:** this is old ticket 27, whole; none of it is committed.
Every criterion is below, unchanged.
Here "old ticket NN" means a ticket of the earlier cuts, 01 to 27, kept under that number in `07-committed-already.md`, and existing code that says "Manual pairing, ticket NN" means those.
New code says "Manual pairing, recut ticket NN".
It stays a ticket of its own so that the switch is one change, reviewed alone and reverted alone.
Old ticket 21's Comments, in `07-committed-already.md`, say the old Pair page sends `mode` back as a hidden field; it goes with the page.

## Why last

The old page can form a one-to-one, a group with a name, a declaration and a Material.
Once old ticket 02 and old ticket 04 have landed the popup can do all of that, and nothing is lost by the switch.

Joining a group is new and the old page never did it, so the switch does not depend on it.
In this cut the Group shape shares old ticket 04 with the co-leader's side of the popup, so this ticket waits for both; that is a consequence of the cut and not a dependency.

## Acceptance

### Rows

- [x] **Pair** on a Discipler's row, on Disciplers and on All, opens the popup on the Discipler's side.
- [x] No row, on any list, links to `/roster/pair`.

### The redirect

- [x] `/roster/pair` redirects into `/roster?pair=…`, carrying its query, so the links from the person page and the Follow-Up tab keep working.
- [x] A Discipler named in the old query opens the popup for them on the Discipler's side, with any Disciple the query named already ticked.
- [x] A Disciple alone in the old query, which is the Follow-Up tab's link, opens the popup for them on the Disciple's side.
- [x] A refusal's query (the error and every restored choice) survives the redirect, so a bookmarked or in-flight refusal still reads.
- [x] `/roster/pair` with nobody in its query has nobody to open a popup for, and redirects to the Roster.
  Nothing links to it that way once old ticket 07 has removed *Pair people*.
  This one is a default taken while writing the tickets, not a line of the spec; James can overrule it on this ticket.
- [x] The person page and the Follow-Up tab are changed to link to the popup directly, so the redirect serves old links and not the app's own.

### Deleted

- [x] The old page, its styles and its copy that nothing else uses.
- [x] The pairing route's refusals all return to the popup; the branch that returned to the old page is gone.
- [x] The pairing route itself stays where it is and still posts without script.

### Glossary

- [x] **Pair** in `CONTEXT.md` names the popup as where pairing happens, in place of "the pairing page".

### Checked

- [x] The pairing suites that drove the old page over HTTP drive the popup's address instead, and none is deleted for being inconvenient.
- [x] Over HTTP: each old link shape redirects where this ticket says.
- [x] Looked at in a browser: Pair from a Discipler row, from a Disciple row, from the person page and from Follow-Up each open the right side of the popup.

## Comments

### An addendum that was here is ticket 06

On 2026-09-20 and 2026-09-21 this ticket carried an addendum, first *Unsending an invitation* and then *Declining an invitation, and one nobody answers is withdrawn after two weeks*, because this was the shortest ticket left.
James had it made a ticket of its own on 2026-09-21: `06-declining-and-the-two-weeks.md`.
Nothing of it is left here, and this ticket is the redirect and nothing else, as it was cut.

### Implementer, 2026-09-21: built, and what was decided while building

Built straight through in one commit, so that the switch is one change to review and revert.
No migration, no new refusal code, no word sent to a phone, and no rule removed.
New code says "Manual pairing, recut ticket 05".

**Where things are.**

- `app/roster/pair/popup-address.ts` is the rule, pure: `popupAddressFor` reads an old Pair address as the popup's, and `popupFor` says whose popup a submission that names nobody returns to.
  `tests/app/the-old-pair-address.test.ts` holds it.
- `app/roster/pair/route.ts` is `/roster/pair` now: a `GET` that answers 307 with `popupAddressFor`'s address.
  Temporary rather than permanent, so a browser never keeps an old address's answer for good.
  It asks nobody to sign in; the Roster it sends them to does.
- `pairPopupHref` and `LIST_OF_SIDE` in `app/roster/lists.ts` build every link into pairing: `pairHref` on a row, the person page's **Pair**, and Follow-Up's **Pair by hand**.
- The create route's refusals all go to `/roster?list=…&pair=…`; the branch that went to `/roster/pair` is gone.
- Deleted with the page: `PAIR_PEOPLE`, and `DECLARED_GENDER_OPTIONS` with its labels.
  Every class the page used is used elsewhere, so no style went.
- Comments in `src/` that called the `pair` surface "the Pair page" now say the Pair popup.
- New over-HTTP suite: `tests/integration/the-old-pair-address-over-http.test.ts`, every old link shape, the person page's link and Follow-Up's.

**Checked.**
`tests/domain` and `tests/app`: 75 files, green.
Typecheck clean, apart from the stale `.next/types` of the deleted page, which the next build rewrites.
Over HTTP through `scripts/locked-tests.sh`: the twelve suites this touches, green, none skipped.
The whole suite's result is in the commit message.
Looked at in Chrome on this checkout's build with a seeded Ministry: Pair on a Discipler's row and on her person page open her Discipler's side; Pair on a Disciple's row, on his person page and Follow-Up's **Pair by hand** open the Disciple's side; `/roster/pair?leaderId=…&with=…` lands on her side with him ticked and the 1:1 sentence showing.

**Decided here, each the conservative reading, with the alternative.**

1. **The side an old address opens on is the list it names.**
   A Discipler it named opens over Disciplers, a Disciple over Disciples, and the Roster's own `opensAs` decides the side from there, so somebody named as a Discipler who is not one on the Roster opens as the Disciple they are.
   The alternative is to open over All, which reads the same for anybody on one side only.
2. **An old address is carried whole, less the one person the popup is for and any `list` or `pair` of its own.**
   A second Discipler, `joinRequiresApproval` and anything else the popup cannot hold ride along unread.
   An old refusal of a named group does not say it was a Group, so it reopens on the shape its ticks default to; `shape=group` is not guessed from a name.
   The alternative is to infer the Group from `name` and a declaration, which is inferring what the Admin had on screen.
3. **A submission with no `pair`, which nothing in the app draws now, is answered as the old address is.**
   Its refusal returns to its first Discipler's popup, or else its first Disciple's; one that names nobody returns to the Roster with nothing said, since there is nobody to open a popup for, as the redirect's own default.
   The alternative is to refuse such a post outright.
4. **Two tests of the old page's own screen became tests of the popup's, not deletions.**
   *Asks what kind of group this is, with nothing answered* held the old page's no-preset rule, which D1 replaced; it now holds D1's form of it, the Discipler's answer checked in the open and Coed beside it.
   Nobody pairable lacks a gender, since Intake asks it, so the popup's with-nothing-checked branch has no over-HTTP case.
   The wizard suite's *first time* check reads Solomon's answer on his person page, because the popup shows first time on a Disciple's row and he is a Discipler.
   The old page's sentence *does not start it* has no counterpart in the popup; its own suites test its words.


**One thing for James.** Answered 2026-09-21, below: nothing is built for it.
The ticket says nothing is lost by the switch, and one thing is.
The old page listed everybody ready to pair under *Discipler*, so an Admin could make somebody a leader for the first time: somebody who leads nobody and did not offer to mentor on Intake.
The popup, as old tickets 12 and 23 specified it, lists only people the Roster already makes Disciplers, and a Disciple's row opens only the Disciple's side.
So with the old page gone, somebody becomes a Discipler only by offering on Intake or by an import planning them as one.
Nothing was built for it here; if it should be possible by hand, it is a ticket of its own.

### James, 2026-09-21, in the Lavish review

- `/roster/pair` with nobody in its query keeps going to the Roster with nothing said: *Keep: to the Roster, nothing said*.
  It is built that way; the default taken while writing the ticket stands.
- The rule, restated: nobody is paired as a leader or a Disciple without completing Intake.
  It holds on the popup as it did on the old page, and the question of a Discipler by hand is only about people who have completed it.
- Imported people are marked as needing Intake.
  They are, as the Awaiting Intake tag beside the name and no Pair on the row, whichever side the import put them on; asked back whether the tag should read *Need Intake* instead.
- The question of pairing somebody as the leader who is not a Discipler yet was unclear, and James's first answer (No) came with a note asking for more.
  Asked again in the Lavish with an example and a mock-up; nothing acted on until he answers.

- The tag keeps its words: *Keep Awaiting Intake*.
- An old refusal of a named group reopens on the shape its ticks default to, as built: *Keep: reopen on the shape its ticks default to*.
- Pairing somebody as the leader who is not a Discipler yet, asked again with an example (Emily, who completed Intake to be discipled, made Sam's Discipler): *No: somebody becomes a Discipler by answering Mentor on Intake first*.
  In James's words: unless they have filled out the Intake form they cannot be a Discipler; a Discipler is just another word for the leader of a one-to-one or a 1:2, and there is no extra step from leader to Discipler, because they are one and the same in different contexts.
  So the popup stays as built, listing only Disciplers from a Disciple's side, and no ticket is written; the mock-up is not built.

