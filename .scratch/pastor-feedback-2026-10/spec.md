# Pastor feedback, October 2026: the first six changes

**Status:** needs-triage

## What this is

James reviewed the Admin surface and asked for a round of changes across Overview, Check-Ins, Follow-Up, Materials and the Intake wizard.
He was grilled on them on 2026-10-12, and every decision below is his answer there.
Tickets 01 to 06 needed no further design review.
Tickets 07 to 13 were settled afterwards in a Lavish review of mock-ups (see *Decided in the Lavish review*).

## Settled rules this reverses

James consented to each of these on 2026-10-12.
The ticket that builds each one rewrites the rule it reverses, so nobody later restores it as a fix.

- **The satisfaction question has three answers.** It gets four, A outstanding, B good, C okay, D concern, so there is no middle answer to default to. Ticket 03.
- **ADR 0001 rejects free text as a suggestion input.** A typed "Other" goal now counts as a tiebreaker when two people typed the same thing. Ticket 06.
- **Reading a concern is a deliberate extra click** (`docs/pastor-dashboard.md`, *Check-Ins*). Opening the pair card shows the concern at once, and the read is still recorded. Ticket 07.
- **The Materials folder card's history line is the one place assignment history is visible.** James agreed it may go, but the Materials change is out of this round (see *Out of this round*).

## The flower background (ticket 01)

- The watercolour painting behind every Admin tab and sign-in keeps its top-right spray and its bottom-left spray.
- The vine that runs between them across the middle goes.
- The painting shows in the margins outside the content column and never sits behind the content itself.
- This corrects an existing screen, so it is built outright with no mock-up.

## Overview card colours (ticket 02)

- Every relationship card on Overview is coloured by what it needs.
- **Green:** healthy, the default.
- **Yellow:** stalled.
- **Red:** carrying an unresolved concern, for as long as the concern stays unresolved, not only the week it was raised.
- **Grey:** paused or awaiting acceptance. Grey means inactive, and each card keeps its own word label.
- Red wins over yellow when a stalled relationship also carries an unresolved concern.
- Every colour is backed by its word label, so the meaning never rests on colour alone.
- This corrects an existing screen, so it is built outright with no mock-up.

## A-D ratings (ticket 03)

- The satisfaction question reads: *How did the meeting go? Reply A for outstanding, B for good, C for okay, D for concern.*
- A clarification after an unreadable reply names A, B, C or D.
- Only D is a concern: it alone draws *Please tell us more about the concern.*, raises the concern badge and turns the pair red.
- C okay raises nothing and changes no relationship state.
- Typed synonyms: *ok* and *okay* read as C; *concern* reads as D. The whole-message matching rule (ADR 0003) is unchanged.
- **A reply is read against the wording its question was sent with.** A leader who received the three-answer question before the change and replies *C* afterwards meant concern, and it is recorded as a concern.
- Answers already stored keep their meaning. They are stored as words, so a stored *concern* never becomes *okay*.
- **Quality rate** is (outstanding + good) / rated. Okay counts against it.
- The Check-In Ratings donut on Overview gets four slices: A green, B light green, C yellow, D red.
- Check-Ins gets a fourth column. C okay lists its relationships the way A and B do. D concern is sealed exactly as concern is today.
- The meeting question (*Reply 1 for yes, 2 for no*) does not change.
- The fourth slice and column use today's exact styles, so A-D can ship before the Lavish round without any screen leaving the okay answers out.

## The readable link per church (ticket 04)

- Each Ministry gets a short name of its own, lowercase with dashes, unique across Discipler.
- The mentor/mentee Intake form is at `/join/<short name>` and the group form at `/join/<short name>/groups`.
- Every existing Ministry is given one automatically from its name when this ships, with `-2`, `-3` and so on added where two names clash.
- An Admin can change it on Intake Forms.
- **Every short name a Ministry has ever had keeps redirecting to its forms forever**, because QR codes get printed on bulletins.
- The current `/intake/<ministry id>` links keep working.
- The QR codes on Intake Forms switch to the readable link.
- The new field on Intake Forms is new UI and is shown in the Lavish round before it is built.

## The growth chart (ticket 05)

- Overview gains a green line chart of growth in discipleship over time.
- A dropdown picks what it counts: **People in mentorship**, **People in groups** and **Total discipled** (James, Lavish review of 2026-10-12). All three count Disciples only, each person once: mentorship the Disciples in one-to-ones and 1:2 pairs, groups the Disciples in groups, and Total discipled everybody being discipled, so a person in both counts once there. It opens on **Total discipled**.
- Paused relationships are left out of all three.
- It sits full width under the tiles, above the donuts.
- The last point is today's live count; every earlier point is the count at the end of that week or month.
- A toggle on the chart switches the x axis between **weeks** (the last 12) and **months** (every month since the Ministry opened). The toggle is on this chart only; the rest of Overview keeps its own periods.
- It is derived from the ministry's stored history, like every other number on the dashboard, and drawn as server-rendered SVG like the donuts, with no chart library.
- No other trend figures are added to Overview.
- The chart is new UI and is shown in the Lavish round before it is built.

## "Other" on the Intake goal (ticket 06)

- The goal question stays one choice. *Other* is added as the last option and opens a required short text box.
- The typed text never appears on the Roster row.
- An Admin sees it on the person page's intake answers and, once it exists, on the pair card.
- **Two people whose Other text is the same, ignoring capitals, spaces and punctuation, share a goal.** Nothing fuzzier matches: not *grieving* for *grief*, not a typo.
- A shared Other text counts as a tiebreaker exactly as a shared preset goal does (`docs/product-rules.md`, *The Discipleship Goal Is a Tiebreaker, Not a Tier Gate*).
- Suggested Pairs says it in the reason: *you both wrote "grief"*.
- James asked for this ticket to go last.

## Decided in the Lavish review (tickets 07 to 13)

James answered these on 2026-10-12 in a Lavish review of mock-ups built on the real pages of a seeded Ministry (`.lavish/pastor-feedback/index.html`, gitignored).
Every line below is his answer there.

### The pair card (ticket 07)

- Clicking any relationship on Overview opens a card over the page instead of going to Follow-Up.
- **The two people sit side by side**, the Discipler on the left and the Disciple on the right, stacking on a phone.
- Each person shows their name, **their role in this pair** (*Discipler* or *Disciple*, the Admin screens' words), phone with Call and Text, email, age band and goal, with any Other text.
  A person who leads one pair and is discipled in another reads *Discipler* on the first card and *Disciple* on the second, and neither card mentions the other pair.
  A missing phone or email is left out, never announced (*No phone*, *No email given*).
- Beneath the people: **paired since**, **the last check-in answer and its date**, and **the current material and since when**. No row of past weeks; material history stays on Materials.
- **A concern or a stall sits in a band straight under the names**, before the contact details: the concern's words, or which stall condition fired and for how long, with **Resolve** in the band where there is something to resolve and **Resume** on an expired pause.
- **The concern's words show as the card opens**, and opening it records the read exactly as *Read the concern* does today. A small line under the band says who read it and when.
- **End relationship** is a quiet link at the foot of the card that opens its existing reason step.

### The group card (ticket 08)

- The group's name, shape and state; the leader in full, as a person is on the pair card; then each Disciple as a row showing their name and phone, which opens to their email, age band and goal.

### Per tab (tickets 09 and 10)

- The same card opens from Check-Ins and Follow-Up. On Check-Ins its band is this week's answer.
- **Follow-Up gets a fuller card**: under the facts, a *What has happened* list, newest first, read from the stored history, of exactly these: when the item was raised and why; the check-ins that led to it (unanswered, did not meet, the D); who opened the contact details or read the concern, and when; earlier Follow-Up items for this pair and who resolved them. The words of an earlier, resolved concern never appear: resolving cleared them.

### Check-Ins (ticket 09)

- Today's layout stays, with ticket 03's four letters coloured to match the donut. There is no summary strip.
- **D concern lists its pairs by name** as the other columns do, and each opens the card with the concern in it. The words are never on the list.

### Follow-Up (ticket 10)

- **Each item is one button**: its tag, the names, one line of reason and how long it has held, and nothing to press but the item itself. *End relationship* leaves the front of the page.
- The review items (an expired pause, an invitation not accepted, a swap request, somebody who wants a group) open the same card with their one action in the band.

### The Intake form editor (tickets 11 to 13)

- Full control of both forms, the mentor and mentee form and the groups form, each edited separately.
- **One page per form**: each wizard page is a box with its intro or thank-you text, each question a row that opens in place to edit its wording, hint and whether it is required, and rows drag between and within pages. Pages can be added.
- **Live on save**, question by question, saying *Saved, live now*; **Preview form** opens the form as a newcomer sees it. Somebody halfway through keeps the version they opened.
- Name and phone are always asked and can be reworded. Gender, age band, the matching question, availability and goal can be reworded and removed; each is marked with what uses it (*Pairing rules use this*, *Suggested Pairs uses this*), and removing one says plainly what stops working and how many answers it deletes.
- Custom questions: short text, long text, one choice, several choices, yes/no. Their answers show on the person page and the pair card and are never used for matching.
- Removing any question follows ADR 0014: two presses, saying how many answers it deletes.
- Today's form, with ticket 06's Other, is every Ministry's preset.

## Out of this round

- **The Materials overhaul.** Materials stays as it is for now, history line and per-card dropdown included.
- **Self-signup for churches.** Wanted, and to be grilled as its own feature. Recorded in `docs/open-questions.md`.
- **A broadcast text to Disciplers.** Asked for and declined on 2026-10-12; *No Interface Action Sends a Message* stands. Recorded in `docs/open-questions.md`.
- **The weekly donut.** Overview's rates and donuts covering last week was built separately and is being shipped by another session; ticket 05 builds on it.

## Tickets

1. `issues/01-the-flower-stays-in-the-margins.md`
2. `issues/02-overview-cards-coloured-by-need.md`
3. `issues/03-four-answers-a-to-d.md`
4. `issues/04-a-readable-link-per-church.md`
5. `issues/05-the-growth-chart.md`
6. `issues/06-other-on-the-intake-goal.md`
7. `issues/07-the-pair-card.md`
8. `issues/08-the-group-card.md`
9. `issues/09-check-ins-opens-the-card.md`
10. `issues/10-follow-up-items-are-buttons.md`
11. `issues/11-the-form-editor.md`
12. `issues/12-custom-questions.md`
13. `issues/13-removing-a-question-the-product-uses.md`
