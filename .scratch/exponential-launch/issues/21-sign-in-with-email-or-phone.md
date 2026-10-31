# 21 - Sign in with email or phone

**What to build:** The sign-in page takes one box, "Email or phone", and a password.

**Blocked by:** 17

**Status:** needs-info

## The rule

- An entry with an `@` is an email, anything else a phone in today's formats.
- An Admin who signed up by email may sign in with either.
- Leaders and Admins without an email keep signing in by phone, as ADR-0008 says.
- A wrong email, wrong phone and wrong password get the same message.

## Acceptance

- A self-signed-up Admin signs in with their email and, separately, with their phone.
- Every existing sign-in test still passes.
- The message for an unknown email and for a wrong password is the same.

## For James

1. Approve the relabelled box in mock-up 1.
