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

## Comments

### The finding (F2), tested 2026-10-31

The finding holds, and Discipler's own limit is built.

- **On this machine there is no per-address sign-in limit at all.**
  Forty wrong-password sign-ins in a row against the local Auth API (`POST /auth/v1/token?grant_type=password`), from one address, as the sign-in route makes them: all forty answered `400 invalid_credentials`, none `429`.
  The local Auth container is started with no `GOTRUE_RATE_LIMIT_HEADER`, and GoTrue only rate-limits `/token` by a header's value, so `sign_in_sign_ups = 30` in `supabase/config.toml` limits nothing here.
  So locally a guesser going through `/auth/sign-in` was never held back.
- **On Vercel, the address Supabase counts is the function's.**
  Supabase's rate-limit page (https://supabase.com/docs/guides/auth/rate-limits) says Auth "uses the IP address of the client for rate limiting", that server-side callers may need to forward the end-user address "to avoid being rate limited based on the address of the server-side client", and that forwarding is off by default and needs the `Sb-Forwarded-For` header sent with a secret API key.
  Discipler sends neither: `app/auth/sign-in/route.ts` calls `signInWithPassword` from the function with the publishable key.
  So every sign-in shares the function's bucket (150 requests per 5 minutes with bursts of 30 on `/token`, by Supabase's defaults), nothing ties a guesser's tries to them, and nothing counts per account.
  Vercel's egress addresses cannot be reproduced here, which is why this part rests on Supabase's own documentation rather than a run; the ticket says to build in that case.

### Built

- `src/domain/sign-in-limit.ts`: `FAILED_SIGN_INS_ALLOWED` (10), `SIGN_IN_WINDOW_MINUTES` (15) and `signInIsHeldBack`.
- `sign_in_attempt` (`supabase/migrations/20261101120000_the_sign_in_guessing_limit.sql`), operator-only in the `ministry_setup` shape: RLS enabled and forced, no policies, every grant revoked from `anon`, `authenticated`, `service_role` and `discipler_command`.
- The `SignInLimit` port and `createPostgresSignInLimit` (`src/platform/supabase/sign-in-limit.ts`) on the trusted connection, wired as `getSignInLimit()`.
  A try is counted and reserved in one transaction under advisory locks on its account and its network, before Supabase Auth is asked, so a burst of simultaneous guesses lets exactly ten through.
  A try that was not a wrong password (the right one, or Supabase not answering) is deleted again; anything else stays a failure.
- `/auth/sign-in` counts against the number as read (so `(555) 010-0000` and `+15550100000` are one account) and the network, and refuses the eleventh try with `too-many-attempts` without calling Supabase.
- The network is `networkOf` in `app/auth/network.ts`: the first address of `x-forwarded-for`, which Vercel overwrites with the client's address "to prevent IP spoofing" (https://vercel.com/docs/headers/request-headers); an IPv6 address counts as its /64, and an IPv4-mapped one as its IPv4 address.
- The message is "Too many tries. Wait 15 minutes, then try again.", the same whether or not anybody holds the number.

### Decisions made

- **The change-your-password form is held to the same limit**, because its current-password check is a password sign-in through the same Supabase door, and `src/platform/supabase/accounts.ts` said that door's limiter covered it, which F2 showed was not true.
  It counts against the session's account (`{ userId }`) rather than the phone, so the two doors are counted apart, each to ten; the alternative, sharing one count, needs the phone read from the account before the port is called.
  It answers `account.too_many_attempts` with the same sentence.
- **Only a wrong password counts.** Supabase answering anything but `invalid_credentials` (its own rate limit, an outage) tested no password, so it is not counted; a request that dies half-way stays counted.
- **A right password does not clear earlier failures.** The ticket counts failures in the window, and clearing them on success would hand a guesser ten more tries every time the real person signs in.
- **The window rolls**: a try opens up as soon as the oldest of the ten failures is 15 minutes old, so "wait 15 minutes" is the longest wait, never a shorter one.
- **The table holds SHA-256 digests**, never the number or the address; counting needs only sameness.
  The alternative, plain values, would let an operator read which addresses tried which numbers, which nothing in the product asks for.
- **Rows are swept by the tries themselves after a day**, not after 15 minutes, so a test clock running ahead cannot delete fresh rows a neighbouring test is counting.
- **A request with no readable address** (only possible off Vercel) counts against its account alone.
- **The account limit lets anybody hold a known number back for 15 minutes** by guessing at it ten times.
  That is the trade every per-account limit makes and the one Q34 chose; the person can still be helped by an Admin reset, which does not pass through the limit.
- **Tests name their network.** Every over-HTTP sign-in in the suite now sends a random `x-forwarded-for` in the IPv6 documentation range (`aNetwork()` in `tests/support/app.ts`), because otherwise every request comes from loopback and ten wrong passwords anywhere in a run would hold back every sign-in after them.

### Needs James

- Nothing to set up for the limit itself: it needs the migration pushed and nothing else.
- Optional, from F2 and not built here: turn on Supabase's IP address forwarding and send `Sb-Forwarded-For` with a secret key, or a Vercel Firewall rate-limit rule on `POST /auth/sign-in`, as a second layer.
- `.scratch/security-hardening/spec.md`'s F2 covers the same door; this ticket is the limiter its requirement 4 asks the comment in `accounts.ts` to name, and its CAPTCHA and firewall items remain open there.

### Checked

- `tests/integration/the-sign-in-guessing-limit.test.ts` (the port, against the table, with a test clock) and `tests/integration/the-sign-in-guessing-limit-over-http.test.ts` (the front door and the change form) pass, with the suites around sign-in, invitation, setup, change and reset and `rls-coverage`: 12 files, 124 passed and 1 skipped (the existing `it.skip` in `invitation-over-http`).
- The first locked run, at a load average near 70 on 14 cores, timed out 15 tests at the 5-second default across the password suites; none failed on an assertion.
  The over-HTTP limit tests sign in a dozen times or more each, so they now take a 30-second timeout of their own.
