# 21 - Sign in with email or phone

> **Triaged 2026-11-04.**
> The screen is `s0-sign-in.html` in `~/Downloads/discipler-grill-baseline-v2/.lavish/signup-checkout/`, approved by James on 2026-10-29.

**What to build:** The sign-in page takes one box, "Email or phone", and a password, and gains the "Create an account" button.

**Blocked by:** 17

Its accounts are the first to have an email.

**Status:** ready-for-agent

## The page

`app/login/page.tsx`, as drawn, in order:

- "Email or phone", with `autoComplete="username"`, and "Password".
- **Sign in**, the plain button, no longer highlighted.
- "new to Discipler?", then **Create an account**, a full-width green button styled like "Sign in", opening `/signup`.
- The note: "People being discipled have no account and no dashboard. They take part entirely over text. Leaders who sign in with a phone number: if you've forgotten your password, ask whoever runs Discipler at your church to reset it."

"Forgot your password?", drawn under the password box, is added by ticket 22.
"Create an account" shows only while sign-up is open (`signUpIsOpen`), so production's page does not offer a 404.
This settles *nothing links to sign-up yet* in `docs/open-questions.md`.

## The rule

- `/auth/sign-in` reads one field, renamed from `phone` to `login`: an entry with an `@` is an email, lowercased, and anything else is a phone through `asPhoneNumber`.
- An Admin who signed up by email may sign in with either.
- Leaders and Admins without an email keep signing in by phone, as ADR-0030 says.
- A wrong email, a wrong phone and a wrong password all get "That email or phone and password did not match."
- An entry with no `@` that cannot be a phone keeps its own sentence, reworded to "That does not look like an email or a phone number. Include the area code.", because it is a typo the person can fix and says nothing about any account.
- "Enter your email or phone and your password." replaces the missing-credentials sentence.
- The file comments naming ADR-0008 as the whole rule are corrected to ADR-0030.

## The guessing limit

The limit in ticket 13 is per account, so the two doors must share one count.
Otherwise a guesser gets ten tries by phone and ten more by email on the same account.

- `SignInAccount` gains `{ email }`.
- For an entry with an `@`, the trusted connection looks up the account's phone, and the attempt counts under `phone:<number>` when there is one.
- An address nobody holds counts under its own `email:` key, so it is held back in the same way, and the lookup happens either way.
- The network count is unchanged.

## Acceptance

- A self-signed-up Admin signs in with their email, in any capitals, and separately with their phone.
- Every existing sign-in test still passes, with the test helpers changed only for the renamed field.
- The message for an unknown email, an unknown phone and a wrong password is the same.
- Ten wrong passwords by email hold back the phone on the same account, and the reverse.
- Ten wrong passwords against an email nobody holds are held back the same way.
- A Leader with no email signs in as before.
- `/auth/sign-in` still works as a plain form post before JavaScript has loaded.
- The change-your-password form still works for an account that has an email.
- The page is checked at 390 pixels wide.

## For James

1. Nothing to approve: the page is settled.
2. Email sign-in needs Supabase's email provider left on, as `supabase/config.toml` says, and staging's first sign-in proves it.
   Check it on production before opening sign-up.
