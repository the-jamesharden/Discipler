# 07 - The pair card

**What to build:** Clicking any one-to-one relationship on Overview opens a card over the page, instead of going to Follow-Up.
It shows both people side by side with their contact details and Intake answers, the facts about the pair, and, when there is one, the concern or the stall in a band under the names, with what can be done about it.
This is the shared card that tickets 09 and 10 open from Check-Ins and Follow-Up.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *The pair card*.
Design: `.lavish/pastor-feedback/mock-card-healthy.html`, `mock-card-concern.html`, `mock-card-stalled.html`, `mock-role-disciple.html`, `mock-role-discipler.html`, settled in James's Lavish review of 2026-10-12.
Today: a flagged Overview card is a link to `/follow-up#relationship-<id>`, a healthy one goes nowhere, and a concern's words are read through the audited `Read the concern` post on Follow-Up (`app/follow-up/page.tsx`, `/follow-up/concern/view`).

**Blocked by:** nothing. Ticket 06's Other text appears here once 06 lands.

**Status:** ready-for-agent

## Acceptance

- [x] Every one-to-one and 1:2 card on Overview opens the pair card over the page, without leaving it; closing returns to the Overview where it was. It works without script, as the import dialog and the Pair popup do, and the address says which card is open. (1406bf2)
- [x] The head says the shape and since when (*One to one · paired 7 Sep, 5 weeks ago*), both names, and the state pill. (1406bf2)
- [x] The two people sit side by side, the Discipler left and the Disciple right, and stack on a phone. (1406bf2)
- [x] Each person shows their name, their role **in this pair** (*Discipler* or *Disciple*), phone with Call and Text links, email, age band and goal, with Other text where they gave it. A missing phone or email is left out, not announced. (087acbb)
- [x] A person who leads one pair and is discipled in another reads *Discipler* on one card and *Disciple* on the other, and neither card mentions the other pair. (1406bf2)
- [x] Beneath the people: paired since, the last check-in answer and its date (*Mon 12 Oct · Met · B good*), and the current material and since when. Never the words of a concern in that line. (2db3e2a)
- [x] **A concern sits in a band straight under the names** with its words, who raised it and when, and **Resolve**, which clears the words as Resolve does today. (1406bf2)
- [x] **The concern's words show as the card opens**, and opening it records the read exactly as `Read the concern` records it today. A line under the band says who read it and when. (38f77cb)
- [x] **A stall sits in the same band**: which condition fired and how long it has held, in the unit that condition reports (`docs/product-rules.md`, *Stalled Reports a Duration Matched to Its Reason*). (1406bf2)
- [x] An expired pause shows its band with **Resume**. (1406bf2)
- [x] **End relationship** is a quiet link at the foot that opens the existing outcome and reason step and ends it through the existing route. (1406bf2)
- [x] Contact details reach the page through the same consent check Nudge uses today (ADR 0010); the card sends nothing. (4b8e59e)
- [x] `docs/pastor-dashboard.md` (*Overview* and *Check-Ins*) says the concern shows when the card opens and the read is recorded, replacing the deliberate extra click, and the reversal is written down; `docs/open-questions.md`, *Open: the Admin relationship detail*, is marked resolved by this card. (1406bf2)
- [x] Checked by eye in a real browser against the mock-ups, healthy, concern and stalled, at desktop and phone width. (38f77cb)

## Not in this ticket

- Groups. That is ticket 08.
- Opening the card from Check-Ins and Follow-Up. Those are tickets 09 and 10.
- Custom question answers on the card. Those come with ticket 12.

## Comments

Decisions made while building (pf-02-07 builder, 2026-10-13):

- **Paired since is in the head, not repeated in the facts.**
  The head says *One to one · paired 7 Sep, 5 weeks ago*, as the mock-ups James settled draw it, and the facts hold the last check-in and the Material.
  The alternative was a third facts row saying the same date again.
- **Paired means when the Admin paired them** (the relationship's creation), not the Leader's acceptance.
- **Contact details follow the consent rule even though the Roster shows them (ADR-0021).**
  The card reads phone and email through `public.pair_card_contacts`, which carries the predicate `public.contact_to_share` carries, `app.current_consent(person, 'contact_sharing') is true`, with the email beside the number.
  Its own function, because `contact_to_share` returns no email and needs a number; somebody with only an email can still be reached.
  So on the card an Admin does not see a number the Roster shows them, for a person who has not agreed to share it.
  The alternative was reading them as the Roster does, which the ticket rules out.
- **Opening the card is a page load that records the reading.**
  The card is the Overview at `?card=<id>`, and the page runs `concern.view` for each unresolved Concern after its one read, exactly as the `Read the concern` route does; a refresh records another reading, which is true.
  The Overview's card links do not prefetch, so only a press reads.
- **The line under the band names this reading and the latest by anybody else**, not this Admin's own earlier ones (seen in the browser check, where a second opening named the same Admin at the same minute).
  The full list is Follow-Up's fuller card (ticket 10).
- **The head pill is the grid's pill**: the state, or *Concern* in red where the card is red only for an unresolved Concern on a Healthy relationship.
- **A stall has no button.** It clears itself when the Leader answers; there is nothing to resolve.
- **No End relationship while awaiting acceptance.** The ending route refuses one nobody accepted; Follow-Up cancels it.
- **A 1:2 pair is one Discipler on the left and both Disciples stacked on the right**, its head *1:2 pair*, its title all three names.
- **The pair is told by its name and who is in it now, never its kind** (ADR-0004, which `tests/domain/relationship-kind-fence.test.ts` enforces): no name, one Discipler and one Disciple is a one-to-one; no name, one and two is a 1:2 pair.
  So the migration gives the Overview each relationship's name, not its kind.
- **A Group's card is unchanged** until ticket 08: it still links to its Follow-Up item where one exists.
- **Every action on the card returns to it.** Resolve, Resume and End post to the Follow-Up routes with `back`, which the routes take only when it is exactly `/overview?card=<uuid>`; anything else returns to Follow-Up as before.
  After End the relationship has no card, so the Overview says *Relationship ended.* at its top.
- **An expired pause shows its band only while still paused.** Resuming leaves the `pause_expired` item on Follow-Up, as it always has, for an Admin to resolve there.
- **Closing goes to `/overview#rel-<id>`**, so without script the browser returns to the card it was opened from; with script the page does not move (checked in Chrome).
- **The goal** is shown through `goalAsShown` (ticket 06), and the last answer with the four letters (ticket 03), `A outstanding` to `D concern`; a concern stored before ticket 03 reads `D concern`.
- Shared for tickets 08 to 10: `app.pair_card(ministry, relationship)` is the SQL a page function composes under `card`; `pairCardFrom(doc, history, clock)` (`src/platform/supabase/pair-card-reader.ts`) reads it; `readTheConcerns` (`app/pair-card/open.ts`) records the reading; `<PairCard>` (`app/pair-card/pair-card.tsx`) draws it with the page's own `close` and `back`.

