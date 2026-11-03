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

## Comments

### Built (2026-11-03)

`WHATS_NEW` in `app/help/whats-new.ts` and `NEXT_OFFICE_HOURS` in `app/help/office-hours.ts` are the two repo files, and the rules that read them are `newestUndismissed` in `src/domain/whats-new.ts` and `upcomingOfficeHours` in `src/domain/office-hours.ts`.
`app/overview/news-cards.tsx` draws the row, and the words around the files are in `app/overview/news-copy.ts`.
The close button posts to `/overview/whats-new/dismiss`, which runs the command `whats_new.dismiss`.
`whats_new_dismissal` holds the dismissals (`supabase/migrations/20261104103000_whats_new_dismissals.sql`), and `app.page_session()` gains `admin.whats_new_dismissed`, which reaches every page as `SignedInAdmin.whatsNewDismissed`, so the tag on every page costs no read.
`helpMenuFor` in `app/top-nav-menus.ts` is the Help menu for one Admin at one moment.

The office hours file ships as null because James has not given the Zoom link or the next date, so no card shows and the Help item stays off.
`tests/app/whats-new-and-office-hours.test.ts` says so, and that one test is deleted when the file is filled in.

`speakWithTheTeamLine` in `app/help/office-hours.ts` is the welcome window's line with and without its Next, ready for ticket 27, which draws the modal.

### Decisions

- **A dismissal is a row of its own, through the command boundary, with no history.**
  `rls-coverage` forbids a signed-in session any write, so the close button is a command like every other.
  It writes no `ministry_event`, because nothing about a church's discipleship changed.
  A table rather than a column on `ministry_member`, which holds the Admin's tier and is the last table to widen a write on.
  It carries `ministry_id` and a foreign key to the membership, so it goes when the Admin does.
  Each Admin reads only their own rows, even inside their own church.
- **Launch entry's date is 2026-11-03.**
  The mock-up's "Oct 30" was the day it was drawn, and search ships with this wave.
  James can change it in the file before merging, as nobody has dismissed anything yet.
- **Office hours in the Help menu opens the Overview card, not Zoom.**
  The card says when the call is and holds the Join button, so the Admin learns the date before they land in an empty Zoom room.
  The alternative was the link itself in a new tab, which is one line in `helpMenuFor`.
- **What's new in the Help menu opens a Help page, `/help/whats-new`.**
  It is built from the same file at build time, public like every Help page, and search and the AI guide read it as they read the rest.
  The alternative was a top-level `/whats-new`, which would need a reserved name and a page function for a list with nothing private in it.
  Opening it dismisses nothing: the tag follows the card's close button alone.
- **A date passes at midnight where the call is held.**
  The card stays for the whole of its date, so somebody running late still finds the link.
  The alternative was hiding it when the call starts, which needs a length the file does not hold.
- **The time reads in the file's zone, as drawn ("12pm CT"), not the Admin's.**
  The zone's name is the all-year one, so it cannot be wrong about daylight saving.
- **The Read more needed somewhere to go.**
  No Help page covered search, so `getting-started.md` gains a short section, "Find anything with search", drafted from the spec's Search section.
  The alternative was an entry with no Read more, against the one drawn.
- **The Help page on getting help changes one sentence.**
  It said the next date is in the Help menu and on the Overview, which is false while no date is set.
  It now reads true either way.
- **The close button keeps the growth chart's choice**, rebuilt from the form's two values by `growthChoiceFrom`, so no address from a form is ever redirected to.
- **The cards' headings are `h2`, not the mock-up's `h3`**, because they are the first headings under the page's `h1`; they look as drawn.
