# 31 - The designed surfaces meet the backend

**What to build:** The designed look of Discipler, applied to the pages that already run.
Two design inputs exist: a single-file HTML prototype of the whole product (`../design/discipler-dashboard-v10.html`) and a Figma Make project for the Intake wizard (`../design/mentor-intake-form.App.tsx`, saved from https://www.figma.com/make/kbj32GhzyH3rN6SBk8ThAQ/Mentor-Intake-Form).
Both share one visual system: the palette, Crimson Pro for headings, DM Sans for body text, the card, the pill, the stat tile, the tabs, the availability grid.

The backend is not a separate API.
Every screen is a server component under `app/` that reads through the readers in `src/service/container.ts`, and every write is an ordinary form POST to a route handler beside it, which runs one command through `CommandService.execute` and redirects back.
So *connecting the frontend to the backend* is not a wiring job.
It is a port: keep every page's reads, every form's action and field names, and every route handler untouched, and replace the markup and the stylesheet.

The prototype was written against the product docs, not against this codebase, and its data model is a demo.
This ticket says, screen by screen, what maps onto something real, what has no backend yet, and where the design and the product rules disagree.
The disagreements are product decisions and are listed under *Decisions this ticket needs* rather than resolved here.

**Blocked by:** nothing for parts A and B, nor for Follow-Up, Overview and Check-Ins in Part C. The Suggested Pairs tab is blocked by 04.

**Status:** shipped

## Part A - The shared system

One stylesheet, `public/discipler.css`, replaced rather than extended.
The layout links it from `public/` on purpose (see the comment in `app/layout.tsx`): the reset-result route handler renders HTML outside the layout and needs the same URL.
Keep that.

- Tokens from the prototype's `:root` block become the stylesheet's tokens.
  The current file has a dark scheme and the design has none; the dark scheme goes (decision 1, taken).
- The fonts are Crimson Pro and DM Sans.
  They are loaded from the Google Fonts link the prototype uses (decision 2, taken).
- The shared pieces, in the order the screens need them: page shell and header, tab bar, card, pill, stat tile, table, segmented control, notice, empty state, form field, primary and secondary button, the availability grid.
- The availability grid is **seven days by twelve hours**, the hours running from 8am to 8pm, one slot per hour.
  Days run down the vertical axis and the hours across the horizontal, everywhere the grid appears: the Intake wizard, the group form, the reopen form and the Leader overlay.
  Decided 2026-09-01 as an overriding design decision; see the comment below, which also records that it reverses an earlier axis decision taken the same day.
  This is a data-model change and the backend matches it; see *The grid* in Part B.
  It supersedes ADR-0006, which chose five named blocks and rejected an hourly grid on two grounds, and it reopens the suggestion tier cutoffs, which were counts out of thirty-five; both are listed under the decisions.
- The tab bar is a row of links, one per Admin surface, with the current one marked.
  The prototype's tabs are JavaScript toggles over one page; here every tab is its own route, which is what the app already has.
- Modals become pages or inline sections.
  Every modal in the prototype (pair manually, upload CSV, end relationship, relationship detail, concern text, availability overlay) is a form or a read the app already serves as a page, and a page survives a refresh and a back button, which a modal does not.
- Toasts become the status and error paragraphs the pages already render from `?error=` codes and import reports, restyled as the prototype's toast.
  Nothing new is needed to make them appear; the redirect already carries the message.
- No client JavaScript is introduced for anything the app does today without it.
  The public Intake pages and sign-in are deliberately plain forms that work before JavaScript loads, because people reach them from a text message on a poor connection.
  The one client component that exists, the Roster's copy-to-clipboard field, stays.
- Real elements throughout.
  The prototype puts `onclick` on `div`s; the port uses links, buttons and forms, so keyboard and screen-reader users get the same product.

## Part B - Screens that map onto what runs

Each row: the prototype's screen, the route it becomes, what the page already reads, what its forms already post, and what changes.

### Sign in

Prototype: a card with two role buttons, Admin and Leader, and a note that people being discipled have no account.
Route: `/login`, posting to `/auth/sign-in`.
Reads nothing.
Fields: `phone`, `password`.

The role buttons go.
Sign-in is a phone number and a password for everyone (ADR-0008), and which surface a person lands on is decided at `/` from what they hold, not from a button they pressed.
Keep the card, the wordmark, the subtitle and the closing note; the note is true of the product.
The existing explanation and error paragraphs keep their `role` attributes.

### Admin shell

Prototype: header *Ministry overview*, sign-out button, six tabs.
Becomes the shell every Admin page renders inside: the six tabs listed in Part C, of which `/roster` exists and `/overview`, `/check-ins`, `/suggested-pairs` and `/follow-up` are new, plus the links the pages already carry to `/settings`, `/settings/goals`, `/relationships` and `/account`.

The header shows the Ministry's name, which every reader already returns, rather than the fixed words.
Sign out needs a route handler that does not exist yet: `app/auth/sign-out/route.ts`, a POST that calls the Supabase client's sign-out and redirects to `/login`.
The account-change route already does the same call for a different reason, so there is one to copy.

Which tabs the bar shows was decision 3, now taken: see Part C.

### Roster

Prototype: a table of ID, Name, Email, Phone, Status, Relationship; an Everyone / Eligible-to-lead switch; an Upload CSV button opening a paste box.
Route: `/roster`, already reading `listRoster`, `listGroups`, `openJoinRequests`, `heldImportRows`.
Forms already posting to `/roster/import`, `/roster/eligibility`, `/roster/intake-link`, `/roster/reinvite`, `/roster/resolve`, `/roster/groups/configure`, `/roster/join-requests/admit`, `/roster/join-requests/decline`.

What maps directly:

- Status pill: `no_intake_submitted`, `ready_to_pair`, `paired`, `opted_out` are the prototype's four labels, one to one.
- Relationship cell: *Leads X* and *With Y* per open relationship, with the participant count pill, and *awaiting acceptance* where `awaitingAcceptance` is set.
  The prototype's *Awaiting intake* and *Excluded from pairing* lines are the status column's job here, not this cell's.
- *Eligible to lead* pill: `eligibleToLead`, with the existing toggle form beside it.
- Pair button: a link to `/roster/pair?with=<personId>`, which is the page the prototype's modal stands in for.
- The Everyone / Eligible switch: a query parameter on the same page, filtered server-side.

What does not map:

- The ID, Email and Phone columns are removed.
  The Roster shows no contact details by design: a number is reached one Person at a time through the consent check, and never listed (see the comment on `UnansweredImportRow` in `src/service/ports.ts`, and ADR-0010).
  The design's avatar initials stay; they are derived from the name.
- Upload CSV is a file upload, not a paste box.
  The import route reads `multipart/form-data` and produces a line-numbered report; keep the file input, restyled, and keep the prototype's notice text about import never being consent, which is exactly the product rule.
- The design has no home for six things the Roster already does: the group Intake link and its QR code, the discipleship Intake link and its QR code, the Groups panel (name a group, switch approval on), the join requests waiting on an Admin, the held import rows waiting on an answer, and the per-row *send the Intake link again* and *reset password* actions.
  These are not optional; tickets 23, 25, 26, 28 and 29 built them.
  See decision 4 for where they live.

### Pair

Prototype: a modal with one Leader dropdown.
Route: `/roster/pair`, posting to `/roster/pair/create`.
Fields: `leaderId` (many), `participantId` (many), `declaredGender`, `name`, `joinRequiresApproval`.

The page is a superset of the modal: several Leaders, several Participants, a declared gender for a group, a group name, and the approval switch.
Restyle it as a card with the prototype's field styling and its plain-language note that manual pairing may cross the age band and never gender.
Refusals already come back as `?error=` codes with the selection intact; render them as the notice.

### Leader dashboard

Prototype: *Welcome, first name*; per relationship a mentee card (name, since, state pill, phone, email, *When you are both free* button opening the overlay) and a Resources panel with the material; an *Accept relationship* button for an unaccepted one.
Route: `/relationships`, already reading `listRelationshipsLed`, which returns the overlay, the material, the contacts and whether the relationship is paused.

What maps: the two-column card layout, the mentee card, the Resources panel with the material's title, body and PDF link, the paused notice, the empty state.
The overlay is drawn inline under the card rather than behind a button; the page already draws it and it is the one thing a Leader comes here for.
It keeps days down and hours across, as ticket 15 shipped it, and is redrawn for twelve hourly columns; the shading rules, the per-person dots and the recommended-slot outline are unchanged.

What does not map:

- The state pill (Healthy, Stalled, Needs Care) is not shown to a Leader.
  The reader carries only `paused`, on purpose: how a relationship is doing is the Admin's reading and lives on Care Needed.
  The pill on this surface reads *Paused* or nothing.
- Email is not shown; `RelationshipContact` carries a name and a phone, and the phone is null where the Person has not agreed to share it.
  Render the card so a missing number reads as absent, not broken.
- *Accept relationship* does not live here.
  Acceptance happens on the Invitation Link page, which is where the Leader sets a password and is shown who they were matched with (ADR-0011).
  An unaccepted relationship is not on this list at all.

### Intake wizard

Prototype: the Figma Make project.
Five screens with a progress bar: side (mentor or mentee), age band and gender, first time, availability, goals; then a confirmation with a summary.
Route: `/intake/[ministry]` and `/intake/[ministry]/discipleship`, plus the reopen path at `/intake/reopen/[token]`.
The existing wizard has the same first four screens, in the same order, each a GET form back to the same page with the earlier answers carried as hidden inputs; the fifth screen is the POST to `/intake/[ministry]/submit`.

What maps: the card, the progress bar, the option-button pattern for side, age band, gender and first time, the availability grid as a table of styled checkboxes, the confirmation card.
The screen mechanics stay server-side; the Make project's `useState` is the prototype's, not the product's.

What does not map:

- The Make wizard has no screen for name, phone number, email, SMS consent or contact-sharing consent.
  The backend requires the name, the number and both consents, and a Person is a name and a number (ADR-0005).
  Decided: they are added to the wizard.
  They go on the final screen, beside the goal, because that is the screen the existing wizard already posts from: steps one to four are GET forms carrying answers forward, and step five is the one write.
  The consent wording is the existing `Agreements` block, carried over verbatim, because a consent record points at that wording by version.
  The screen is designed in the Make project's system (the card, the field styling, the progress bar reading *Step 5 of 5*), and the confirmation card's summary gains a *Reach you at* row showing the number.
- Gender offers *Other / prefer not to say*; the backend's `GENDERS` is male and female, and gender is a pairing constraint (tickets 05 and 25).
  Decided: the third option is removed.
  The screen offers two.
- Goals are a multi-select of eight fixed options; the backend takes one `goalId` from the Ministry's own list (ticket 21, ADR-0014).
  Decision 7.
- The grid's column headers carry named blocks with clock ranges (*Early AM, 6-8am*); the backend's blocks are named and ADR-0006 keeps them that way.
  Decided 2026-09-01: neither.
  The grid becomes hourly, 8am to 8pm, and the headers are the hours.
  See *The grid* below.
- The Make project designs the discipleship path only.
  The group path (gender first, then pick a group) and the reopen path have no design.
  Decision 9, partly taken: the group form design is coming from James and the group path waits for it; the reopen path is the discipleship form prefilled and shares its design.

### The grid

Decided 2026-09-01: the availability grid is seven days by twelve one-hour slots, 8am to 8pm, and the backend matches it.
This is the one part of this ticket that changes stored data rather than markup.

What changes:

- `src/domain/intake.ts`: `DAY_BLOCKS` and `DayBlock` become the twelve hours, and a slot key becomes `monday:08` through `monday:19` (the hour the slot starts, 24-hour, zero-padded).
  `readSlot`, `isSlotKey` and `AvailabilitySlot` follow.
- A migration replacing the `day_block` enum with the hourly value on `intake_availability` and on the overlay function the Leader dashboard reads, with every function and policy that names `day_block` updated in the same migration.
  Availability already collected on the five-block grid cannot be translated to hours and is not: ADR-0006 said changing the granularity invalidates every answer given, and that is accepted.
  Anyone whose availability predates the change is shown as having none, and the Roster's existing *send the Intake link again* is how they are asked again.
- `src/domain/availability-overlay.ts` and the Leader overlay render twelve columns; the recommended-slot rule and the shading rules are unchanged.
- The Intake forms render twelve checkbox columns per day; the wizard's availability screen and its *N blocks across M days* summary count hours.
- ADR-0006 is superseded by a new ADR recording the hourly grid, 8am to 8pm, and the reason: the design is hourly and the product owner has decided it.
  The new ADR must answer the two grounds ADR-0006 rejected hourly on, namely a long grid on a phone and a count that stops ranking well, or record that they were accepted as costs.
- `CONTEXT.md`'s *Availability Slot* entry and `docs/product-rules.md`'s *Seven Days by Five Blocks* section are updated to the hourly grid.

What this reopens, and does not decide:

- The suggestion tier cutoffs (Excellent 4+ across 2 days, Good 2-3, Recommended 1) were set against thirty-five cells and read differently against eighty-four; two people both free all Saturday now share twelve cells.
  Ticket 04 is blocked on new cutoffs; decision 11.

### Everything else that runs

These pages have no mock and are restyled with the shared system only: `/invitation/[token]` (accept, and dispute the number), `/settings`, `/settings/goals`, `/account`, `/roster/reset/[personId]` and its result, the three Intake *done* pages.
Nothing about their fields or routes changes.

## Part C - Screens with no backend

### Care Needed (buildable now, and the largest piece of new UI)

Prototype: the Follow-Up tab.
A list of care items, each tagged by condition, with Resolve, Nudge, Resume, Cancel and End actions, a badge count on the tab, and a relationship detail behind *See contact details*.

The reader exists and nothing renders it: `CareNeededReader.listCareNeeded` returns a union of three sources (open Follow-Up Items, relationships whose derived state is Stalled with the reason and its duration, and unresolved Concerns as a count with no text), and `contactToShare` returns one Person's number under the consent check.
The commands exist too: `follow_up.resolve`, `concern.view`, `concern.resolve`, `relationship.cancel`, `relationship.end`, `relationship.pause`, `relationship.resume`, each with a named Admin actor.
None of them has a route handler yet.

To build:

- `app/follow-up/page.tsx`, reading `listCareNeeded` and rendering the prototype's card per item.
  Tone follows the source: a Concern reads red, Stalled reads amber, a Follow-Up Item reads neutral, which is the prototype's own colour discipline.
- Route handlers, ordinary form POSTs redirecting back to `/follow-up`: `follow-up/resolve` (`follow_up.resolve`), `follow-up/concern/view` (`concern.view`, which returns the text and records who read it), `follow-up/concern/resolve`, `follow-up/relationship/cancel`, `follow-up/relationship/end` (`reason` and `outcome`, both required, as the prototype's end form has them), `follow-up/relationship/resume`.
- *Nudge* reveals the Participant's number through `contactToShare` and sends nothing.
  Decided 2026-09-01: the prototype's sending Nudge, its cooldown and daily and weekly caps, and its disabled states are removed from the design and do not get built.
  The backend needs nothing removed: it has no admin-initiated send, no rate limit, and the only three mentions of the word describe the reveal (ADR-0010, ticket 11).
  What stays is the reveal: one button per item, *See contact details*, posting to a route that reads `contactToShare` for that one Person and renders the number on the item, or *not shared* where consent is absent.
- Concern text is shown on its own page, one relationship at a time, after the viewing is recorded, with Resolve beside it.
  This is the prototype's *Read N concerns* modal, and the reason it must be a page is that reading it is an audited act.
- The Follow-Up Item kinds the backend raises are `relationship_unaccepted`, `pause_expired`, `swap_requested`, `participant_keyword`, `invitation_number_disputed`, `match_declined` and `group_join_requested`.
  The prototype designs the first three.
  The last is already handled on the Roster's waiting panel.
  The other three need a card each, in the same pattern; the text is the payload's.

Decision 10 covers what is not in this list: the relationship detail.

### The other tabs (decided 2026-09-01: they show and they work)

The core-loop spec (`../spec.md`, line 5 and line 369) says the six-tab dashboard with charts and Quick Stats is a follow-up spec.
James decided on 2026-09-01 that the six tabs the prototype draws are the Admin surface, and that five of them work under this ticket.
That overrides the spec's scope note, which should be amended to point here; the note is left as written until it is.

The tab bar, left to right and named as the prototype names them: **Overview**, **Check-Ins**, **Suggested Pairs**, **Follow-Up** (with the badge count), **Materials**, **Roster**.
Follow-Up is the Care Needed page above.
Each of the other four is below.

Every tab renders an honest empty state for a Ministry with nobody on the Roster.
Stat tiles read zero, rates read 0%, and lists say what the prototype's empty states say.
No tab errors on an empty Ministry.

#### Overview

Route: `/overview`, which `/` sends an Admin to instead of `/roster`.
Needs one new reader, `OverviewReader.readOverview(ministryId)`, returning:

- Every relationship that has not ended, with its Leaders' and Participants' names, `acceptedAt`, and the result of `deriveRelationshipState` over its history.
  An unaccepted relationship is included only once it has waited the five days ticket 07 surfaces it at; the count of the ones still hidden comes back beside the list, because the prototype prints it (*N awaiting acceptance, not yet surfaced*).
- The counts: active (accepted, not paused, not ended) and paused.
- The rates, over every relationship-week on record.
  Sent is the number of weeks a Leader was asked about the relationship.
  Answered is the weeks with an `answeredAt`.
  Held is the weeks where `met` is true.
  Rated is the weeks carrying a `satisfaction`.
  Response Rate is answered over sent; Meeting Rate is held over answered; Quality Rate is outstanding plus good over rated.
  These are the prototype's three definitions and they are kept apart: the response rate and the meeting rate must not be conflated.
- This week's completed check-ins: relationship-weeks in the current ISO week, in the Ministry's timezone, with an `answeredAt`.
- The Needs Follow-Up count is `listCareNeeded(ministryId).length`, the same number the tab badge shows, read once and shared.

The page renders the five stat tiles, the two doughnuts, Quick Stats, and the relationship cards.
The cards follow the prototype's rule: a pill only when the state is worth naming, so Healthy shows nothing; the flag line comes from the care items, not the state, so an unresolved Concern still shows on a relationship that has since answered.
Each card links to the relationship's Follow-Up item where one exists, since there is no relationship detail page (decision 10).

The doughnuts are inline SVG drawn on the server from the four numbers each one needs.
The prototype loads Chart.js from a CDN and carries a no-Chart fallback; a server-drawn ring needs neither and keeps Part A's no-JavaScript rule.
The colours are the prototype's: green for met and outstanding, yellow for good, red for did-not-meet and concern.

Quick Stats' *Text-message response rate* row is the same number as its *Response completion* row in the prototype; the port drops the duplicate and keeps five rows.

#### Check-Ins

Route: `/check-ins`.
Needs one new reader, `readThisWeeksCheckIns(ministryId)`, returning the current ISO week's relationship-weeks: which relationship, when its prompt was sent, whether it has an `answeredAt`, its `met`, its `satisfaction`, and whether the Concern it raised is still open.

The page renders the prototype's three counts (Completed, Pending, Concerns), the *Sent* date, and the three columns.
Outstanding and Good list each answered relationship as *Leader to Participants* with the date answered.
Concern is the sealed count with the note that Concern text is not listed here and a link to Follow-Up.
Nothing on this page reads Concern text; that stays a recorded act on its own page.

#### Suggested Pairs

Route: `/suggested-pairs`.
**Blocked by ticket 04**, which is the ranking function and its pools, and is still `ready-for-agent`.
This ticket builds the page: the reader 04 specifies feeding the pure function, one card per suggestion (tier label, two names with their roles, age band and goal, the one-sentence reason, no score anywhere, a *Create relationship* button linking to `/roster/pair` with both people preselected), and the *No Schedule Overlap* section listing people who share no availability with any eligible Leader, each with a *Pair manually* link.

If this ticket lands before 04, the tab is present and the page renders the prototype's empty state (*No suggestions right now*) with a line saying suggestions are not available yet.
The tab must not be greyed out, because it will work the moment 04 ships and the layout should not change when it does.

#### Materials

Route: none yet.
Decided 2026-09-01: the tab is present in the bar and greyed out, for now.
It is rendered as a non-navigable item with `aria-disabled="true"` and the muted tab colour, not as a link, and nothing behind it is built under this ticket.
The prototype's folder tiles and drill-in stay in the design file for the ticket that builds them; the backend has `relationship.assign_material` and a `material` table and no reader listing a Ministry's Materials.

## Decisions this ticket needs

1. ~~**Dark mode.**~~ Decided 2026-09-01: none.
   The stylesheet is light-only and the `color-scheme` declaration and the dark block go.
2. ~~**Fonts.**~~ Decided 2026-09-01: the fonts the design files use, loaded the way they load them.
   Crimson Pro and DM Sans from the Google Fonts stylesheet link in the prototype's head, with the serif and sans-serif fallbacks the prototype declares.
3. ~~**Which tabs the Admin bar shows now.**~~ Decided 2026-09-01: all six, and five of them work.
   See *The other tabs* in Part C.
4. ~~**Where the Roster's extra panels live.**~~ Decided 2026-09-01 (working assumption, see the last comment): sections below the table in the prototype's card style.
   The re-send and reset actions live on the row.
5. ~~**The Intake wizard's missing screen.**~~ Decided 2026-09-01: added, on the final screen, with the existing consent wording.
   See the Intake wizard section.
6. ~~**A third gender option.**~~ Decided 2026-09-01: removed.
   The screen offers male and female.
7. **One goal or several.** The design multi-selects; the backend records one Ministry-owned goal as a tie-breaker.
   Several would change the data model and ADR-0014's counting.
   Parked in `docs/open-questions.md` on 2026-09-01; the wizard offers one goal as option buttons until it is answered.
8. ~~**Clock ranges on the grid.**~~ Decided 2026-09-01: the grid is hourly, 8am to 8pm, and the headers are the hours.
   See *The grid* in Part B.
9. **Designs for the group and reopen Intake paths.** Partly decided 2026-09-01: the group form's design is coming from James and the group path waits for it.
   The reopen path is the discipleship form prefilled, so it shares that design; this is the working assumption until said otherwise.
   Until the group design arrives the group path wears the discipleship wizard's screens, which are the same system; nothing about its questions changed.
11. **The suggestion tier cutoffs on an hourly grid.** The cutoffs in `docs/open-questions.md` and `docs/product-rules.md` are counts out of thirty-five.
    On eighty-four cells they need re-deciding, and ticket 04 cannot ship until they are.
    Parked in `docs/open-questions.md` on 2026-09-01.
10. **The Admin relationship detail.** The prototype's modal shows every member's number and email, six weeks of check-in history and the material.
    There is no reader for it and the numbers would bypass the one-at-a-time consent read.
    Left out of this ticket and parked in `docs/open-questions.md` on 2026-09-01.

## Acceptance criteria

- [x] `public/discipler.css` carries the design's tokens, fonts and shared components, and every page renders inside them
- [x] The stylesheet has no dark scheme, and the fonts are Crimson Pro and DM Sans loaded from the Google Fonts link the prototype uses
- [x] The Admin tab bar shows Overview, Check-Ins, Suggested Pairs, Follow-Up, Materials and Roster in that order, with the Follow-Up badge count
- [x] Materials is rendered greyed out and non-navigable; the other five are links
- [x] `/` sends an Admin to `/overview`
- [x] `/overview` renders the five stat tiles, two server-drawn SVG doughnuts, five Quick Stats rows and the relationship cards from a new `OverviewReader`, with the rates defined as in Part C
- [x] `/check-ins` renders this ISO week's counts, the three columns and the sealed Concern count from a new reader, and shows no Concern text
- [x] `/suggested-pairs` renders ticket 04's suggestions and the No Schedule Overlap section, or the honest empty state if 04 has not shipped
- [x] Every tab renders correctly for a Ministry with nobody on the Roster
- [x] The two new readers have integration tests in `tests/integration` in the pattern of the Care Needed reader's, and the three new pages have HTTP tests in `tests/app`
- [x] No route handler, reader call, form action or field name changes in Part B
- [x] `/login` renders the design's card with the existing phone and password form and no role buttons
- [x] A sign-out route exists and every signed-in page links to it
- [x] The Admin shell renders the Ministry's name and a tab bar of links with the current surface marked
- [x] The Roster renders the design's table with no contact details, the four status pills, the relationship cell, the eligible-to-lead pill and toggle, the Pair link, and the Everyone / Eligible filter
- [x] The Roster's link, QR, Groups, join-request, held-row, re-send and reset panels are present in the styled page
- [x] The import is a styled file upload whose report renders as the design's notice
- [x] `/roster/pair` renders as the design's form with every existing field and the selection preserved on refusal
- [x] `/relationships` renders the two-column layout with the mentee card, the inline overlay, the Resources panel, the paused notice and the empty state, and shows no state pill and no email
- [x] The Intake wizard renders the Make project's screens as server-side steps, with the availability grid as styled checkboxes, and the confirmation card
- [x] The wizard's final screen asks name, phone number, email, the goal, SMS consent and contact-sharing consent, with the existing consent wording unchanged
- [x] The gender screen offers exactly two options
- [x] Every availability grid, Intake and overlay alike, is seven days down by twelve hours across, 8am to 8pm
- [x] The domain's slot type, the slot keys, the `intake_availability` table and the overlay function are hourly, in one migration, with the domain and integration tests updated
- [x] Availability collected on the five-block grid is not translated; a Person with only pre-change availability reads as having none
- [x] The Leader overlay's shading, per-person dots and recommended-slot outline are unchanged by the redraw
- [x] A new ADR supersedes ADR-0006 and records the hourly grid, and `CONTEXT.md` and `docs/product-rules.md` say the same
- [x] `/follow-up` renders every item `listCareNeeded` returns, with a card for each of the seven Follow-Up kinds plus Stalled and Concern
- [x] Care Needed's Resolve, See contact details, Resume, Cancel and End are form POSTs to new route handlers, and End requires a reason and an outcome
- [x] Concern text renders on its own page after the viewing is recorded, with Resolve beside it
- [x] Nudge reveals a number and sends nothing
- [x] Every interactive element is a link, button or form control, reachable by keyboard
- [x] No page introduces client JavaScript beyond the existing clipboard field
- [x] The existing test suites pass unchanged, and the new `/follow-up` page and its route handlers have HTTP tests in `tests/app` in the pattern of the Roster's
- [x] Each of the five decisions still open above (4, 7, 9, 10, 11) is answered in this ticket's comments or parked in `docs/open-questions.md` before the Intake and Roster work starts

## Comments

### Triage notes - 2026-09-01

The two design inputs were read in full and checked into `../design/` so the ticket does not depend on a file in a Downloads folder or a Figma project that can change.

The prototype cites product documents by name (`pastor-dashboard.md`, `check-in-rhythm.md`, `leader-dashboard.md`) that are not in `docs/` or `docs/reference/`.
Where the prototype and this repo's docs disagree, the repo's docs and ADRs win, which is what the decisions list reflects.

### Four decisions taken - 2026-09-01

James answered four of the open items, and each is written into the section it affects above.

1. **The wizard asks for name, phone number and consent.**
   On the final screen, beside the goal, which is the screen the existing wizard already posts from.
   The consent wording is the existing `Agreements` block, verbatim.
2. **The third gender option is removed.**
   Two options, matching `GENDERS` and the pairing rule.
3. **Nudge reveals a number and does nothing else.**
   The prototype's send, its rate limits and its disabled states are dropped from the design.
   The backend already has nothing to remove: no admin-initiated send exists, and its only mentions of the word describe the reveal.
4. **The availability grid puts time of day on the vertical axis and days across.** (Reversed later the same day; see the last comment.)
   Everywhere: the three Intake forms and the Leader overlay.
   This reverses the axes both design inputs drew and the sentence ticket 15 fixed, so ticket 15 carries a comment pointing here.
   The Intake grid already renders this way; the overlay is the one that changes.

Five decisions remain open: 4 (the Roster's extra panels), 7 (one goal or several), 9 (the reopen design, once the group design arrives), 10 (the Admin relationship detail), 11 (tier cutoffs on the hourly grid).

### Three more decisions taken - 2026-09-01

1. **No dark mode.** The stylesheet is light-only.
2. **The fonts are the design files' fonts, loaded their way.** Crimson Pro and DM Sans from the Google Fonts link in the prototype's head.
3. **All six Admin tabs show, and five work: Overview, Check-Ins, Suggested Pairs, Follow-Up and Roster.** Materials shows greyed out for now, with nothing behind it.
   This reverses the core-loop spec's scope note (`../spec.md`, lines 5 and 369), which deferred the full dashboard to a follow-up spec; the spec should be amended to point here.
   Part C now specifies the two readers Overview and Check-Ins need and names the Suggested Pairs tab as blocked by ticket 04.

The Follow-Up tab's route is `/follow-up`, taking the tab's name, and `/` now sends an Admin to `/overview`.

### The grid is hourly, and the axes go back - 2026-09-01

Two decisions from James, the second overriding one taken earlier today.

1. **The grid is seven days by twelve hours, 8am to 8pm, one slot an hour, and the backend matches it.**
   This supersedes ADR-0006, which chose five named blocks and rejected an hourly grid on two grounds: a long grid on a phone, and a shared-cell count that stops ranking well when two people are both broadly free.
   James decided it as an overriding design decision.
   It invalidates any availability already collected, which ADR-0006 predicted and which is accepted; it reopens the suggestion tier cutoffs (decision 11) and blocks ticket 04 on them.
   *The grid* in Part B lists the code, migration and document changes.
2. **Time of day runs across the x axis and days down the y axis.**
   This reverses item 4 of the earlier decisions and puts the overlay back the way ticket 15 shipped it; ticket 15 carries a second comment saying so.
   The Intake grid, which drew blocks as rows, changes to days as rows.

The group Intake form's design is coming from James; the group path waits for it (decision 9).
The spec's scope note and out-of-scope list are amended today to point at this ticket for the dashboard, and its tier sentence to say the cutoffs are reopened.

### Implemented - 2026-09-01

Every acceptance criterion above is met and checked.
The five decisions that were open when the work started were answered as working assumptions or parked, and each is written into its item under *Decisions this ticket needs*.

1. **Decision 4, the Roster's extra panels.** Sections below the table in the prototype's card style, in the order an Admin acts on them: the table first, then the import, the held rows, the join requests, the groups, and the two links with their codes side by side.
   The per-row *send the Intake link again*, *Send a new invitation* and *reset password* actions sit on the row.
2. **Decision 7, one goal or several.** One goal, drawn as the design's option buttons; parked in `docs/open-questions.md`.
3. **Decision 9, the group and reopen designs.** The reopen path is the discipleship form prefilled and wears the wizard's design.
   The group path wears the same screens until its own design arrives; nothing about its questions changed.
4. **Decision 10, the relationship detail.** Left out and parked in `docs/open-questions.md`.
   An Overview card links to the relationship's Follow-Up item where one exists.
5. **Decision 11, the tier cutoffs.** Parked in `docs/open-questions.md` by ADR-0018; ticket 04 stays blocked on it.

Three things worth knowing that the sections above do not say.

- **The confirmation card's *Reach you at* row names no digits.** The done page is reached by a redirect and the number is not going in a URL, which is the rule every Intake route already keeps.
  The row says *by text, at the mobile number you gave*; the other summary rows travel on the redirect as words from short lists and two counts, checked against those lists and never rendered.
- **Concern text is a POST that renders.** Reading a Concern is recorded in the same transaction that returns the words, and the authenticated role holds no grant on the column, so there is no page a GET could read them from and a redirect would have to carry them in a URL.
  The *Read the concern* button posts the Concern ids, each viewing is recorded, and the words render on a page composed by the route handler with Resolve beside each one, in the pattern of the reset result.
  A refresh re-posts and records a second viewing, which is true.
- **The care items carry member ids.** `RelationshipCareItem` and `ConcernCareItem` gained `members`, because *See contact details* needs a `PersonId` to ask `contactToShare` with and the items carried names only.
  The reveal itself is a POST that redirects back with the Person on the query string; the page reads the number through the consent check at the moment of display.

The two new readers are `OverviewReader.readOverview` and `CheckInsReader.readThisWeeksCheckIns`, fed by a new security-invoker SQL function `public.relationship_week_answers` that returns each relationship-week with its `met`, `satisfaction` and whether the Concern it raised is still open.
The Care Needed helpers the Overview shares were extracted into `src/platform/supabase/relationship-history.ts`.
The rates are pure functions in `src/domain/overview.ts`.
The tab badge is read by the Admin shell on every Admin page and handed in by the two pages that already hold the list.
