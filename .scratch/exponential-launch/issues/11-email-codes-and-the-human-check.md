# 11 - Email codes and the human check

**What to build:** The server side of sign-up's first three steps: Turnstile verification and the 6-digit email code.

**Blocked by:** 01, 10

**Status:** shipped

## The rule

- Every Turnstile token is verified at `https://challenges.cloudflare.com/turnstile/v0/siteverify`, checking `success`, `hostname` and `action`; an unset secret refuses.
- Turnstile is checked before a code is sent, and again with a fresh token before the account is created.
- Codes live in an operator-only `pending_signup` table: 6 digits from `crypto.randomInt`, stored only as an HMAC-SHA256 under a server secret, compared in constant time.
- A code expires after 10 minutes, is single use, and dies after 5 wrong tries.
- It is bound to one attempt by a random ID in an httpOnly, SameSite=Lax cookie.
- It can be resent after 60 seconds, with caps per email and per network each hour, kept in Postgres.
- Codes are never logged and never put in a URL.
- The password is never stored in `pending_signup`.
- "Send me a code" answers the same whether or not the email has an account; an existing account's owner is emailed "someone tried to sign up with your email" instead of a code.

## Acceptance

- A code from one attempt does not verify another attempt's email.
- The sixth try fails even with the right code.
- The two answers to "send me a code" look the same and take about the same time.
- No code appears in any log line.

## For James

1. Create a Turnstile widget in Cloudflare with `app.trydiscipler.com` and the staging host on it, and set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`.
2. Set `SIGN_UP_CODE_SECRET` to a fresh `openssl rand -base64 32`, a different one per environment.
3. Set `SIGN_UP_OPEN=true` on staging when ticket 15 is there to try, and on production only once the privacy policy and terms are published (Q30).
4. Approve the wording of the two emails in mock-up 1, in `codeEmail` and `signUpAttemptNotice` in `src/domain/sign-up-attempt.ts`; the spec gives neither word for word.
5. Push the two migrations with the rest of the launch.

## Comments

### Built (2026-11-03)

- `src/service/sign-up.ts` is the whole of the flow, and `getSignUp()` in the container is what builds it.
- `src/domain/sign-up-attempt.ts` decides where an attempt stands (`standingOf`), the caps and the two emails, with the numbers in `EMAIL_CODE` in `src/domain/launch-terms.ts`.
- `src/platform/cloudflare/turnstile.ts` asks `siteverify` and needs `success`, `hostname` and `action` all right; it fails closed on an unset secret or a Cloudflare that does not answer.
- `src/platform/sign-up-code-keeper.ts` makes the code with `crypto.randomInt`, seals it as an HMAC-SHA256 keyed to the attempt, and compares in constant time.
- `src/platform/supabase/pending-signups.ts` keeps `pending_signup` and `pending_signup_send`, both operator-only and in `OPERATOR_ONLY_TABLES`.
- A cookie's attempt ID, a code and a cap's address and network are held only as digests.
- An address with an account runs every step a free one runs, a code made and sealed included, then keeps no seal and is sent `signUpAttemptNotice`, so no code can ever prove that attempt and it reads like any other from then on.
- The routes under `app/signup/` answer 404 until `SIGN_UP_OPEN=true`.

### What tickets 15, 16 and 17 are assumed to call

Nothing here has been seen by those tickets, which are not triaged yet, so each may change this.
All four routes take form fields, answer JSON, and on a refusal answer `{ refusal, message }` with the status saying what kind, as `app/account/phone/` does.

| Page | Call | Answer |
| --- | --- | --- |
| Page one (15) | `POST /signup/human-check` with `token`, from a widget with the action `HUMAN_CHECK_ACTIONS.startSignUp` | `{ passed: true }`, and the attempt's cookie is set |
| Page two (15) | `POST /signup/send-code` with `email` and `phone` | `{ sent: true, email, resendInSeconds }` |
| Code page, "Send a new code" (16) | `POST /signup/resend-code` | as above, or `signup.resend_too_soon` with `resendInSeconds` |
| Code page, "Continue" (16) | `POST /signup/confirm-code` with `code` | `{ verified: true, email }`, or `signup.wrong_code` with `triesLeft` |
| Any page, on the server | `getSignUp().standing(cookie value)`, with `SIGN_UP_ATTEMPT_COOKIE` from `app/signup/attempt-cookie.ts` | which step they belong on, and what it shows: `email`, `triesLeft`, `resendInSeconds` |
| Any page, on the server | `signUpIsOpen(process.env)` from `src/platform/sign-up-switch.ts` | whether to show sign-up at all |
| Set up your account (17) | `getSignUp().readyToOpen({ attempt, humanToken })`, with a token from a widget with the action `HUMAN_CHECK_ACTIONS.openChurch` | `{ ready: { pendingSignupId, email, phone } }` |
| Opening the church (17) | `spendPendingSignup(client, pendingSignupId, at)` inside provisioning's transaction | false on the second of a double click, so roll back |

- On `signup.human_check_needed` the page goes back to page one.
- On `signup.already_verified`, the second of a double click, the page goes on to Set up your account.
- "Use a different email" (the mock-up) and "Change email" (ticket 16) have to pass page one again, and a page can carry what was typed across it.
- `app/signup/copy.ts` holds drafted sentences; the wrong-code line is the mock-up's.

### Decisions made

- **The switch.** No switch existed (ticket 15's comment says so), so `SIGN_UP_OPEN` is new, and only the exact value `true` opens it.
  A Vercel Preview stays shut whatever it says, because it shares production's database.
  The alternative was leaving out the routes, which would leave the cookie rule unbuilt and untested.
- **The human check is judged on page one, not when the code is asked for.** A pass starts the attempt and sets the cookie, so the pastor is not refused for typing for over five minutes, which is how long a token lasts.
  The alternative was carrying the token to page two, which also gives the code page's resend no token to spend.
- **One pass, one address.** A different address on the same attempt goes back through the check, while a resend to the same address needs no fresh token.
  This reads "Turnstile is checked before a code is sent" as per address, not per email.
  The alternative was a fresh token for each send, which would put a widget on the code page, which the mock-up does not draw.
- **The caps are 5 emails per address and 30 per network each hour**; neither ticket nor spec gives numbers.
  The network's is generous because a conference's wifi is one network.
  A notice counts as a code does, and a send that failed still counts, as a Verify request does.
- **A new code starts with five fresh tries and ends the old code.** At the address cap that is at most 25 guesses an hour at one address.
  The alternative was keeping tries across a resend, as ticket 09 does because Twilio holds them, which would leave a new code with few or no tries.
- **A used code answers `signup.already_verified`**, a refusal, so "single use" is literal.
  The alternative, answering `verified` again, reads kinder to a double click, and the page handling this code gets the same result.
- **The email goes before the answer, not after it.** Both answers wait on one send, so they take about the same time, and a Resend failure can be told to the pastor as `signup.not_sent`, with the same answer for an address with or without an account.
  The alternative, `after()`, makes timing exact but leaves somebody waiting on a code that never came.
- **The phone is kept on the row** until ticket 17 uses it, and the row is swept a day after it began, so nothing is permanent yet, as ticket 15 asks.
  Non-US numbers are refused here too, using ticket 09's `isUsPhone`.
  Whether the phone already has an account is not checked or told here, because that would break the "same answer" rule; ticket 17's provisioning refuses it.
- **"Has an account" means `auth.users.email`**, which is where ticket 17 puts the verified address.
  No account has an email today, so until ticket 17 ships every address reads as free.
- **Lifetimes the spec does not give:** a pass lasts 30 minutes and a proven address 60, both in `src/domain/sign-up-attempt.ts`.
- **The code is in the email's body and not its subject**, so it is not on a locked phone's screen.
- **The notice carries no link.** A stranger's typing should not make Discipler send anybody a button, and `EmailField.link` refuses a staging host anyway.
- **`signup` is now a reserved short name**, in the domain and in a second migration, because every top-level route has to be one.
  That migration refuses to run if a Ministry holds `signup`.
- **Scenarios run twice:** `tests/support/sign-up-scenarios.ts` runs on a store in memory in `tests/domain` and on the real tables in `tests/integration`.
