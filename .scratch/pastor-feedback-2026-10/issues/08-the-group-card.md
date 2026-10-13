# 08 - The group card

**What to build:** Clicking a group on Overview opens the pair card's group form: the group's name, the leader in full, and each Disciple as a row showing their phone that opens to the rest.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *The group card*.
Design: `.lavish/pastor-feedback/mock-group.html`, settled in James's Lavish review of 2026-10-12.

**Blocked by:** 07

**Status:** ready-for-agent

## Acceptance

- [x] Every group card on Overview opens the group card over the page, the same way ticket 07's card opens. (8c69444)
- [x] The head says *Group*, its declared shape (women, men or mixed) and since when, the group's name and its state pill. (a7f4914, 8c69444)
- [x] The leader is shown in full, as a person is on the pair card, with the role *Discipler*. (8c69444)
- [x] Under *Disciples · N*, each Disciple is a row with their name and phone; pressing the row opens their email, age band and goal. A missing phone or email is left out, not announced. It opens without script. (8c69444)
- [x] The facts, the concern or stall band, the read record and End relationship behave as on ticket 07's card. (8c69444)
- [x] A group of twelve stays readable on a phone: the rows keep their shape and the card scrolls inside the window. (8ab9a12)
- [x] Checked by eye in a real browser against the mock-up, with a group of three and one of twelve, at desktop and phone width. (8ab9a12)

## Not in this ticket

- Changing who is in a group. That stays on the Roster.

## Comments

Decisions made while building (pf-08 builder, 2026-10-13):

- **One card, a third shape.** `cardShapeOf` (`src/domain/relationships.ts`) says what a relationship's card opens as: `pairShapeOf`'s one-to-one or 1:2 pair, or `A_GROUP` for everything else.
  `PairCard.shape` is now that `CardShape`, beside the Group's `name` and `declaredGender`, and `<PairCard>` draws its group form where the shape is `A_GROUP`; `pairCardFrom` no longer returns null for a Group.
  `A_GROUP` is `'a_group'`, not `'group'`, so the kind fence (ADR-0004) still holds: the card never reads the kind column.
- **A nameless relationship larger than a pair opens as a Group**, titled by its people as a pair is, rather than opening nothing.
  No formation makes one today; the alternative was leaving its Overview card dead.
- **Every Overview card now opens the card**, and the Group's old link to its Follow-Up item is gone.
  So `OverviewRelationship.pairShape` and the reader's `namesOfRelationships` went with it.
  `overview_page` still returns `relationship_names`, now read by nothing: it was left in place rather than redefined, because other tickets in this round may redefine `overview_page` and a later migration restating it from an older definition would drop their keys.
  The integrator can drop the key once the round's migrations have landed.
- **The migration adds one key**, `declared_gender`, to `app.pair_card` (`20261014000800_the_group_card.sql`), restated whole from ticket 07's definition. `overview_card_page` composes it by name and is untouched.
- **The head says *Group · women · formed 7 Sep, 5 weeks ago*.** *Formed*, as the mock-up says it, where a pair says *paired*; and *since when* in the pair card's own form, the date and how long ago.
  The gender words are the ticket's, *women*, *men* and *mixed*; the Roster's toggle calls mixed *Coed*, which was the alternative.
- **The leader's role reads *Discipler***, as the ticket says, not the mock-up's *Discipler · leads the group*.
- **A co-leader is shown in full beneath the leader**, each with the role Discipler. The ticket names one leader; a Group can have two, and leaving one out was the alternative.
- **The number on a Disciple's row is words, not a link.** The row is the button that opens it, and a link inside it would be a control inside a control.
  The opened row carries **Call Mia** and **Text Mia**, then the email, age band and goal; the ticket lists only the email, age band and goal, and leaving the Admin no way to call from the card was the alternative.
  A Disciple the card knows nothing more of (no phone, email, age band or goal) is a row that does not open, with no chevron.
- **Disciples are in name order**, as each side of a pair is; the mock-up's order was the seed's.
- **The stall band names the first leader by name**, as it names a pair's Discipler.
- **No End relationship while the Group awaits its leader**, as on a pair: the ending route refuses one nobody accepted.
- **A Group with nobody in it yet still says *Disciples · 0*** and draws no rows, rather than hiding the heading.
- **Found in the browser check and fixed, on the shared card:** a tall card (a Group of twelve) ran 16px below a 1000px desktop window, because its 4vh top margin was not taken off its height; it is now held inside the window and scrolls within itself, on a phone too.
  The line over the names wrapped mid-phrase on a phone (*5 / weeks ago*); its parts are now drawn apart and wrap only between them, for the pair card's head as well.
  On a phone a Disciple's number sits under their name, so a long name wraps instead of being cut short.
