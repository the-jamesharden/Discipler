# 22 - Forgot password

**What to build:** "Forgot password?" on the sign-in page, emailing a one-time reset link to an Admin with a verified email (Q29).

**Blocked by:** 10, 21

**Status:** needs-info

## The rule

- The link is single use and expires in 30 minutes.
- Asking always answers the same, whether or not the email has an account.
- Resetting ends every session, as ADR-0016 says for a password change.
- Requests are rate-limited per email and per network.
- Leaders keep today's reset by an Admin.

## Acceptance

- A reset link works once and not after 30 minutes.
- After a reset, the Admin's other sessions are signed out.

## For James

1. Approve the link, the page and the email in mock-up 1.
