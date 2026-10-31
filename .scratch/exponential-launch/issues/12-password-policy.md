# 12 - Password policy

**What to build:** Passwords are at least 8 characters, may be 64 or longer, and may not be a common password (Q28).

**Blocked by:** nothing

**Status:** ready-for-agent

## The rule

- `SHORTEST_PASSWORD` in `src/domain/accounts.ts` stays 8.
- `minimum_password_length` in `supabase/config.toml`, 6 today, becomes 8.
- A password on a blocklist of common passwords is refused with its own refusal code.
- No character-class rules.
- The same rule applies at sign-up, at invitation, at a password change and at a reset.

## Acceptance

- `password1` is refused at sign-up, at invitation and at a password change.
- A 100-character password is accepted.
- `supabase/config.toml` and the domain constant agree.

## Comments

### Built (2026-10-31)

- One rule, `newPasswordRefusal` in `src/domain/accounts.ts`, exported for sign-up (ticket 17) and the emailed reset (ticket 22) to call: at least `SHORTEST_PASSWORD` (8) characters, at most `LONGEST_PASSWORD_BYTES` (72) bytes, and not on the common-password list in any capitals.
- Its three refusal codes, `account.password_too_short`, `account.password_too_long` and `account.password_too_common`, are the type `NewPasswordRefusal`, part of both `AccountCreationRefusal` and `PasswordChangeRefusal`.
- The list is `src/domain/common-passwords.ts`: SecLists' `Passwords/Common-Credentials/100k-most-used-passwords-NCSC.txt` at commit `1a7bb9127eca9e6ff2fc0301c597fe6e16a0cb56` (MIT, notice included in the file), lower-cased, cut to 8 characters and over, deduplicated and sorted: 46,481 entries.
  The file's header says how to derive it again.
- Applied at every place a password is set: the Invitation Link and the Ministry Setup Link (through `supabaseAccounts.create`), a person's own change (the form's `passwordChangeRefusals` and `supabaseAccounts.changePassword`), and an Admin's reset (the `done` route sends an edited candidate back, and `setPassword` throws on a password the rule refuses rather than set it).
- The three surfaces word the codes from one `PASSWORD_REFUSALS` record in `app/invitation/copy.ts`, with the numbers read from the constants.
- `minimum_password_length` in `supabase/config.toml` is 8, and `tests/app/a-password-policy-copy.test.ts` fails if it and `SHORTEST_PASSWORD` disagree.

### Decisions made

- **The ceiling is 72 bytes, not "64 and more" without limit.**
  Reproduced on the local stack (GoTrue v2.193.0): an admin `createUser` with a 100-character password answers `500 unexpected_failure`, and 72 characters is accepted.
  GoTrue hashes with bcrypt, which takes 72 bytes at most.
  So the ticket's acceptance line "a 100-character password is accepted" cannot hold on Supabase Auth; the spec's "a maximum of at least 64 characters" does, and the spec wins.
  Before this, a 100-character password on the Invitation Link was a 500; it is now refused with `account.password_too_long` and a sentence.
  The alternative was to pre-hash long passwords (for example SHA-256 then base64) before handing them to Supabase, which would make 100 characters work through Discipler's own routes but break any sign-in that reaches Supabase Auth directly; not taken.
- **The ceiling is counted in UTF-8 bytes and worded in characters** ("no more than 72 characters"), because that is what bcrypt counts; the two agree for anything typed on an English keyboard.
- **No `maxLength` on the password inputs.** A browser silently truncates a pasted password to `maxLength`, which would set a password the person does not know; the server's refusal is the honest answer.
- **The list is the NCSC 100k list rather than a 10k list.** The 10k lists keep only about 2,000 entries once cut to 8 characters; the NCSC list keeps 46,481 and is the one built from Have I Been Pwned.
  It is a 455 KB module, built into a `Set` on first use, and imported only on the server.
- **A short common password is refused for its length**, so the person reads the rule they can act on first.
- **The Admin reset's generated four words are held to the rule too.**
  None of the list's entries has the four-words shape, so no generated password can be refused; the check is there for an edited form.

### Needs James

- Production Supabase Auth's own minimum password length is a dashboard setting (Authentication, then Providers or Policies, "Minimum password length"); set it to 8 so the public Auth API agrees with the app.
  `supabase/config.toml` changes only the local stack, and only after `supabase stop` and `supabase start` (a `db reset` does not restart Auth with the new setting).
- Optional and separate from this ticket: Supabase's leaked-password protection (Have I Been Pwned) on the production project, which finding F2 in `.scratch/security-hardening/spec.md` also lists. It is a Pro plan setting.

### Checked

- The ticket 12 tests at the Invitation Link, the Ministry Setup Link, the change form (route and port) and the reset passed in the locked run together with ticket 13's: 12 files, 124 passed and 1 skipped (an existing `it.skip`).
