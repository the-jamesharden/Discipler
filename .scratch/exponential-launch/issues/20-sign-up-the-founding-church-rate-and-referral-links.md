# 20 - Sign-up: the Exponential special offer and referral links

> **Triaged 2026-11-04.**
> The screen is `s2-email-phone.html` (`?offer=referral` and `?offer=none` for the other two) in `~/Downloads/discipler-grill-baseline-v2/.lavish/signup-checkout/`, approved by James on 2026-10-29.

**What to build:** The booth QR link that opens sign-up with `EXPO26` applied and shows the offer, the code typed by hand, `/r/<code>` referral links, each church's code, and the record of who invited whom.

**Blocked by:** 17

Ticket 18 is no longer a blocker, because nothing here needs the payment page.

**Status:** ready-for-agent

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
