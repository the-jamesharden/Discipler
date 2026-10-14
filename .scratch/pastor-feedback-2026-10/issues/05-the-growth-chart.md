# 05 - The growth chart

**What to build:** A green line chart on Overview showing growth in discipleship over time, with a dropdown for what it counts and a toggle between weeks and months.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *The growth chart*.
Today: Overview has two server-drawn SVG donuts and no time series, and a test asserts there is no chart library.

**Blocked by:** the weekly donut change (Overview's rates and donuts covering last week) reaching `main`, which another session was shipping on 2026-10-12.

**Status:** ready-for-agent

## Acceptance

- [x] A dropdown on the chart picks **People in mentorship**, **People in groups** or **Total discipled** (James, Lavish review of 2026-10-12, replacing *Active relationships*, *People in discipleship* and *Disciples*). All three count **Disciples only**, each person once: *People in mentorship* the Disciples in one-to-ones and 1:2 pairs, *People in groups* the Disciples in groups, *Total discipled* everybody being discipled, counted once even when in both. It opens on **Total discipled**. Not *Total in discipleship*. (d5275a3, 6e23e74)
- [x] Paused relationships are left out of all three. (d5275a3)
- [x] The last point is the live count now; each earlier point is the count at the end of that week or month, in the Ministry Timezone. (d5275a3)
- [x] A toggle on the chart switches between the last 12 weeks and every month since the Ministry opened. Nothing else on Overview changes with it. (d5275a3, 6e23e74)
- [x] Every point is derived from the stored ministry history, so a relationship ended or paused last month shows as it was then, not as it is now. (d5275a3, 6bfa6b0)
- [x] The dropdown and toggle work without script, as the dashboard's other controls do, and what is picked lives in the address. (6e23e74)
- [x] Drawn as server-rendered SVG in the donuts' style, green line, with no chart library. (6e23e74)
- [x] A Ministry younger than a week or a month draws sensibly, not an empty or broken chart. (d5275a3, 6e23e74)
- [x] `docs/pastor-dashboard.md`, *Overview*, describes the chart. (6e23e74)
- [x] Checked by eye in a real browser against the Lavish mock-up (`.lavish/pastor-feedback/mock-growth.html`, full width under the tiles), with a seeded history that grows, shrinks and pauses, at desktop and phone width. (1531d55)

## Not in this ticket

- Any other trend figure on Overview. James chose none.

## Comments

Decisions made while building, each the conservative reading, with the alternative.

- **Who counts.** A Disciple counts from when their relationship was accepted (or they joined it, if later) until it ended or they left it; a relationship nobody has accepted yet counts nobody, as the Active Relationships tile counts it.
  The alternative, counting from formation, would count people in pairs that have not started.
- **Pair or Group.** Told apart as the Overview's cards tell them apart (`cardShapeOf`): a Group has a name, and a nameless relationship with one Discipler and up to two Disciples is a pair, judged by who was in it at each point.
  Never by `kind`, which ADR-0004 fences and which calls a 1:2 pair a group anyway.
- **When the Ministry opened.** `ministry.created_at`, or the first relationship's `created_at` if that is earlier (a history brought in from before).
  The alternative, the `ministry.opened` event, is missing for Ministries opened before that event existed.
- **Weeks and months before the Ministry opened** are drawn as nothing, not as zero, so a young Ministry's line starts part way across: a zero would draw a beginning as growth.
  The weeks view always spans 12 weeks; the months view spans every month since opening but at least 12, so a few months sit at the right as a few weeks do.
  The alternative was stretching two or three months across the whole card.
- **A Ministry younger than a week or a month** draws its one point, now, at the right, and the change line says *Opened this week* or *Opened this month* instead of a change.
- **The change line** reads *+13 in 12 weeks* as in the mock-up, counting the weeks or months drawn; it is green only when it rose, *−2 in ...* and *No change in ...* are grey.
- **The dropdown** is a `details` of three links, as the Account menu is, rather than a `select`, which cannot change the page without script or a submit button.
  It looks like the mock-up's select.
  The address is `?growth=mentorship|groups` and `?by=months`; the opening choice (Total discipled, weeks) is plain `/overview`, and anything unknown in the address reads as it.
- **Opening a pair card keeps the chart's choice** in the card's address and its Close link.
  The `back` address a card's forms return to is left as `/overview?card=<id>`, because `backFrom` accepts only that exact shape, so after acting on a card the chart returns to its opening choice.
  Widening that check was left alone.
- **Drawing.** Server-rendered, no chart library: the line, shading and grid are an SVG stretched to the plot, and the dots and labels are HTML over it at the same percentages, so the text stays its own size from a phone to a desk.
  On a phone every other date label is dropped.
  Each dot carries its own words for a pointer resting on it (*Week of 27 Jul: 14*, *Now: 27*), and the plot says the whole line to a screen reader.
- **Only the Overview's document carries the history behind the chart.** Check-Ins aliased the Overview's document, so the shared part became `app.history_page()` and Check-Ins answers with that alone (migration `20261014001400_the_growth_chart.sql`).

