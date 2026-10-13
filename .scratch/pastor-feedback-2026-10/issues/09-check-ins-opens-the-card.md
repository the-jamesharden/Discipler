# 09 - Check-Ins opens the card

**What to build:** Every relationship on Check-Ins opens the pair card in place, with this week's answer in its band.
The D concern column lists its pairs by name like the other columns, instead of a sealed count that sends the Admin to Follow-Up.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *Check-Ins*.
Design: `.lavish/pastor-feedback/mock-checkins.html` and `mock-tab-checkins.html`, settled in James's Lavish review of 2026-10-12.
Today: A and B list cards that go nowhere, and concern is a sealed count with *Go to Follow-Up* (`app/check-ins/page.tsx`).

**Blocked by:** 03, 07, 08

**Status:** ready-for-agent

## Acceptance

- [x] The layout stays as ticket 03 leaves it: the three counts, then four columns with the letters coloured as the donut. No summary strip. (f28e440)
- [x] Each row in A, B, C and D opens the pair card (or the group card) over Check-Ins, with a band saying this week's answer and when it came (*This week · Met · B good · answered 9:07am*). (5e54d18, f28e440, 46be049)
- [x] D concern lists its pairs by name. The concern's words are never on the list; they show in the card's band, and opening it records the read as ticket 07 does. (5e54d18, f28e440)
- [x] Resolving from the card clears the concern on Check-Ins and Follow-Up alike, and the page says so where the Admin is. (f28e440)
- [x] `docs/pastor-dashboard.md`, *Check-Ins*, describes the D column and the card and no longer says the C heading does not expand. (b8ed329)
- [x] Checked by eye in a real browser against the mock-ups, with at least one answer of each letter, at desktop and phone width. (46be049)

## Not in this ticket

- A summary strip. James chose none.

## Comments

Decisions made while building (pf-09 builder, 2026-10-13):

- **One card, one extra band.** Check-Ins opens ticket 07's `<PairCard>` with a `thisWeek` answer; everything else on the card is the Overview's, head included (*One to one · paired 7 Sep, 5 weeks ago*).
  The mock-up's head said *One to one · this week, from Check-Ins* and moved *Paired* into the facts; keeping the shared head was the alternative taken, so the card reads the same from every tab, as the spec says.
- **The Last check-in fact is left out on Check-Ins**, as the mock-up draws it: the band already says the same answer, which is the latest there is.
- **This week's Concern is drawn in the week's band.** Where this week's answer raised a Concern still unresolved, the band's label is the week's line and its words, **Resolve** and the reading line follow, as the mock-up draws it, rather than a second red band saying *Concern · raised by ...*.
  Which Concern that is comes from the exact join `concern_open` already makes (the Concern's prompt belongs to this week's conversation), never from when it was raised. A Concern from an earlier week still unresolved keeps its own band beneath.
  So the migration adds `card_concern_sequences` beside the card, in `check_ins_card_page`, rather than restating `app.pair_card`, which ticket 10 also composes.
- **The band's colour is the letter's**: A, B and C as their column heads, D red; an answer with no letter (did not meet, or met and not yet rated, reachable only by typing the address) is grey.
  A D whose Concern was resolved stays red in the band: it is still what was answered.
- **The time in the band**: *answered 9:07am* today, *answered yesterday, 3:12pm*, and *answered Sat 10 Oct, 3:12pm* earlier in the week, in the Ministry's zone. The ticket gives only today's form; a Check-Ins week runs seven days.
- **A D row is marked red only while its Concern is unresolved** (`ci-card d`, the mock-up's red left edge). After Resolve the row stays in D, unmarked, and the Concerns count drops; no new word is added to the row.
- **The rows keep today's text and date** (*Grace Lee → Chloe Park*, *Oct 12*), and a Group's row still names its people.
  The mock-up showed *Mon 12 Oct, 9:05am* and a Group by its name (*Lauren Price → Tuesday Women's*); neither is in the ticket or the spec, and the layout is to stay as ticket 03 left it, so they were not taken.
- **The column heads keep ticket 03's colours**, which already match the donut; the mock-up's `a4`-`d4` tints were not copied over them.
- **Every action on the card returns to Check-Ins**: `back` is `/check-ins?card=<id>`, which `app/follow-up/actions.ts` now accepts with Overview's and Follow-Up's. After **End relationship** the card is gone, so Check-Ins says *Relationship ended.* at its top, as the Overview does.
- **Closing goes to `/check-ins#ci-<id>`**, the row it was opened from.
- **The sealed box's words are gone** (`CONCERN_TEXT_NOT_HERE`, `GO_TO_FOLLOW_UP`, `concernsRaised`, `NO_OPEN_CONCERNS`) and with them the `.sealed*` styles; nothing else used them.
- **Found in the browser check and fixed, on the shared card:** on a phone the week's line wrapped mid-phrase (*answered / 12:18pm*); it now wraps only between its parts, as ticket 08 made the head do.
  After **Resolve** the notice sat flush against the band below it; a band after the notice now stands clear of it, on the Overview's card too.
