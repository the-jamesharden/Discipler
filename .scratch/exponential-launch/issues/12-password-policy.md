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
