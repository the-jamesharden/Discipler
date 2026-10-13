# 05 - The growth chart

**What to build:** A green line chart on Overview showing growth in discipleship over time, with a dropdown for what it counts and a toggle between weeks and months.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *The growth chart*.
Today: Overview has two server-drawn SVG donuts and no time series, and a test asserts there is no chart library.

**Blocked by:** the weekly donut change (Overview's rates and donuts covering last week) reaching `main`, which another session was shipping on 2026-10-12.

**Status:** needs-triage

## Acceptance

- [ ] A dropdown on the chart picks **People in mentorship**, **People in groups** or **Total discipled** (James, Lavish review of 2026-10-12, replacing *Active relationships*, *People in discipleship* and *Disciples*). All three count **Disciples only**, each person once: *People in mentorship* the Disciples in one-to-ones and 1:2 pairs, *People in groups* the Disciples in groups, *Total discipled* everybody being discipled, counted once even when in both. It opens on **Total discipled**. Not *Total in discipleship*.
- [ ] Paused relationships are left out of all three.
- [ ] The last point is the live count now; each earlier point is the count at the end of that week or month, in the Ministry Timezone.
- [ ] A toggle on the chart switches between the last 12 weeks and every month since the Ministry opened. Nothing else on Overview changes with it.
- [ ] Every point is derived from the stored ministry history, so a relationship ended or paused last month shows as it was then, not as it is now.
- [ ] The dropdown and toggle work without script, as the dashboard's other controls do, and what is picked lives in the address.
- [ ] Drawn as server-rendered SVG in the donuts' style, green line, with no chart library.
- [ ] A Ministry younger than a week or a month draws sensibly, not an empty or broken chart.
- [ ] `docs/pastor-dashboard.md`, *Overview*, describes the chart.
- [ ] Checked by eye in a real browser against the Lavish mock-up (`.lavish/pastor-feedback/mock-growth.html`, full width under the tiles), with a seeded history that grows, shrinks and pauses, at desktop and phone width.

## Not in this ticket

- Any other trend figure on Overview. James chose none.
