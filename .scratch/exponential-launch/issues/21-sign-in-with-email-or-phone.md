# 21 - Sign in with email or phone

> **Triaged 2026-11-04.**
> The screen is `s0-sign-in.html` in `~/Downloads/discipler-grill-baseline-v2/.lavish/signup-checkout/`, approved by James on 2026-10-29.

**What to build:** The sign-in page takes one box, "Email or phone", and a password, and gains the "Create an account" button.

**Blocked by:** 17

Its accounts are the first to have an email.

**Status:** ready-for-human

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

## Comments

### 2026-11-04: built on `wave4/21`, not merged

**What was built.**
`/auth/sign-in` reads one field, `login`, through `readSignInEntry` in `src/domain/accounts.ts`.
`SignInAccount` gains `{ email }`, and `createPostgresSignInLimit` looks the address up in `auth.users` every time, so an email counts under the phone of the account holding it, and an address nobody holds counts under its own `email:` key.
`app/login/page.tsx` is the mock-up's page, with "Create an account" only while `signUpIsOpen` says so.
No migration.

**How it was checked.**
`tests/integration/signing-in-with-email-or-phone-over-http.test.ts` drives a built server, and `tests/integration/the-sign-in-guessing-limit.test.ts` gained the port's side.
Setup Link Admins and Invitation Link Leaders sign in over HTTP in their own suites, through the renamed field.
The full locked suite passed: 326 files with none skipped, and 5227 tests with 1 skipped, the older `it.skip` in `tests/integration/invitation-over-http.test.ts`.
The type check is clean.

A production build in headless Chrome, typing with real input events at 390 pixels and with JavaScript turned off: an email in capitals and an Admin's phone landed on `/overview`, and a Leader's phone on `/relationships`.
With JavaScript on, an email landed on `/overview`, a wrong password got the sentence below, and "Create an account" opened `/signup`.
The page, its three failure sentences, its notice and the shut page were looked at beside the mock-up at 390 and 1280 pixels, with no horizontal scroll in any state.
A first browser run landed everybody on `/login`: it posted to `127.0.0.1`, and Next builds a route's redirect from `localhost`, so the cookie was on the other host.
That was the harness and not the product: it passed on `localhost`, and this ticket did not change how the redirect is built.
I did not check it on a Vercel deployment, so staging's first sign-in is the proof of that.

**Where the ticket was wrong.**
"Every existing sign-in test still passes, with the test helpers changed only for the renamed field" could not hold.
Two tests in `tests/integration/admin-signs-in.test.ts` asserted that the door refuses an email, which is what this ticket reverses.
One now asserts `no-such-account` for an account holding no address; the other, an account holding only an address that could not get in, is replaced by a test that it can.
Every other sign-in test changed only the field's name.

**A trap for whoever touches this.**
Supabase Auth keeps a phone without its `+`, and a number read from the box has one, so the lookup adds it back.
Left alone, ten by email and ten by phone would be two counts, and only the over-HTTP and port tests would catch it.

**Decisions on gaps, each with its alternative.**

- The failure code stays `unreadable-phone` while its sentence changes, because the existing tests name it and the browser never shows it; the alternative was renaming it.
- A page loaded before the deploy still posts `phone`, and gets "Enter your email or phone and your password." on the new form, so one extra press; the alternative was reading both fields, which the ticket's "one field" rules out.
- An account holding an address and no phone can now sign in with it, and `changePassword` falls back to the email for such an account rather than throwing; the alternative was refusing accounts with no phone, which adds a rule nobody asked for.
- A NUL in a hand-made entry is taken out for the lookup, because Postgres refuses one in text, so it gets the ordinary answer and not a 500; the alternative was a separate refusal.
- "Leave room" for ticket 22 is a marked place in the password's field, not a blank gap, so the page has no unexplained space until then; I tried the link there in the browser and it fits as drawn. The alternative was reserving the height now.
- "Create an account" is exactly the height and size of "Sign in", as the ticket says; the mock-up's own CSS draws it 8 pixels shorter, in a slightly smaller type, which reads as an accident.
- The box turns off capitals and correction on a phone's keyboard, which the mock-up cannot show; the alternative was leaving it to the lowercasing, with a capital showing as it is typed.
- The real page's botanical frame is the one every centred page has, and differs a little from the mock-up's sprigs at 390 pixels; I left it alone.

**Not built, and already true before this ticket.**
Every failure that is not `invalid_credentials`, an outage included, reads as "did not match" with nothing logged, as the route has always done.
Not measured: Supabase Auth may answer faster for an unknown account than for a wrong password, which would let a patient outsider tell them apart by timing, by phone as much as by email. The one sentence closes the words and not that, if it is real.

**Draft words for James.**
None: every sentence here is the ticket's.
The two checks below are in `docs/open-questions.md` under *sign-up's numbers and wording*.

**For James, on production, which this build did not touch.**

1. Supabase's email provider must be on, or every email sign-in reads "did not match".
2. Count the rows in `auth.users` with an email: any such account can now sign in with it, proven or not, and the count should be zero until sign-up opens.

**What the next tickets build on.**

- **22:** the link goes at the marked place in `app/login/page.tsx` as `<p className="hint">`. A reset's request should count the way `{ email }` does here if it adds a limit.
- **Any test that posts to `/auth/sign-in` by hand:** the field is `login`. A post with the old name fails with `missing-credentials`, which a test asserting only `/login?error=` would pass by accident.
- **Browser checks:** open a local server by `localhost`, not `127.0.0.1`, or a right password appears to fail.
