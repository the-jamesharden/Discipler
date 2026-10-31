# 13 - The sign-in guessing limit

**What to build:** Confirm whether Supabase's per-network limit sees Vercel's address rather than the person's, and if it does, add Discipler's own limit (Q34).

**Blocked by:** nothing

**Status:** ready-for-agent

## Why

`app/auth/sign-in/route.ts` signs in from the server, so Supabase's per-IP limit probably counts every user as one.
This is the same door as finding F2 in `.scratch/security-hardening/spec.md`; whichever ticket ships first, the other builds on it.

## The rule

- 10 failed sign-ins per account and per network in 15 minutes, then a short lockout with a friendly message.
- Counted in Postgres, never in memory.
- The message does not say whether the account exists.

## Acceptance

- The finding is reproduced or ruled out, end to end, and the result is written in this ticket.
- If real, the eleventh wrong password in 15 minutes is refused before Supabase is called.
