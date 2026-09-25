# 03 - A person's page: one tag per pairing

**What to build:** No single word says what a person is on their page.
*On the Roster as* and the Participation Status chip go, and one tag per open pairing and per group appears under the name, each with its direction.
Spec: `.scratch/roles-per-pairing/spec.md`, *A person's page*. Mock-ups: `.lavish/roles-per-pairing/mock-emily.html`, `mock-grace.html`, `mock-hannah.html`.

**Blocked by:** nothing

**Status:** ready-for-human

**Built:** on `roles-per-pairing/03`, not merged. No migration.

## Acceptance

- [x] *On the Roster as* and the status chip in the card's corner are gone.
- [x] One tag per open pairing and per group, under the name: *disciples* Chloe Park, *discipled by* Grace Lee, *leads* Tuesday Women's, *in* Tuesday Women's. A pairing still awaiting acceptance is tagged too.
- [x] Group tags are drawn apart from one-to-one tags, as the mock-ups draw them.
- [x] Somebody holding no pairing has no tags, and nothing is said in their place.
- [x] Awaiting Intake and Opted out still show as a tag, as on the Roster.
- [x] *At Intake* stays exactly as today: *Offered to mentor* for the Mentor answer, nothing otherwise.
- [x] Participation Status still decides whether Pair is offered.
- [x] Checked by eye in a real browser for somebody on both sides, somebody leading a group, somebody in a group, and somebody unpaired, at desktop and phone width.

## Comments

### Implementer

**Where things are.**
- What the tags say and in what order: `app/roster/tags.ts` (`tagsOnAPersonsPage`, `inPageOrder`), new.
- The words: `PAIRING_TAG` and `pairingTagSaid` in `app/roster/copy.ts`, added beside `pairingSizeLabel`.
- The page: `app/roster/[personId]/page.tsx`, the `PageTags` list under the name, and Pair offered on `whyNotPairable`.
- The look: one new block at the end of `public/discipler.css` (`ul.rtags`, `.rtag`, `.rtag .dir`, `.rtag.grp`, `.pill.opted_out`), translated from the mock-ups' `<style>`.
- Removed as dead once the page stopped using them: `whoTheyAre` and `participationStatusLabel` in `app/roster/copy.ts`, and the `.rs` chip rules, in a commit of their own (`280ab32`) so it can be dropped at merge if it conflicts with ticket 01.
- Tests: `tests/app/a-persons-page-tags.test.ts` (new), `tests/integration/the-person-page-over-http.test.ts`, and the two tests that read *Ready to Pair* off the page (`removing-a-person-over-http`, `unpairing-over-http`) now read the tags and *Unpaired* instead.
- Screenshots (untracked, in the worktree): `.lavish-shots/<name>-desktop.png` and `<name>-phone.png` for Emily, Grace, Hannah, Rachel, Sarah (unpaired), Mia (Awaiting Intake) and Ava (Opted out, still in a pairing).

**Small gaps decided, each with its alternative.**
1. A tag is a group by the live count of Disciples, as the size pill beside it counts (ADR-0004: nothing is worded by kind), so a group fallen to one Disciple is tagged as a one-to-one. Alternative: `countsAsAGroup`, as Unpair and Remove read it on the same page.
2. A group nobody named is its people to the one leading it (*leads Ana Ruiz, Mia Chen and Zoe Park*) and *Grace Lee's group* to somebody in it, the popup's name for it (James, 2026-09-21). Alternative: the leader's bare name, which reads as a second one-to-one.
3. Order: what they lead first, then what they are in, and within each the one-to-ones before the groups, as all three mock-ups draw it. The Pairings card follows the same order, so the tags and the card agree. Alternative: the reader's alphabetical order, which put Hannah's group before Rachel.
4. A pairing awaiting acceptance is tagged exactly like an accepted one; the Pairings card already says *awaiting acceptance*. Alternative: a note on the tag.
5. *Awaiting Intake* and *Opted out* come first, in the Roster's own small pill (*Opted out* in the red the old chip used), since they are states and not pairings. Alternative: an `.rtag` variant.
6. A plan an import made is not tagged: it is not an open pairing, and the Pairings card does not list it either.
7. Pair was offered on this page only to somebody *Ready to Pair*, so somebody being discipled had none here though their Roster row did. It now follows the row's rule, `whyNotPairable`: Intake completed and not opted out, as the spec says Pair is offered on every person page. Its address is untouched for ticket 01.
8. Two things seen by eye and fixed: `.card ul` indented the tags (now `ul.rtags`), and the *- awaiting acceptance* note took the last name to a new line with it (the space now sits outside its `nowrap`).

**For James.**
- The mock-ups also reword the Pairings card lines (*Disciples Chloe Park*, *Leads Tuesday Women's*, *In Tuesday Women's*, where today reads *Discipling Chloe Park* and *Discipling Tuesday Women's: Hannah Brooks, Lily Evans*). The ticket does not ask for it, so the card keeps today's words. Say if it should follow.
- The real person page is narrower than the mock-ups drew it, so on a desktop the two tags of somebody on both sides wrap onto two lines; on a phone they fit on one.
