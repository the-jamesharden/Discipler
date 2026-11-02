# 11 - Email codes and the human check

**What to build:** The server side of sign-up's first three steps: Turnstile verification and the 6-digit email code.

**Blocked by:** 01, 10

**Status:** ready-for-agent

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
