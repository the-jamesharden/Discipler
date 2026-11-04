# 22 - Forgot password

> **Triaged 2026-11-04.**
> Mock-up 1 draws only the link on the sign-in page, "Forgot your password?".
> This ticket's old line asked James to approve "the link, the page and the email in mock-up 1", but the request page, the new-password page and the email were never drawn.

**What to build:** "Forgot your password?" on the sign-in page, emailing a one-time reset link to an Admin with a verified email (Q29, ADR-0030).

**Blocked by:** 10, 21

**Status:** ready-for-agent

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
