# 01 - The Pair popup: pick a side, then a person

**What to build:** Anybody who has completed Intake can be picked on either side of a pairing.
The Pair popup gets a side chooser, *In this pairing, {first name}* **Disciples somebody** · **Is discipled**, and each side lists everybody it can, the usual people first and everybody else folded.
This is the bug fix: today Emily, who finished Intake and said nothing about mentoring, cannot be picked to disciple Sarah from anywhere.
Spec: `.scratch/roles-per-pairing/spec.md`, *The Pair popup*. Mock-ups: `.lavish/roles-per-pairing/mock-pair-emily.html` and `mock-pair-sarah.html`.

**Blocked by:** nothing

**Status:** ready-for-human

**Built:** on roles-per-pairing/01

## Acceptance

- [x] The popup has the side chooser directly under its title, and one press switches it without losing anything else in the address.
- [x] Which side it is on lives in the address on its own, apart from the Roster's `list`, so a refusal the pairing route sends back reopens the popup on the side it was posted from.
- [x] It opens preset by today's rule (leads an open relationship, answered Mentor, or is the discipler in an import's plan opens on *Disciples somebody*; everybody else on *Is discipled*). The preset never limits who can be picked.
- [x] **Disciples somebody** behaves as today's popup from a Discipler (any number ticked, the shape toggle, the Group gender toggle, the Groups), and its list opens on **Asked to be discipled**: people who have completed Intake, are not opted out, hold no open participant membership and would not open as *Disciples somebody* themselves.
- [x] **Is discipled** behaves as today's popup from a Disciple (one choice, the Groups), and its list opens on **Disciples somebody already, or offered to** (*Disciples*, not *Disciple*), with *leads N* as today.
- [x] Everybody else the gender rule allows is under **Everyone else · N**, folded, one press to open, without script as well as with it. A row there has a second line saying what they do now (*Discipled by Rachel Adams*, *In Tuesday Women's*).
- [x] Greyed rows keep their reasons: Awaiting Intake, Opted out, *Already in a 1:1 with {name}* where the shape makes a 1:1. The person themselves and whoever gender leaves out are not drawn, as today.
- [x] The summary sentence names both sides and what the picked Discipler goes on doing: *Emily Davis will disciple Chloe Park, one to one. Emily is sent an invitation to accept, and goes on being discipled by Grace Lee.*
- [x] Pairing Emily to disciple Sarah works end to end through the real route: Emily is invited as any Discipler is and gains an account by accepting; Sarah hears nothing until then.
- [x] Links into the popup from Follow-Up and Suggested Pairs open it on *Is discipled*; old Pair page addresses still redirect into it.
- [x] `CONTEXT.md`: **Discipler / Disciple** becomes the Admin-screen words for the two sides of one pairing, not lists a person is on; **Declared Side** presets the popup and feeds Suggested Pairs and no longer makes anybody a Discipler.
- [x] Checked by eye in a real browser against the mock-ups, at desktop and phone width.

## Not in this ticket

- The greyed row *Disciples {first name} already*. It needs the rule that two people are never paired both ways round, which is question 1 of `.lavish/planned-pairs-and-sides/` and lands with that ticket.
- The Roster's toggle and lists. That is ticket 02.

## Comments

### Implementer

**Where things are.**
- The side rule and who each side lists: `app/roster/lists.ts` (`PairSide`, `SIDE_FIELD`, `opensAs`, `sideOfThePopup`, `pairPopupHref` with an optional side, `popupOnSide`, `candidatesFor`, `askedToBeDiscipled`, `listedFirst`).
  `disciplersFor`, `disciplesFor` and `groupsOf` are gone.
- Who is greyed and left out: `app/roster/greying.ts` (`disciplersShownTo` now lists everybody, `leftOutForADiscipler` is gender alone; `leavesOffTheList` is gone).
- The words: `PAIR_POPUP` in `app/roster/copy.ts` (`inThisPairing`, `side`, `listedFirst`, `everyoneElse`, `listed`, `doingNow`, `willDisciple`, `invited`, the new `oneToOne`).
- The popup: the side chooser, the fold, the second line and the bold lead of the summary in `app/roster/pair-popup.tsx`; each side in `pair-popup-from-a-discipler.tsx` and `pair-popup-from-a-disciple.tsx`; wiring in `app/roster/page.tsx`; one new block of rules in `public/discipler.css`.
- The side back from a refusal: `app/roster/pair/create/route.ts`, `app/roster/pair/join/route.ts`, `app/roster/pair/popup-address.ts`.
  Follow-Up and Suggested Pairs link with `side=disciple`.
- Tests: `tests/app/the-pair-popup-picks-a-side.test.ts`, `tests/integration/the-pair-popup-picks-a-side-over-http.test.ts` (seeded as the mock-ups, with the Emily-disciples-Sarah run through the real route and invitation), and the existing popup suites brought up to date.
- `CONTEXT.md`: **Discipler / Disciple**, **Declared Side**, and the side chooser in **Pair**.
- No migration: the pairing command and the database already take anybody on either side.

**Small gaps decided, each with its alternative.**
1. The address field is `side=discipler|disciple`: which side of this pairing the person the popup is for is on.
   Alternative: words from the screen, such as `side=disciples-somebody`.
2. The Roster's list no longer decides the side, on any list; a row's Pair carries no side and gets the preset.
   Alternative: Pair on the Disciples list sets `side=disciple` until ticket 02 removes the lists.
3. Switching sides keeps everything in the address except a refusal (`error`, `about`), which was about what was posted from the side being left.
   Alternative: keep the refusal too, as the ticket's words read literally.
4. The fold opens already where it holds a choice a refusal restored, and where nothing is listed above it.
   Alternative: always closed, which would hide a restored tick.
5. The toolbar counts as the mock-ups do (*2 asked · 5 more*, *3 lead or offered · 4 more*), keeps today's *· 1 group* after it and today's Clear.
   Alternative: the mock-ups' count alone, without groups or Clear.
6. The second line says every open pairing with its direction, leading first and a one-to-one before a group within each side, each item wrapping whole.
   On *Is discipled* it leaves out what they lead, which *leads N* already counts, as the mock-up does for Grace and Emily.
7. The summary's tail says every pairing the picked Discipler goes on being discipled in (*by Rachel Adams and in Tuesday Women's*) and nothing they lead; it is added to every shape from *Disciples somebody* and to co-leading, never to joining a group as a Disciple.
   Who will disciple whom is drawn in bold where the sentence says it.
   The one-to-one sentence changed from *in a one-on-one* to *, one to one*; the 1:2, N x 1:1 and Group sentences are as they were.
8. *Disciples somebody* now lists those who cannot be paired, greyed *Awaiting Intake* or *Opted out*, as *Is discipled* always did.
   Gender alone leaves a row off on both sides, so somebody of another gender already in a one-to-one is no longer shown greyed under a one-to-one.
9. The empty-list sentences that said how somebody comes to be listed are gone; both sides say *There is nobody to choose yet.*, since anybody who can be paired is listed.
10. The button labels stay today's (*Create 1:1 pair*); the mock-ups drew *Pair*.
11. The *Is discipled* side is now held by its top edge like the other, so the side chooser switches between boxes that start in the same place.

**For James.**
- The headings' words (*Asked to be discipled*, *Disciples somebody already, or offered to*, *Everyone else*) and the toolbar's are said once, in `PAIR_POPUP`, for when you come back to them.
- The Admin a Ministry is provisioned with is on its Roster without Intake, so it shows greyed *Awaiting Intake* under Everyone else in every popup.

**Port follow-up (review, 2026-09-25).**
- *Asked to be discipled* also lists somebody who answered Mentee on the Intake form and is discipled in nothing open, even where they lead or an import planned them as the discipler (`askedToBeDiscipled` in `app/roster/lists.ts`).
  This is James's decision of 2026-09-22, that a Mentee answer makes a Discipler a Disciple as well, which the port onto `main` had lost when `isDisciple` went.
  Their own popup still opens preset on *Disciples somebody*.

