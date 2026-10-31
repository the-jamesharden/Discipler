# 29 - The unpaired pop-up

> **Triaged 2026-10-31 against the spec's "The unpaired pop-up" and its mock-up 3 decisions.**
> The screens are `.lavish/onboarding/s6-popup.html` and `s6-popup-one.html`.

**What to build:** A dismissible bottom-right card on Overview telling the Admin how many people need pairing or need an Intake link.

**Blocked by:** Nothing

**Status:** ready-for-agent

## The card

- Headed "Waiting on you", with one line for each count above zero: "{n} people are ready to pair and aren't in a relationship yet." and "{n} people haven't filled in their Intake form yet.", singular when the count is one, as `s6-popup-one.html` draws it.
- Pair them opens Suggested Pairs.
- Send Intake links opens the Roster showing only people who haven't sent an Intake; the Roster has no such list today (`app/roster/lists.ts`), so this ticket adds one, reachable by its own address.
- It is the larger size drawn in round 2: wider, with larger words and buttons.

## The rule

- It counts Ready to Pair people in no relationship, and No Intake Submitted people, leaving out Admins and anyone opted out.
- It shows only when either count is above zero.
- It shows on the first Overview visit of each sign-in and of each new day, in the church's timezone.
- Closing it, or moving to another tab, hides it until the next sign-in or the next day.
- Its counts come from Overview's existing read.
- Ticket 31's chat hides it while open; that part is ticket 31's.

## Acceptance

- Signing in shows it on Overview; visiting Roster and coming back does not show it again that day.
- An opted-out person is never counted.
- Send Intake links lands on a Roster of only the people who haven't sent an Intake.

## Comments

### Built (2026-10-31)

- The counts come from the Overview's own read: `overview_page` gains a `waiting` part (`supabase/migrations/20261101230000_waiting_on_you.sql`), so `overview_card_page` carries it too and the Check-Ins tab does not.
- `app.waiting_on_you` counts Ready to Pair people with no open membership on either side, and No Intake Submitted people, leaving out Admins (`admins_on_the_roster`) and anyone removed from the Roster; an opted-out person is counted in neither by their status.
- It is `security definer` with the Roster's own `app.is_admin_of` test, as `public.roster` is, because a Participation Status is read off the whole `person` row and no browser grant reaches every column of it (ADR-0021); only the two counts leave it.
- The domain is `src/domain/waiting-on-you.ts` (`isAnybodyWaiting`, `showingOf`), the words and addresses `app/overview/waiting-on-you.ts`, the card `app/overview/waiting-on-you-card.tsx`, and whether it is on screen `app/overview/unpaired-pop-up.tsx`.
- The Overview page gains one import and one line, after the pair card, so the merge with the other session's Overview changes stays small.
- The styles are a block of their own in `public/discipler.css`, under the relationship cards, copied from mock-up 3's `onboard.css`.
- `docs/pastor-dashboard.md` describes it at the end of the Overview section.

### Decisions made

- **Where the showing is kept: the browser's `localStorage`, one key, holding the last showing the card was shown in.**
  A showing is `showingOf(session, now, timeZone)`: the church's calendar day (the Ministry Timezone, by the server's clock) and the Auth session id the token names, which the page function returns.
  So a new sign-in or the church's midnight starts a new showing, and the card shows on the first Overview visit of each.
  It is written the moment the card shows, so closing it, moving to another tab and coming back, or reloading the Overview all leave it away until the next showing.
  Opening a pair card or changing the growth chart re-renders the Overview around it and does not hide it, since that is not moving tab.
  Alternative: a table recording each Admin's showings; rejected because a page read must write nothing, a sign-in is one browser's already, and it would add a table and a write path for a hint.
  Where the browser refuses storage (some private windows) it shows on every visit rather than never.
  The card is never in the server's markup, so a visit that has seen it does not flash it before the script hides it; without script it does not show.
- **Send Intake links goes to `/roster?pairings=awaiting-intake`, the Roster menu's existing Awaiting Intake option**, which is exactly the people whose Participation Status is No Intake Submitted.
  The ticket says the Roster has no such list; it has had one since Roles per pairing, ticket 02 (`app/roster/menu.ts`), with its own address, so no new list was added.
  **Needs James:** that list includes an Admin who has not sent an Intake (provisioning leaves every Admin so), while the card's count leaves Admins out, so a church whose pastor has no Intake reads "2 people haven't" and lands on three rows, the pastor's own first.
  Alternatives: give the Roster an address-only view that also leaves Admins out (a new Roster rule and a menu state with no option), or count Admins on the card; neither was taken without James.
- **Singular when a count is one**: "1 person is ready to pair and isn't in a relationship yet." and "1 person hasn't filled in their Intake form yet."
  `s6-popup-one.html` draws one line (only one count above zero) rather than a count of one, so the singular wording is new screen copy; nothing is texted.
- **One line, one button**: each line brings its own button, and the first button is the green one, as the two mock-ups draw it (only Send Intake links, green, when only the Intake count is above zero; only Pair them when only the pairing count is).
- **Ready to Pair "in no relationship" means no open membership on either side**, an unaccepted one included: Ready to Pair already means discipled by nobody, and a Leader of a relationship is in one.
  A person an import planned a pairing for is still counted, since a plan is not a relationship.
- **Its place**: the bottom-right corner (1.4rem in), because the Ask Discipler circle mock-up 3 sits it above (5.6rem up) is ticket 31's and not on the page yet.
  **For ticket 31's merge:** raise `.unpaired`'s `bottom` to `5.6rem` when the circle lands, and hide the card while the chat is open.
- On a phone (560 pixels and narrower) it spans the width with 16-pixel gutters and sits 16 pixels from the bottom, because the mock-up's 25rem card ran off a 390-pixel screen.
- The close button is labelled "Dismiss", as the mock-up has it; the card is an `aside` named "People waiting on you".

### Looked at

- At 1280 it matches `s6-popup.html` and `s6-popup-one.html` in words, size, colours, border, shadow and buttons, in the corner rather than above the circle.
- At 390 it fits inside the page's gutters with no horizontal scroll.
- Signing in shows it; Roster and back, and a reload, do not; a fresh sign-in shows it again; Dismiss closes it; Pair them lands on Suggested Pairs and Send Intake links on the Awaiting Intake Roster.
