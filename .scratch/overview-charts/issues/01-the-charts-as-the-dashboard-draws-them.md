# 01 - The Overview's charts as the dashboard draws them

**What to build:** Meeting Completion and Check-In Ratings on the Overview drawn the way the design prototype draws them, on production and not only in the prototype.

**Status:** ready-for-agent

## Why

Reviewing the current design on 2026-09-18, James marked both charts "keep this design" and wrote: "the look of the meeting completion and the check-in ratings should look like this on production not just on demo."

The app draws the same numbers differently, and on purpose.
`app/overview/donut.tsx` is a server-drawn SVG ring, so the Overview needs no JavaScript, where the prototype loads Chart.js from a CDN.

| | Design | App today |
| --- | --- | --- |
| Ring | fills the card, first segment starts from the left (`rotation: -90`) | small, first segment starts at twelve |
| Legend | centred under the ring, colour boxes, DM Sans 11px, labels only | a column beside the ring, each label with its count |
| Headline figure | none | a large rate beside the ring |
| Labels | Completed / Missed | Met / Did not meet |
| An empty Ministry | not drawn | grey ring, "No check-ins yet" |

**Design source:** `discipler-dashboard (10).html` of 2026-09-17, `meetingStatusChart` and `meetingQualityChart`.
That file is not yet in this repository; see the last note below.

## Waiting on James

Four calls the design does not settle, asked in the review on 2026-09-18:

1. Whether the headline rate beside the ring goes, as in the design. The tiles above the charts already show it.
2. Whether the legend keeps its counts. The design shows them on hover, and there is no hover without JavaScript.
3. Whether the labels stay "Met / Did not meet" or become "Completed / Missed".
4. Whether an empty Ministry keeps the grey ring and "No check-ins yet".

## Acceptance, once those are answered

- The look is matched in the existing server-drawn SVG. Chart.js is not brought in, and the Overview still renders with JavaScript off.
- The ring, its starting angle, its thickness and the legend's position, type and spacing match the design, checked side by side against the prototype at desktop and phone widths.
- The colours stay the design-system tokens the component already uses.
- The numbers do not change: the same counts, from the same reader.
- The existing Overview tests pass, and the over-HTTP Overview test asserts whatever the four answers decide.

## Notes for whoever picks this up

This is separate from the manual-pairing effort and was raised while reviewing its design source.

The committed prototype, `.scratch/core-operating-loop/design/discipler-dashboard-v10.html`, is the 2026-08-28 file and predates ticket 36: its Roster still reads "Everyone / Eligible to lead" and it has no pair modal.
The current design is the 2026-09-17 file, which the manual-pairing spec cites by a Downloads filename and by line number.
Committing it beside the old one, and pointing that spec at the committed path, is proposed and awaits James's word.

## Comments

### 2026-09-18 - the four calls, settled by the design

"Keep this design" was James's note on both charts, so the four calls are settled the way the design settles them:

1. The headline rate beside the ring goes. The tiles above already carry it.
2. The legend carries the labels alone. A segment's count is on hover, through the segment's own `<title>`, and every count is in the ring's `aria-label`.
3. The labels are the design's, "Completed" and "Missed", which is also how `docs/pastor-dashboard.md` describes the chart.
4. An empty Ministry keeps its grey ring and "No check-ins yet".

Implemented on `the-overview-charts-as-the-dashboard-draws-them`, not yet merged.
The rings are still drawn on the server as SVG and no client JavaScript is added: every part of the design's look is geometry.
The ring's arithmetic moved to `app/overview/donut-geometry.ts` so it has a unit test, and the over-HTTP Overview test asserts the rest.

A wider change made the same day, allowing the Admin dashboard some client script, was taken back at James's word and is parked unmerged on `the-admin-dashboard-may-use-script`.
Nothing here depends on it.
