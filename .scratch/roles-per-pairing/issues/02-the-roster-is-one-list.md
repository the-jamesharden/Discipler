# 02 - The Roster: one list, with the Everyone menu

**What to build:** The All / Disciplers / Disciples toggle goes, and one menu replaces it.
Its button reads **Everyone ▾** and never *Filter*, and names what is shown once anything is ticked.
Every pairing in the Paired with cell says its direction.
Spec: `.scratch/roles-per-pairing/spec.md`, *The Roster*. Mock-ups: `.lavish/roles-per-pairing/mock-roster-all.html` and `mock-roster-b.html`.

**Blocked by:** 01 (the popup takes its side from the Roster's `list` until 01 gives it its own)

**Status:** ready-for-human

**Built:** on roles-per-pairing/02

## Acceptance

- [x] One list; the toggle and the `list` it set are gone, and an old address carrying `list=` still opens the Roster.
- [x] The menu has **Everyone** at the top, which clears it, then **Pairings** (tick any, a person matches every one ticked): Disciples somebody, Being discipled, In a group, Unpaired, Offered to disciple, not yet discipling, Awaiting Intake; **Gender** (pick one): Men and women, Men, Women; **Access**: Admins.
- [x] Each option means what the spec's *What each Pairings option means* says.
- [x] Every option shows a count over the whole Roster, not narrowed by the other options ticked.
- [x] The button reads *Everyone* with nothing ticked, and otherwise names what is shown joined by `·` (*Being discipled · Women*). No chips.
- [x] What is ticked lives in the address, survives a refresh, and works without script.
- [x] The stats line reads *N shown · M on the Roster* while anything is ticked, and total, paired and unpaired while nothing is.
- [x] Every pairing in the Paired with cell names its direction: *disciples*, *discipled by*, *leads*, *in*, with its size tag.
- [x] Pair on a row opens the popup on the side ticket 01 presets.
- [x] `.scratch/manual-pairing/spec.md`, *The Roster*, points to this spec for the toggle.
- [x] Checked by eye in a real browser against the mock-ups, menu open and closed, at desktop and phone width.

## Comments

### Implementer

**Where things are.**
- The menu's rules: `app/roster/menu.ts` (new), pure.
  What each Pairings option means (`PAIRINGS_MEANS`), who is shown (`isShown`), the counts (`menuCounts`), the address (`viewIn`, `viewFields`, `rosterHref`), where Pair on a row goes (`pairHref`), and the menu as drawn (`theMenu`).
- The menu itself: `app/roster/roster-menu.tsx` (new), a `<details>` of plain links, no script.
- The words: `ROSTER_MENU`, `shownAs`, `peopleTotal`, `STATS_LABEL` and `NOBODY_SHOWN` in `app/roster/copy.ts`.
  The list words (`RosterList`, `ROSTER_LISTS`, `LIST_LABEL`, `LIST_HEADING`, `listCount`, `EMPTY_LIST`, `DEFAULT_LIST`) are gone.
- One rule for the order pairings are said in and for what is a group now: `inPairingOrder`, `plansInOrder` and `isAGroupNow` in `app/roster/lists.ts`.
  The Paired with cell, a person's tags and Pairings card, and the popup's second line all use them; `inTheOrderSaid`, `readsAsAGroup` and `inPageOrder` are gone.
  `onList`, `relationshipsOn`, `plansOn`, `roleOn`, `isDisciple` and `LIST_OF_SIDE` are gone, and `pairPopupHref` takes no list.
  The `RosterFacts` comment no longer mentions the person page's sentence.
- The page: `app/roster/page.tsx` (the menu, `StatsLine`, and `PairedWith`, `PairingLine`, `PlanLine` saying each direction).
- The look: one new block in `public/discipler.css` (`.roster-tools`, `.roster-menu`, `.roster-menu-panel`, `.menu-group`, `.menu-label`, `.opt`, `.opt-mark`, and `.paired-with .dir`), translated from the mock-ups' `<style>`; the `.seg` rules went with the toggle.
- The popup and both pairing routes carry what the menu shows in place of `list` (`app/roster/pair-popup.tsx`, `pair/create/route.ts`, `pair/join/route.ts`); `pair/popup-address.ts` drops an old `list`.
- Tests: `tests/app/the-roster-is-one-list.test.ts` (new, the mock-ups' twelve), `tests/integration/the-roster-is-one-list-over-http.test.ts` (was `the-roster-lists-over-http.test.ts`; the toggle's tests became the menu's), and every suite that posted or read `list` brought up to date.
- `.scratch/manual-pairing/spec.md`, *The Roster*, has a note pointing here.
- Verified: `scripts/locked-tests.sh`, the whole suite once with a server, `Test Files 198 passed (198)`, `Tests 2935 passed | 1 skipped (2936)`, no skipped files; the one skipped test is the standing `it.skip` in `tests/integration/invitation-over-http.test.ts`.
  `npx vitest run tests/domain tests/app`: 86 files, 1747 tests passed. `npx tsc --noEmit` is clean; there is no lint script.
- Screenshots (untracked, in the worktree): `.lavish-shots/roster-closed-*.png`, `roster-open-*.png` (*Being discipled · Women*), `everyone-open-*.png`, `popup-over-filter-*.png`, `nobody-*.png`, each `-desktop` (1440x900) and `-phone` (390x844 frame); the mock-ups as rendered are `mock-roster-all.png` and `mock-roster-b.png` beside them.

**Small gaps decided, each with its alternative.**
1. The address says what is ticked in the screen's words: `pairings=being-discipled` (once per option), `gender=men|women`, `access=admins`.
   Alternative: short codes.
2. Each option is a link to the Roster with that one option changed, and it carries `menu=open`, so the menu is still open on the page it lands on and several can be ticked in a row; the button closes it.
   **Everyone** clears everything and leaves the menu closed, and neither Pair on a row nor any way out of the popup carries `menu`.
   Alternative: a GET form with a Show button, or a menu that closes after every tick.
3. An old address with `list=` opens the Roster on Everyone; `list=disciplers` is not read as *Disciples somebody*.
   Alternative: map the two sides to the nearest option.
4. Pair on a row keeps what the menu shows behind the popup (`/roster?pairings=...&pair=...`), and the popup posts it, so a refusal reopens over the same people and a receipt lands on them, as the list did.
   The import and a held row's answer land on Everyone, where they landed on the Disciples list.
   Suggested Pairs' form posts `side=disciple` where it posted `list=disciples`, so a refusal reopens their popup on *Is discipled*, as its *Pair manually* link does.
5. The stats line is two spans like the three it replaces, *4 shown* and *12 on the Roster*, as the mock-up draws it, with no middle dot between them.
   Alternative: the spec's text literally, *4 shown · 12 on the Roster*.
6. With something ticked and nobody matching, the table gives way to *Nobody on the Roster matches what is ticked.*, and the menu stays above it.
7. A plan an import made says its direction too (*disciples Taylor Brooks planned - awaiting Intake*), since no list above the table says it any more.
8. A group on the Roster is said as a person's tags say it (`pairingTagSaid`): by its name, led or joined; one nobody named is its people to the one leading it and *Grace Lee's group* to somebody in it.
   The popup's second line now says the same, so the leader of an unnamed group reads *Leads Ana Ruiz and Mia Chen* there, where it read *Leads Grace Lee's group*.
9. The size tag stays today's (*2 members*), as the spec says; the mock-ups drew *group*.
10. The Roster's order stays the reader's (by name); the mock-ups drew their own order.
11. *Men and women* is shown ticked while no gender is picked, as a radio's default is.

**For James.**
- The mock-ups put an **Admin** pill beside David Morris's name.
  Neither the spec nor this ticket asks for it, so it is not built; *Admins* under Access finds them. Say if the pill should come.
- Somebody who has not completed Intake has no gender on file, so they are under *Men and women* and under neither *Men* nor *Women*.
  The mock-ups counted Mia among the women (8); the real Roster says 7.
- The stats line's *unpaired* counts anybody in no open pairing, as today, and the menu's *Unpaired* also leaves out anybody an import planned a pair for, as the spec says.
  The two numbers differ where an import has planned pairs.

