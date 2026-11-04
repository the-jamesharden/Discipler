# 25 - Contact, bug and feature form

> **Triaged 2026-11-03 against the spec's "Help, What's new and office hours", "Search, nav and Settings", "Email" and "Security", and approved mock-up 2, at James's instruction to build it now.**
> Mock-up 2 (`.lavish/top-nav-search/v-b2-help.html`, the Round 2 section of `build.mjs`) draws the Help menu and its "Contact support" row, and no form behind it, so the form's words are drafts for James.
> `docs/legal/privacy-policy.md` already promises what is built here: a bug report records the page's address and the browser, Turnstile guards the signed-out form, and messages are deleted after 12 months.

**What to build:** One form from the Help menu for contacting support, reporting a bug or asking for a feature, stored and emailed to support@.

**Blocked by:** 10, 23

**Status:** shipped

## What was true before

- The Help menu's "Contact support" row is written in `HELP_MENU` in `app/top-nav-menus.ts` with a null address, so it is not drawn.
- `/help` is public and reads no session, and says "Still stuck? Write to support@".
- `EMAIL_KINDS` already routes `supportRequest`, `bugReport` and `featureRequest` to support@, and `EmailField.quoted` was written for this form's message.
- `createTurnstile` and `HumanCheck` exist, with actions for sign-up only.
- No job deletes anything after 12 months, and the privacy policy promises it of these messages.

## The rule

- The form is one page, `/help/contact`, with one choice of three: get help, report a bug, request a feature.
- It is under `/help`, so it needs no new reserved short name.
- The Help menu's "Contact support" opens it, and so does the Help pages' "Still stuck?" line, which is the signed-out way in.
- A signed-in Admin's submission is stored with the church, under `discipler_command` for that one church, readable by nobody in the app; a page holds no grant on it.
- Anybody else's is stored operator-only, behind Turnstile and a per-network limit.
- A bug report attaches the page address and the browser, never the page's content or a screenshot.
- The address is the path alone: no query string, no fragment, and any segment that is not a plain route word (a person's ID, a token) shown as `{id}`.
- Neither is kept on a request for help or a feature.
- The email to support@ is plain text with every field escaped, and nothing submitted goes into a header: the subject is the kind and Discipler's own reference.
- The typed address is in the body and not in `reply_to`, which stays support@ as the sender's rule says.
- Submissions are kept 12 months, then deleted, by the tick.
- The sender is not changed.

## Not in this ticket

- The Admin's own email on file: no account has one until ticket 17, so the form asks.
- Deleting mail from the support@ inbox after 12 months, which the privacy policy also promises and is a setting in the mailbox, not code.

## Acceptance

- A bug report from the Roster carries its address and browser and no names.
- A signed-in Admin is limited to a few submissions an hour.
- A signed-out submission is refused without a passed Turnstile token, and over the network's limit.
- Nothing a page can read holds a submission.
- The tick deletes a submission older than 12 months and keeps one younger.

## For James

1. Mock-up 2 was approved for the menu's row; the form behind it was not drawn, so look at it and its words.
2. Push the migration with the rest of the launch.
3. Set the mailbox's own retention, because the privacy policy also promises that support emails are deleted after 12 months.

## Comments

### Triaged (2026-11-03)

This ticket was `needs-info` only until mock-up 2 was approved, and James has approved it.
Mock-up 2 draws the Help menu's "Contact support" row and nothing behind it, so the form's layout follows the product's own form styles and its words are drafts in `app/help/contact/copy.ts`.
The three choices and the bug report's sentence are the words `app/help/content/getting-help.md` already published.

### Built (2026-11-03)

- `src/domain/support-form.ts` reads the form (`readSupportForm`), cleans the address (`pageAddressOf`) and composes the email (`supportEmail`).
- `src/service/support-form.ts` is the whole flow, and `getSupportForm()` in the container builds it.
- `src/platform/supabase/support-submissions.ts` keeps both tables, on the migration `20261104102500_the_support_form.sql`.
- `/help/contact` is the page, `/help/contact/send` the route, and `app/help/contact/copy.ts` every word.
- `app/help/contact/from-this-page-link.tsx` is the Help menu's row, set in `HELP_MENU` as ticket 23 left room for.
- The tick's `sweepTheSupportSubmissions` deletes what is older than `SUPPORT_SUBMISSIONS.keptMonths`, from both tables, on the trusted connection, and answers `supportSubmissions` in its JSON.

### What the sender's rules allow, and the one thing they cannot promise

The spec's Email section says no email carries congregation names, phone numbers or Concerns.
The sender is not changed, and this is how the form sits inside it.

- **Met:** plain text, every field made by `EmailField`, nothing submitted in a header.
  The subject is the kind and the first part of the row's own ID, and `reply_to` stays support@.
- **Met:** a phone number typed into the message or anywhere else is replaced with "[phone number removed]" in the email, as `EmailField` always does.
  The row keeps what was typed, and no page can read the row.
- **Met:** what the form attaches by itself carries no name, because the address is a path with its IDs replaced and nothing is read from the page.
- **Not enforceable:** a name or a Concern somebody types into the message reaches support@.
  A name is a plain string, so nothing can tell it from any other word, which is what ticket 10 wrote down of `EmailField`.
  The form asks people to leave names and numbers out, and that is a request and not a guarantee.
  Matching against the Roster was not built: it would cut words like Grace and Hope out of real messages, and it has nothing to match for somebody signed out.
  The alternative that would keep the rule absolutely is an email holding only the kind and the reference, read from the row by an operator, which gives up "emailed to support@" as the spec has it.
  So this is James's to decide, and is listed for `docs/open-questions.md`.

### Decisions

- **Kept first, then emailed, and the tick sends what a failed send left.**
  The person is told it was received once it is kept, so a Resend outage loses nothing and nobody retypes.
  It costs one column and one loop in the deletion's pass.
  The alternative was telling them it failed and asking them to write to support@, which leaves a row nobody would ever read.
- **The form asks for an email address, signed in or not.**
  No account has an email until ticket 17, and the reply has to go somewhere.
  The alternative for an Admin was looking up their phone, which no email may carry, or leaving replies to a person with database access.
  Ticket 17 can prefill it.
- **Limits: 5 an hour per Admin and 10 an hour per network**, in `SUPPORT_SUBMISSIONS` in `src/domain/launch-terms.ts`.
  The ticket says "a few", and a conference's wifi is one network, so the second is a little higher.
  A request whose network cannot be read counts as one shared network rather than going uncounted.
- **A Leader counts as signed out**: the human check, the network's limit, and a row with no church.
  The Help menu is Admins' only for now, and this asks for no second read to find a Leader's church.
  The alternative was reading it, for a form they are not offered.
- **`/help/contact` and not `/contact`**, so no reserved short name and no migration for one.
- **The signed-out way in is the Help pages' "Still stuck?" line.**
  The ticket names a signed-out path and no door to it, and those pages are the public ones.
  It now reads "Still stuck? Send us a message or write to support@...", and the sign-in page is unchanged.
- **With no Turnstile site key, somebody signed out is shown the support address instead of a form**, because the form could only refuse them.
- **The address is carried by the Help menu's link**, because the header is a server component with no address of its own, and neither `Referer` nor `document.referrer` follows a client navigation.
  It is the one client component the header gains, and it is not prefetched, so no page's read count changes.
- **The first segment must be one of the app's routes, and any later one a plain route word, or it shows as `{id}`.**
  `/join/{shortName}` and `/intake/{shortName}` keep a church's own public short name.
- **The form posts with `fetch` and stays on screen**, as the phone check does, so a refusal never costs anybody what they typed.
  Without a script it says to write to support@, and a press before the page comes alive still posts rather than putting the message in an address, landing on the route's JSON.
- **Turnstile shows nothing unless it needs a press** (`appearance: 'interaction-only'`), and pressing Send before it has answered says to wait a moment or write to support@, because a browser that blocks Cloudflare never gets an answer.
- **Rows go with their church** (`on delete cascade`), and `submitted_by` is no foreign key, so a row outlives an account until its own day.
- **`whyNotSent` moved from `src/service/sign-up.ts` to `src/service/email-sender.ts`**, unchanged, because two callers now need it.
- **Mail in the support@ inbox is not touched.**
  The privacy policy promises "support emails" are deleted after 12 months too, and that is a retention setting on the mailbox.

### Looked at in a browser (2026-11-03)

Headless Chrome on a production build, at 1440, 390 and 320 wide, with Cloudflare's public test site key: the Help menu, the form, a bug report, sent, refused, signed out and the "Still stuck?" line.
The menu's row matches mock-up 2, no page scrolls sideways, and a person's page reaches the form as `/roster/{id}`.
Turnstile's script loaded and its box stayed at no height, and no signed-out send passed through a real Cloudflare answer in the browser.

**Open: an intermittent React error 418 on Admin pages, cause not found.**
The page recovers by rendering in the browser, and nothing looked wrong on screen.
It came on some visits and not others, with the machine under heavy load.
In the one run that tracked the page across both kinds, it came on 3 of 20 visits to pages with the Admin header and 0 of 10 to pages without.
In a paired run of 40 visits each, the build as committed had 2, both on `/roster`, and the build without `FromThisPageLink` had none.
That points at the link without proving it, because the two runs were not under equal load and 2 in 40 is few.
What mismatched was never captured, which needs a dev server under the shared lock.
On 2026-11-03, on the combined wave 3 branch, it did not come back in 275 visits: 125 on a dev server and 150 on a production build, across `/roster`, `/help/contact`, the Overview, Settings and Help, with the browser's CPU throttled sixfold, and the production run with 16 busy processes beside it.
So what mismatched is still not captured and the cause is still not found, and the machine's load in that run reached about 23 where the sightings were at about 50.
It stays in `docs/open-questions.md`.

**At merge: one Turnstile loader.**
The support form's box has its own class, `contact-human-check`, because its rules on `.human-check` collapsed ticket 15's box, so the widget always measured as compact there.
Both checks now load the script through `loadTurnstile` and pick the widget's size through `widgetSizeFor`, in `app/turnstile-widget.ts`, so a client navigation between them cannot load it twice, and the support form's widget is light like the sign-up page's.
Sign-up gave up `next/script` for this.
Seen in headless Chrome at 1440, 390 and 320 wide with Cloudflare's test key: one script, no sideways scrolling, and the compact widget only at 320.

**Decided by James on 2026-11-03.**
What somebody typed may reach support@, phone numbers stripped, and the spec's sentence is reworded to cover what Discipler composes.

### Closed out (2026-11-03)

Looking at the form and its words is parked in `docs/open-questions.md`, under "Open: what wave 3 left James to do in Stripe and on production", and the mailbox's retention under "Open: nothing deletes what the privacy policy says is deleted".
