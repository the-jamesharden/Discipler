# 30 - What's new and office hours

> **Triaged 2026-10-31 against the spec's "Help, What's new and office hours" and its mock-up 3 decisions.**
> The screen is `.lavish/onboarding/s7-cards-top.html`.

**What to build:** A What's new card fed from a repo file and dismissed per Admin, and an office hours card that hides itself once its date has passed, in a row at the top of Overview.

**Blocked by:** 23

**Status:** ready-for-agent

## The cards

- What's new: "What's new · {date}", the entry's title and sentence, and Read more, with a close button.
- Office hours: "Office hours · every 2 weeks", "{date}, {time}", "Speak with the team directly on Zoom. Any Admin is welcome." and Join on Zoom.
- They sit side by side at the top of Overview, above the numbers; one alone takes the row.

## The rule

- What's new entries live in a repo file, each with an ID, a date, a title, a sentence and an optional Read more link to a Help page.
  The card shows the newest entry this Admin has not dismissed.
- An Admin's dismissals are stored on the Admin and read through the page session.
- The Help menu's What's new item carries its New tag while this Admin has an undismissed entry, and opens the entries (ticket 23 builds the menu).
- Launch ships with one entry, the one drawn: "Find anything with search", "Click Search at the end of the tabs, or press ⌘K, to jump to any person, relationship, material or help page."
- Office hours are a Zoom call with the team every 2 weeks, set in a repo file with the next date, time, timezone and link; the card hides once that date has passed, until the file is updated.
- The same file feeds the Help menu's Office hours item and ticket 27's "Speak with the team directly!" card.

## Acceptance

- Dismissing an entry hides it for that Admin only.
- An office hours date in the past shows no card, and the modal's card leaves out its Next line.

## For James

1. Provide the Zoom link and the next office hours date.
