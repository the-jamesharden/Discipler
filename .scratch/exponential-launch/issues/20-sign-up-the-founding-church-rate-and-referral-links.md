# 20 - Sign-up: the Exponential special offer and referral links

> **Triaged 2026-11-04.**
> The screen is `s2-email-phone.html` (`?offer=referral` and `?offer=none` for the other two) in `~/Downloads/discipler-grill-baseline-v2/.lavish/signup-checkout/`, approved by James on 2026-10-29.

**What to build:** The booth QR link that opens sign-up with `EXPO26` applied and shows the offer, the code typed by hand, `/r/<code>` referral links, each church's code, and the record of who invited whom.

**Blocked by:** 17

Ticket 18 is no longer a blocker, because nothing here needs the payment page.

**Status:** ready-for-human

The typed code and the popup are drawn in mock-up 6, `c1-have-a-code.html` and `c2-code-sent.html` in `~/Downloads/discipler-grill-baseline-v2/.lavish/forgot-and-code/`, and James said to build them (2026-11-04).

## The email page's button and the popup

James changed these in mock-up 6, and they apply to every sign-up, with or without a code:

- The email and phone page's button reads "Continue", no longer "Email me a code".
- Pressing it goes to the code page as before, with a popup over it: heading "Login code sent", then "A login code has been sent to {email}.", and an "OK" button that closes it and puts the cursor in the code box.
- The popup shows once, on arrival from "Continue". A reload, or "Send a new code", which already has its own sentence, does not show it.
- The code page underneath keeps its words.
- `docs/consent-language.md` and `docs/legal/sms-opt-in-sign-up-section.md` name the old button, so change them with it, keep every code comment and test in step, and report whether the legal document's wording was filed anywhere.

## The offer screen

- `app.trydiscipler.com/signup?code=EXPO26` runs the human check, then opens the email and phone page with the offer over the whole screen, as the mock-up's flow draws it.
- It reads, in bold capitals, "EXPONENTIAL SPECIAL OFFER", "60 DAYS FREE", "THEN 20% OFF YOUR FIRST YEAR", "FOR CHURCHES THAT JOIN THROUGH EXPONENTIAL", and is closed by "CLAIM MY OFFER".
- Confetti fires once, from the top and bottom edges, and not at all when the device asks for reduced motion.
- It never says "applied automatically", and never says "coupon" or "founding church rate".
- After "CLAIM MY OFFER" the email and phone page is underneath.
- After that the offer appears where the mock-ups draw it: the prices and the line under the button on "Set up your account".
  The older line here saying it is named on every sign-up page is dropped.

## The rule for a code

- `offerFor` in `src/domain/offers.ts` already decides: case does not matter, and after the end of 2026-12-11 Pacific the code is refused.
- An expired code shows no offer screen, and shows "That code has expired, but your free trial still applies." on the email and phone page, and sign-up carries on at the normal price.
- `carriedFrom` in `app/signup/flow.ts` already carries `code` and `ref` through each step's address, and ticket 17 saves the code on `church_signup`.
- `ref` stays the name of the parameter.

## A referral

- `app.trydiscipler.com/r/<code>` redirects to `/signup?ref=<code>` (James, 2026-11-04), because `trydiscipler.com` is on GitHub Pages, which has no redirects by path.
- Arriving with `ref` shows, on the email and phone page, "You were invited by another church. Your first paid month is on us."
- It never names the inviting church.
  The older line here allowing a name if the inviter opted in is dropped: mock-up 5 has no such choice, and the screen drawn has no name.
- An unknown or retired code shows sign-up with no banner, the same as no code, at the same speed.
- A referral code and `EXPO26` together show and apply only the offer, and the inviting church still earns its credit (ticket 32).

## Who invited whom

Ticket 32 said it owned these, but it waits on this ticket, and an invited church has to be recorded the moment it opens, so they are built here:

- Each church's one live code, random from a CSPRNG (Crockford base32, about 10 characters), made when a church opens and given to every existing church in the same migration.
  A code is a row with a `retired_at`, so a retired one is kept and never live again; ticket 32's "Get a new link" is what sets it.
- The operator-only `referral` table, with a unique invited church.
- `provisionMinistry` records the referral from the carried `ref`, when it names a live code, in the opening transaction.
- `getInvitations()` in `src/service/container.ts` answers from that table, and no longer answers no for every church.

Ticket 32 keeps the Refer page, "Get a new link", the events and the credit.

## Acceptance

- Scanning the QR code on a phone reaches the offer screen, then sign-up with the rate shown.
- A typed lowercase `expo26` works.
- Reduced motion shows the offer with no confetti.
- An unknown `/r/` code cannot be told from a live one by anything but the banner's absence.
- A code retired in the fixture reads the same as an unknown one, and records no `referral`.
- A church invited with a live code has one `referral` row and gets the first paid month, and `wasInvited` is true.
- A church's code is never its name, and every existing church has one after the migration.
- `EXPO26` with a referral gives the offer and leaves the `referral` row in place.

## Small choices made here

These are recorded so James can overrule them.

- A reload after "CLAIM MY OFFER" does not show the offer screen again in that tab.

## For James

1. Decided 2026-11-04: a small "Have a code?" link on the email and phone page opens one box, and a good code shows the offer screen, as drawn in mock-up 6.
2. Print the booth QR code and flyer, once the address is settled: `https://app.trydiscipler.com/signup?code=EXPO26`.
3. Publish the "Start your ministry" button on trydiscipler.com.

## Comments

Built on `wave4/20`, on top of tickets 17, 18, 19 and 21.

### What was built

- The email and phone page's button reads "Continue" on every sign-up, and the code page opens under the "Login code sent" popup, whose OK puts the cursor in the code box.
- `/signup?code=EXPO26` opens the offer over the whole screen with confetti once, none under reduced motion, and "CLAIM MY OFFER" leaves the email and phone page underneath.
- "Have a code?" opens one box, and `/signup/apply-code` answers it, so a typed code obeys the same `offerFor` as one in the address.
- `/r/<code>` redirects to `/signup?ref=<code>`, and a live `ref` shows the banner.
- Migration `20261104110020_referral_codes_and_who_invited_whom.sql` adds `referral_code`, the operator-only `referral`, `app.issue_referral_code`, the trigger that gives every new church its code, the backfill for every existing church, and reserves the short name `r`.
- `provisionMinistry` records the referral inside the opening transaction when the carried `ref` names a live code, and `getInvitations()` now answers from that table.
- The account page posts `ref`, as ticket 17 asked, and the email to support@ names the invited month when no code outranks it.
- `docs/consent-language.md` and the screenshot placeholder in `docs/legal/sms-opt-in-sign-up-section.md` say "Continue".

### Decisions on gaps, each with its alternative

- "No second offer after a claim" is `claimed=1` in the address.
  It does not flash on a reload, it survives "Use a different email", and a fresh scan in a new tab shows the offer again.
  The alternative was sessionStorage, which only answers once the page has hydrated, so the offer would flash.
- The popup's "once" is `sent=1` on arrival from "Continue", removed from the address by `replaceState` as soon as it shows.
  The alternative was sessionStorage again, with the same flash and a stale flag after a failed send.
- A typed code is decided on the server by `/signup/apply-code`, never by the browser's clock.
  The alternative was reloading the page with `?code=`, which loses what was already typed in the two boxes.
- A code carried in the address that nobody recognizes says "We don't recognize that code, but your free trial still applies." and shows no "Have a code?", following James's "only shows when somebody arrived with no code".
  The alternative was showing the link so that they could correct it.
- "Have a code?" does show on a referral arrival, because that arrival has no code, and a referred church may hold `EXPO26`.
  `s2-email-phone.html?offer=referral` was drawn before mock-up 6 and has no link; the alternative was hiding it there.
- Any `ref` preselects "Another ministry" on the account page, even an unknown or retired one, so that nothing but the banner tells them apart.
  The alternative was preselecting only for a live code, which would tell them apart and needs one more read.
- The code is issued in the database by a trigger, so every way of opening a church gets one, including the operator's.
  The alternative was issuing in `provisionMinistry` with Node's crypto, which a later way of opening could miss.
- The code's randomness is the bytes of `gen_random_uuid()`, a CSPRNG already in Postgres, with the version and variant positions left out.
  The alternative was adding `pgcrypto` for `gen_random_bytes`.
- `referral_code` is church-scoped and select-only to `discipler_command`, and ticket 32 adds its own grants for "Get a new link".
  The alternative was granting those now, for code nothing yet calls.
- The `referral` row's inviting church and code are set null when they are deleted, so the invited church keeps its month.
  The alternative was a cascade, which would take a church's month away when its inviter closes.
- `/r/<code>` answers 404 while sign-up is shut, like every other sign-up address, and reads nothing, so it cannot tell a live code from an unknown one.
- A code in a link reads the same in any case, and `r` is reserved as a short name so that no church's readable link can collide with `/r/`.
- Focus stays where it is after "CLAIM MY OFFER", rather than moving to the email box, so that a phone's keyboard does not jump up over the page.
- Escape closes the popup as OK does, and Tab stays inside it and inside the offer screen.
- The offer screen sits above everything at z-index 1000 and scrolls on a short screen, and its canvas is fixed.
- `pending_signup.agreed_at` has a new comment in this migration naming "Continue", and the old migration's comment stays as history.

### What was looked at

The changed pages were looked at in headless Chrome at 390 and 1280 pixels, on a production build with stand-ins for Turnstile and Resend, and compared with the mock-ups.
The look found two differences, both fixed: the popup's paragraph took `.card p`'s margin and pushed OK down by 12 pixels, and the refusal sentence's line height was tighter than drawn.
The app's DM Sans renders a little heavier than the mock-ups' on the buttons and the offer's small line; that was left alone.
The card's foot is 12 pixels shorter than `c1-have-a-code.html`, because the script after that mock-up's last paragraph stops `.card p:last-child` matching; the built foot matches `s2-email-phone.html?offer=referral`.

### What in this ticket turned out wrong

- The banner is one sentence in the ticket, but mock-up 5 draws two pieces: a title with no period, then "Your first paid month is on us."
  The mock-up is followed.
- `CONTEXT.md` and `docs/product-rules.md` said `trydiscipler.com/r/`, and now say `app.trydiscipler.com/r/<code>`.
- `spec.md`'s "For James" item 7 still asks for a `/r/<code>` redirect on the marketing site, which is no longer needed; the spec is left for James to change.

### Draft words for James

Both are also in `docs/open-questions.md` under *sign-up's numbers and wording*.

- A code in the address that nobody recognizes: "We don't recognize that code, but your free trial still applies."
- The email to support@: "Offer: The first paid month free, invited by another church".

### The legal document

`docs/legal/sms-opt-in-sign-up-section.md` does not look filed.
It is headed as a draft, not yet published or reviewed by a lawyer, the old button's name appeared only in its screenshot placeholder, and it says to publish before ticket 38's campaign is submitted.
The live `trydiscipler.com/sms-opt-in/` has no sign-up section and does not contain "Email me a code".
Twilio's own records were not checked, because this ticket does not touch Twilio.
The fine print's sentence is unchanged.

### What later tickets must build on

- Ticket 32 reads `referral` (`invited_church`, `inviting_church`, `referral_code`, `invited_at`) on the trusted connection.
- Ticket 32's "Get a new link" sets `retired_at` and then calls `app.issue_referral_code(church)`, and needs its own grants for both.
- Any later migration that replaces `app.short_name_is_reserved` must keep `r`.
- Ticket 38's screenshot of the email and phone page shows "Continue".
- The flyer and the QR code use `https://app.trydiscipler.com/signup?code=EXPO26`.
