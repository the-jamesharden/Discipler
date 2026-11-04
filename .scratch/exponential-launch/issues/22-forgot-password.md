# 22 - Forgot password

> **Triaged 2026-11-04.**
> Mock-up 1 draws only the link on the sign-in page, "Forgot your password?".
> This ticket's old line asked James to approve "the link, the page and the email in mock-up 1", but the request page, the new-password page and the email were never drawn.

**What to build:** "Forgot your password?" on the sign-in page, emailing a one-time reset link to an Admin with a verified email (Q29, ADR-0030).

**Blocked by:** 10, 21

**Status:** ready-for-human

The screens and the email are drawn in mock-up 6, `f1-request.html`, `f2-sent.html`, `f3-new-password.html`, `f4-link-dead.html` and `m1-reset-email.html` in `~/Downloads/discipler-grill-baseline-v2/.lavish/forgot-and-code/`, and their words are James's (2026-11-04).
The link reads "Forgot your password?", as drawn; the docs' "Forgot password?" names the feature.

## The rule

- `/login` links to a request page that asks for one thing, an email address, behind Turnstile.
- Asking always answers the same, in about the same time, whether or not the email has an account.
  So the page after "Send me the link" says "Email sent." to everyone, including an address where nothing was sent; James asked for that wording, and it is a known trade.
- An address on the account of an Admin gets `passwordReset`.
  Anybody else gets nothing, and Leaders keep today's reset by an Admin.
- The link is single use and expires in 30 minutes.
- The token is random, kept only as a SHA-256 digest in an operator-only table named in `OPERATOR_ONLY_TABLES`, and is never logged.
  It is Discipler's own, in the shape of `ministry_setup`, rather than Supabase's recovery link, because Supabase's expiry is one setting for the whole project and its link signs the person in.
- A newer link replaces an older one for that account.
- Opening the link only shows a page and does not spend it, so an email scanner following the link cannot use it up.
  Pressing the button spends it.
- `newPasswordRefusal` decides the new password, and `supabaseAccounts.setPassword` sets it, which ends every session, as ADR-0016 says.
- It does not sign them in: the page goes to `/login` with a notice, like a password change does.
- Requests are limited per email and per network, with the caps `sendAllowed` uses for sign-up's emails in `src/domain/sign-up-attempt.ts`, held in Postgres.

Sign-up cannot open without this ticket, since a self-signed-up Admin has nobody above them to reset a lost password.

## Acceptance

- A reset link works once, and not after 30 minutes.
- After a reset, the Admin's other sessions are signed out.
- A known email and an unknown one get the same page and take about the same time.
- A Leader's phone or an address with no Admin behind it sends nothing.
- A link opened twice and pressed once still works.
- An older link stops working when a newer one is sent.
- The sixth request for an address in an hour sends nothing and answers the same.
- A common password is refused on the new-password page, and the link stays live.
- No token appears in any log line, and the email holds no congregation data.

## Small choices made here

These are recorded so James can overrule them.

- A reset clears that account's sign-in failures, so somebody who locked themselves out by guessing can get straight back in.

## For James

1. Done 2026-11-04: the request page, the new-password page and the email are as redrawn in mock-up 6 round 2. The Leaders' sentence and the "Saving signs you out everywhere" sentence are removed.

## Comments

### 2026-11-04: built on `wave4/22`, not merged

**What was built.**
"Forgot your password?" on `/login` opens `/login/forgot`, which posts to `/login/forgot/ask` behind Turnstile.
The email's link opens `/login/forgot/[token]`, and "Save new password" posts to `/login/forgot/[token]/save`.
`createForgotPassword` in `src/service/forgot-password.ts` holds the rule, and `createPostgresPasswordResetLinks` in `src/platform/supabase/password-reset-links.ts` holds the tables.
The migration `20261104110022_forgotten_passwords.sql` adds `password_reset_link` and `password_reset_request`, both operator-only and both named in `OPERATOR_ONLY_TABLES`.
`passwordResetEmail` in `src/domain/password-reset.ts` is the `passwordReset` email, as text and HTML.
`SignInLimit` gains `forgive`, which a successful reset calls.
`app/help/content/signing-in.md` now names the link as it reads on the page.

**How it was checked.**
`tests/integration/forgot-password.test.ts` drives the real routes against the real tables with fakes at Cloudflare and Resend, and covers every line of the acceptance list.
`tests/integration/forgot-password-over-http.test.ts` drives a built server, including signing in by email and by phone with the new password.
The full locked suite passed: 335 files with none skipped, and 5512 tests with 1 skipped, the older `it.skip` in `tests/integration/invitation-over-http.test.ts`.
The type check is clean.

A production build in headless Chrome, with real input events, at 390 and 1280 pixels, with Cloudflare's public always-pass test key in the browser, a local stand-in for siteverify and for Resend:

- The link on `/login` reached the request page, and a malformed address got the field's error.
- A known address and an unknown one both got "Email sent.", and the unknown one sent no mail.
- The link opened twice stayed live, and a common password got its sentence and left the link live.
- A double click on "Save new password" landed on `/login?notice=password-changed`, and signing in with the email in capitals reached `/overview`.
- Opening the link again showed the dead page, and "Send me a new link" opened `/login/forgot`.
- The mail came from `Discipler <hello@notify.trydiscipler.com>` with the right subject and reply-to.
- The server log held no token, and there was no horizontal scroll in any state.

The pages, their refusals, the notice and the email were looked at beside the mock-ups at both widths.
That look found one thing, now fixed: on a phone the address on "Email sent." broke one letter before its end, so it now breaks after its `@`.

I did not check a real Turnstile secret, real Resend, or `after()` on a Vercel deployment, so staging's first reset is the proof of those three.
The browser did load Cloudflare's widget script for the test key, as ticket 17's check did; no secret and no siteverify call reached Cloudflare.

**Where the ticket was wrong.**
"No token appears in any log line" holds for everything Discipler logs, and a test proves that.
It cannot hold for Vercel's own request log, which records the path, and the token is in the path, as it is for Setup and Invitation Links.
Whoever can read that log can already read the environment; the alternative is a URL fragment, which fails without a script, and I kept the path for one way of doing links.
Also, `tests/app/the-sign-in-page.test.ts` asserted that the page leaves this link to this ticket, so that test is gone.

**A trap for whoever touches this.**
The send happens in `after()`, not in the request, and that is the whole of "about the same time".
Awaiting it there would tell a stranger which addresses have an account, and `answers before the email leaves` is the test that catches it.

**Decisions on gaps, each with its alternative.**

- A failed send is only logged, as `A reset email for link ... did not go`, because the person has already been told it went; the alternative was answering differently, which gives the account away.
- `password_reset_request` is its own count rather than sharing `pending_signup_send`, so a stranger typing somebody's address into sign-up cannot use up that person's resets; the alternative was one count, as the ticket's "the caps `sendAllowed` uses" could be read, and the caps themselves are the same.
- A phone or anything else that is not an address gets a field error and sends nothing, and says nothing about any account; the alternative was "Email sent." to a phone number, which reads as false.
- The email goes to the address as the account holds it, not as it was typed; the alternative was the typed spelling, which lets a hand-made entry steer the mail.
- The link shows on `/login` whether or not sign-up is open, because a self-signed-up Admin must keep it if sign-up is shut again; the alternative was hiding it behind `signUpIsOpen`. Until sign-up opens it answers "Email sent." and sends nobody anything.
- The link's row is locked across `setPassword`, so two presses at once let one through, and a failure leaves the link live with a draft sentence; the alternative was spending it first, which loses the link when Supabase fails.
- `forgive` also removes that account's rows from the network's count, since it deletes them; the alternative was keeping the network's count, which needs a second table for what the ticket does not ask.
- If `forgive` fails the password is still reset and the failure is logged; the alternative was failing the reset over a counter.
- "Save new password" takes one press in the browser, because a second press would land on the dead page after the first had worked; the server alone already lets only one through.
- A stale cookie is left alone on a reset, unlike the change-your-password route, because the browser may hold somebody else's session and the next sign-in replaces it; the alternative was signing that browser out.
- Whether the account is still an Admin is checked at the ask and not at the press, and a password changed some other way does not end a live link, since both live for 30 minutes at most; the alternative was a second check for a window that short.
- `passTurnstile` is added to `app/turnstile-widget.ts`, and `AccountForm` keeps its own copy because `app/signup` was off limits here; a later ticket can move it over.
- The page's words split into `copy.ts` files because the common-password list must stay out of the browser's bundle; I grepped `.next/static` and it is not there.
- "Send me a new link" is 47 pixels tall against the drawn 39, through ticket 21's `a.btn.full`, so that it matches the buttons beside it within 2 pixels; ticket 21 recorded the drawn height as an accident, and the shared rule stays.
- The botanical frame is the app's own rather than the mock-up's extra sprigs, as in ticket 21, and the widget's place on the page reuses `.opening-check` from sign-up.
- The email's heading falls back to Georgia, since web fonts do not load in email, as the payment reminder's does.

**Draft words for James.**
All are also in `docs/open-questions.md` under *sign-up's numbers and wording*.

- An entry that is not an address: "That doesn't look like an email address. Please check it and try again."
- A human check that did not pass: "We couldn't confirm you're a real person. Please try again."
- A browser running no script: "This page needs JavaScript. Please turn it on, or write to support@trydiscipler.com and we'll help."
- A password that could not be set: "We couldn't save your new password just now. Please try again in a minute."

**For James, before relying on it in production.**

- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` must be set, or every press of "Send me the link" reads as not a real person.
- `RESEND_API_KEY` and `RESEND_EMAIL_DOMAIN` must be set, or the page says "Email sent." and only the log says otherwise.

**What later tickets build on.**

- Ticket 37: the security headers must allow Cloudflare's script and frame on `/login/forgot`, as on `/signup`, and its `Referrer-Policy` keeps the token out of any other site's logs, so it must not be loosened on `/login/forgot/[token]`.
- `HUMAN_CHECK_ACTIONS.forgotPassword` is this page's Turnstile action, in case Cloudflare's dashboard is ever filtered by action.
- `SignInLimit.forgive(userId)` clears an account's sign-in failures, for anything else that proves who somebody is.
- The migration needs pushing with the rest of the wave, before this code is live.
