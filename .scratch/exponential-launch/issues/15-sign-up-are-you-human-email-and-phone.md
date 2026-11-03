# 15 - Sign-up: are you human, email and phone

> **Triaged 2026-11-03 against the spec's "Self sign-up" and "Decided in the mock-up 1 review", and the approved mock-up.**
> The screens are `.lavish/signup-checkout/s1-human.html` and `s2-email-phone.html?offer=none`.
> The mock-up draws a line above the widget, "One moment, please. We're making sure you're a real person."; the review removed it, so the spec wins and it is not built.
> The offer drawn over page two (`s2-email-phone.html`) is ticket 20's, not this one's.

**What to build:** The first two pages of sign-up at `app.trydiscipler.com/signup`: the automatic human check, then one page asking for an email and a mobile phone.

**Blocked by:** 11

**Status:** ready-for-agent

## The pages

- Every page is subtitled "Create an account", under the Discipler wordmark, on the botanical frame sign-in wears.
- Page one, `/signup`, runs Cloudflare Turnstile, automatically when it can, and goes on by itself when it passes.
  It has no explanatory line: the widget, then "Already have an account? Sign in".
- Page two, `/signup/email`, shows "Step 1 of 3" and "Your email", and asks for an email and a mobile phone.
- Under the email field: "This will be your login email."
- Under the phone field, word for word: "By continuing, you agree to receive texts from Discipler at this number, including sign-in codes and test check-ins. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help."
  The opt-in page, the privacy policy and the Twilio registration quote this sentence.
- The button is "Email me a code", and "Already have an account? Sign in" is under it.
- Continuing sends the email code (ticket 11) and records nothing permanent yet.
- The phone's consent is recorded with `consent_source` `ministry_setup` when the church is opened in ticket 17, not before.
- A referral code or `EXPO26` arriving in the address is carried through the flow in the address, not a cookie.
- Each step has its own address, and the attempt's standing decides the page, so a reload, the back button and an old tab all land right.

## Sign-up stays shut

`SIGN_UP_OPEN` (ticket 11) answers the comment below.
While it is not exactly `true`, or on any Vercel Preview, every sign-up page is a 404 like the routes beside it, and nothing on the page says sign-up exists.
It stays off on production until James says the privacy policy and terms are live (spec, Q30).

## Not in this ticket

- The Exponential special offer over page two, and reading `code` or `ref`: ticket 20.
- "Create an account" on the sign-in page.
- Set up your account and anything after it: tickets 17 and 18.

## Acceptance

- Without a valid Turnstile token no code is sent.
- A non-US mobile number is refused with a plain message.
- The fine print appears exactly as above.
- The pages work at phone width with no sideways scrolling.
- While the switch is off every page answers 404, shown over HTTP on a built server.

## For James

1. Approve mock-up 1 before this is built. Done.

## Comments

- From reviewing ticket 36 (2026-10-31): ticket 36 drafted the legal pages but built no switch, so "sign-up stays off until they are published" (spec, Q30) is this ticket's to hold.
  Triage it with a way to keep the sign-up pages closed on production until James says the privacy policy and terms are live.

### Built (2026-11-03)

- `app/signup/page.tsx` and `human-check.tsx` are page one, and `app/signup/email/` is page two.
- `app/signup/flow.ts` holds the addresses, what is carried and which refusal means another page, and `app/signup/standing.ts` is what every page asks first.
- `app/signup/copy.ts` holds the words, with `TEXTING_FINE_PRINT` checked by a test against `docs/legal/privacy-policy.md` and `docs/legal/sms-opt-in-sign-up-section.md`.

### Decisions made

- **The spec and this ticket disagree on when consent is recorded.** The spec says continuing records it; this ticket and ticket 17 say opening the church does.
  `consent_record` belongs to a Person in a Ministry, and neither exists on page two, so the spec's sentence cannot be built as written without a new table.
  Nothing is texted before the church opens, so no text goes out without the record, and this ticket stands. The spec's sentence should be reworded when this ticket is merged.
  Ticket 17 should decide whether the record's time is the opening or the press of "Email me a code", because the row keeps only the latest send.
- **Carried names:** `code`, as the mock-up's `/signup?code=EXPO26` draws it, and `ref` for what `/r/<code>` redirects with, which no document names; ticket 20 may rename it in `app/signup/flow.ts`.
  A value is carried only if it could be a code (`[A-Za-z0-9_-]`, up to 64 characters), so nothing a stranger puts in a link is repeated back. The alternative was carrying any value and leaving it to ticket 20.
- **Going through page one again** is `/signup?again=1`, because page one otherwise sends somebody with an attempt on to the page they stand on.
- **What was typed crosses page one in `sessionStorage`** and is forgotten once the address is proven, so a phone handed back at a booth keeps nothing after its tab closes.
  The alternatives were putting a phone in the address, or having the new attempt read the old row.
- **Refusals are sentences under the field, not the browser's bubbles** (`noValidate`), so the page speaks in one voice.
- **A double click sends one email:** the second is answered "too soon", which goes on to the code page.
- **The widget is let out into the card's padding** so its fixed 300 pixels fit a 360-pixel phone, and is the compact one where even that is too narrow.
- **A failed check offers "Try again", which reloads**, because a reload also helps when Cloudflare's script never arrived. It uses Turnstile's `retry: never`, so the words and the widget do not disagree.
- **Cloudflare's dummy site key was used for the browser check**, with `siteverify` and Resend answered inside the local server, so neither vendor was called with anything real.
