# Security hardening, from the twenty-item audit

**Status:** needs-triage

On 2026-10-28 James asked for Discipler to be checked against a list of twenty common web-app vulnerabilities, and for a PRD covering the ones that hold.
This is that PRD.
It covers `main` at `0b0e1ed`, plus the production Supabase project's security advisors (`discipler-production`, read-only, same day).

Five of the twenty hold, in whole or in part, and two more are plausible but unconfirmed.
The rest are already handled, most of them on purpose and with tests.
The gaps are at the edges: the public intake form, the sign-in door, the HTTP response headers, and two database grants.

## The scorecard

| # | Item | Verdict | Where it's decided |
| --- | --- | --- | --- |
| 1 | Next.js middleware bypass (CVE-2025-29927) | **Not vulnerable** | `next` 15.5.24 in `package-lock.json`. `middleware.ts` only refreshes the session and is not a gate. Every route handler checks for itself (`currentAdmin`, `currentUser`, a token, `CRON_SECRET`, or the Twilio signature). |
| 2 | Exposed `.git` | **Not vulnerable** | Vercel serves the build output, not the checkout. A pattern scan of all 413 commits found no live keys, only the fixed local demo anon key and CI placeholders. See hardening H1. |
| 3 | Public storage buckets | **Not vulnerable** | `material` is created `public = false` and re-asserted (`20260908000100`). Storage RLS is per-Ministry, with a uuid-checked folder. Downloads use 5-minute signed URLs. |
| 4 | Price from the browser | **N/A** | No payments anywhere. |
| 5 | Credential stuffing | **Holds** | Finding F2 |
| 6 | Open database | **Mostly not vulnerable** | All 32 tables have RLS enabled *and forced*. `anon` holds no table grants, and `tests/integration/rls-coverage.test.ts` enforces both. The service-role key is server-only. **Gap:** two `SECURITY DEFINER` RPCs can be executed by `anon`. Finding F4 |
| 7 | Polyfill.io / supply chain | **Not vulnerable** | No third-party script tags or CDNs. Fonts come through `next/font`, which is self-hosted. The missing CSP is covered by F3. |
| 8 | SMS pumping | **Holds, highest severity** | Finding F1 |
| 9 | Prompt injection | **N/A** | No LLM in the product. |
| 10 | Weak JWT secret | **Not vulnerable** | Supabase signs and verifies tokens, and the middleware's `getClaims` verifies against the published signing key. See hardening H2. |
| 11 | Race conditions | **Mostly not vulnerable** | Commands run in one transaction with `for update` and advisory locks throughout `effect-store.ts`. **Plausible gap:** a double-submitted intake. Finding F5 |
| 12 | Account pre-hijacking | **Not vulnerable** | `enable_signup = false`. No OAuth providers, no email accounts. Accounts are created only through invitation or Admin flows. |
| 13 | Subdomain takeover | **Cannot be verified from the repo** | DNS lives outside the repo. The personal Vercel scope lists no domains, and the team scope needs authorization. See hardening H3. |
| 14 | SSRF | **Not vulnerable** | The server never fetches a user-supplied URL. Its only outbound `fetch` goes to Twilio. Material links are rendered only, and restricted to `http:`/`https:`. |
| 15 | Path traversal | **Not vulnerable** | No filesystem reads. Storage keys are minted server-side as `<ministry_id>/<uuid>.<ext>`, prefix-checked on read, and uuid-checked in policy. |
| 16 | Password-reset poisoning | **Not vulnerable** | No emailed reset. Every link Discipler sends is built from `NEXT_PUBLIC_APP_URL` (`appBaseUrl()`), never from `Host`. |
| 17 | Source maps in production | **Not vulnerable** | `next.config.ts` leaves `productionBrowserSourceMaps` at its default of `false`. |
| 18 | Clickjacking | **Holds** | Finding F3 |
| 19 | Open redirect | **Not vulnerable** | Every redirect goes to a fixed internal path. The one caller-supplied target (`back` in `app/follow-up/actions.ts`) must match a whole-string regex of card addresses. |
| 20 | User enumeration | **App: not vulnerable. Auth API: plausible.** | Sign-in answers *no-such-account* for every failure. Finding F6 covers the Supabase OTP endpoint. |

## Findings

### F1. The public intake form texts any number anybody types (SMS pumping), high

**What happens.**
`POST /intake/[ministry]/submit` and `/intake/[ministry]/discipleship/submit` take no session, no CAPTCHA and no rate limit.
On a first submission, `intake.submit` queues a Welcome Message to the phone on the form (`src/domain/boundary.ts`, the `isFirstSubmission` branch).
`asPhoneNumber` accepts any E.164 number with a leading `+`, so international premium-rate ranges get through.
The Ministry id is in the public link and the QR code, so it isn't a secret.

**Attack.**
A script posts the form in a loop, a new `+<premium range>` number each time.
Each post creates a Person on that Ministry's Roster and sends one paid SMS from the Ministry's sending number.
The group path can also text the group's leaders through `tellTheLeadersSomebodyJoined`.

**Cost of doing nothing.**
Twilio charges, a polluted Roster in a pastor's Ministry, and a sending number that carriers may flag as spam.
The spam flag breaks check-ins for every real relationship.

**Requirements.**
1. **Bot check on both public submit routes**, verified server-side before the command runs.
   Cloudflare Turnstile in managed/invisible mode is the lightest for a congregant on a phone (open question Q1).
   A failed or missing token returns the form with a refusal and does nothing.
2. **Rate limits outside the app** on `POST /intake/*/submit*` and `/intake/reopen/*/submit`, per IP, as a Vercel Firewall rate-limit rule.
   This needs no new table and no code.
3. **A per-Ministry ceiling on Welcome Messages** per rolling 24 hours, enforced where the message is queued, so it holds however the request arrived.
   A submission over the ceiling is still recorded, because the Person is real until proven otherwise.
   Its Welcome Message is held, and the Admin gets a Follow-Up item (open question Q3 covers the number and what the Admin sees).
4. **Twilio-side caps on the sending account:**
   - Messaging Geo Permissions limited to the countries Discipler serves (open question Q2).
   - SMS Pumping Protection turned on.
   - Usage triggers that alert on daily spend, plus a hard cap.
5. **The same Geo Permissions, pumping protection and spend alerts on the Twilio account behind Supabase Auth's SMS provider** (`SUPABASE_AUTH_SMS_TWILIO_*`), which is a separate account. See F6.

**Acceptance.**
- A submit with no valid bot token is refused, nothing is written, and nothing is queued.
  The test sits next to the existing intake over-HTTP tests.
- The (N+1)th first-submission inside 24 hours for one Ministry records the Person, queues no Welcome Message, and raises a Follow-Up item.
  This is a domain test against the injected clock.
- The firewall rule and the Twilio settings are recorded in `docs/` with where each is set.
  They live in dashboards, and a setting nobody wrote down is a setting nobody re-checks.

### F2. Sign-in has no limiter of its own, and the one it relies on sees Vercel's IP (credential stuffing), high

**What happens.**
`app/auth/sign-in/route.ts` calls `signInWithPassword` from the server.
`src/platform/supabase/accounts.ts` says the door *"sits behind the same per-IP rate limit -- which is why there is no limiter of Discipler's own"*.
That assumption doesn't hold.
The call comes from the Vercel function, so the IP Supabase rate-limits is Vercel's egress IP, not the attacker's.
That has two consequences:
- **It doesn't stop stuffing.** Attempts spread across Vercel's egress pool, and nothing ever ties them back to one attacker.
- **It can lock everyone out.** Real users who share an egress IP share one bucket (`sign_in_sign_ups = 30` per 5 minutes in `config.toml`), so an attacker can spend it for them.

On top of that:
- The production advisor reports **leaked-password protection (HaveIBeenPwned) disabled**.
- `config.toml` sets `minimum_password_length = 6` with no requirements. The app enforces 8 (`SHORTEST_PASSWORD`), but the public Auth API takes its own setting, not the app's.
- No MFA. One-time codes are post-launch, and TOTP is off.

Generated passwords are four words from 1024, which is 40 bits.
That's fine against an online attacker who is rate-limited, but not one who isn't.

**Requirements.**
1. **Supabase Auth CAPTCHA (Turnstile).**
   It protects the Auth API itself, including direct calls that skip the app.
   The sign-in form passes the token through.
   `accounts.changePassword`'s verify-by-sign-in also calls `signInWithPassword`, so that path needs a token or another way to verify (open question Q5).
2. **A Vercel Firewall rate-limit rule** on `POST /auth/sign-in` and `POST /account/change`, per real client IP.
3. **Turn on leaked-password protection** on the production Auth project.
   Set Auth's minimum length to 8 so the API agrees with the app, both in `config.toml` and in the hosted project.
4. **Make the comment in `accounts.ts` true.**
   Either the firewall rule above or the CAPTCHA is the limiter, and the comment names it.
5. **MFA for Admins** is a product decision, not a default (open question Q4).
   Admins hold every Person's contact details for their Ministry, which is the argument for it.

**Acceptance.**
- A sign-in POST with no CAPTCHA token is refused by Auth, and the page shows the generic *no-such-account* wording.
  It must not show a new message that reveals the cause.
- The production Auth settings are recorded in `docs/` next to F1's, including that leaked-password protection is on.
- A burst past the firewall threshold from one IP gets HTTP 429 and does not affect another IP.
  Verify this against a preview deployment.

### F3. No security headers: framable, no CSP (clickjacking), medium

**What happens.**
`next.config.ts` is empty and `vercel.json` sets no headers, so every page can be framed.
Admin actions are plain form POSTs: ending a relationship, removing a Person, resolving a Concern.
A hostile page can frame `/follow-up` or `/roster` and trick a signed-in Admin into a click.

**Requirements.**
1. `headers()` in `next.config.ts` for every route:
   - `Content-Security-Policy` with at least `frame-ancestors 'none'`
   - `X-Frame-Options: DENY`, for older browsers
   - `X-Content-Type-Options: nosniff`
   - `Referrer-Policy: strict-origin-when-cross-origin`, because invitation and material links carry tokens in the path
   - `Strict-Transport-Security`
2. A fuller CSP: `default-src 'self'`, with explicit allowances for the Supabase project origin (signed storage URLs and direct uploads) and Turnstile once F1/F2 land.
   Scripts are nonce-based, set in `middleware.ts`.
   Three inline scripts need it: `app/settings/page.tsx`, `form-editor.tsx` and `goals-card.tsx`.
   Ship it in `Content-Security-Policy-Report-Only` first, then enforce.

**Acceptance.**
- A `tests/app` or over-HTTP test asserts `frame-ancestors 'none'` and `X-Frame-Options: DENY` on `/login`, `/roster` and `/intake/<id>`.
- The enforced CSP produces no violations across `npm run smoke:pages`.

### F4. Two `SECURITY DEFINER` RPCs can be executed by `anon`, low to medium

**What happens.**
Supabase grants `EXECUTE` on new `public` functions straight to `anon`.
`revoke ... from public` doesn't remove that grant, and the production advisor confirms it for two functions:

- **`public.participation_status(public.person)`** (`20260827000100`, redefined in `20260828000100`).
  Its guard lets the caller through when `auth.uid() is null`, which is meant for the trusted command connection.
  A signed-out PostgREST caller also has a null `auth.uid()`.
  So `POST /rest/v1/rpc/participation_status` with the public anon key and any Person's uuid answers whether they are opted out, paired, or waiting.
  It needs a uuid, but uuids travel in URLs (`/roster/<personId>`, `?card=`).
- **`public.contact_to_share(uuid, uuid)`**.
  It returns nothing to `anon`, because both of its checks need a uid.
  It should still not be callable.

The same advisor also flags:
- `ministry_setup` has RLS enabled and no policy. That's deny-all, so it's safe. It needs a comment saying so, or the test's list grows to include it.
- Five `app.reject_*` trigger functions have a mutable `search_path`.

**Requirements.**
1. A migration that revokes `execute ... from anon` on both functions.
2. In `participation_status`, stop treating a null uid as trusted.
   Check the role instead (`current_user = 'discipler_command'` or equivalent), the same way it should hold everywhere the *null uid means the command connection* idiom appears.
   `relationship_pauses` uses it too, and is safe today only because `anon` was revoked there.
   Audit every function that uses the idiom.
3. `set search_path = ''` on the five trigger functions.
4. A new case in `rls-coverage.test.ts`: **no function in `public` is executable by `anon`**, derived from `information_schema.role_routine_grants` like the table checks, so the next RPC can't regress this silently.

**Acceptance.**
- That test passes, and the production security advisor shows no `anon_security_definer_function_executable` findings after the migration is applied.

### F5. A double-submitted intake can create two People and send two Welcome Messages (plausible), low

**What happens.**
`peopleOnRoster()` reads `person` with no lock, and nothing makes the same name and phone unique within a Ministry.
That is deliberate, because shared numbers are allowed.
Two concurrent first submissions of the same form, from a double tap or a retry on a slow connection, can therefore both see *not on the roster*.
Each then creates a Person and queues a Welcome Message.
Nobody has reproduced this yet.

**Requirements.**
1. Reproduce it in an integration test: two `intake.submit` commands for the same name and phone, run concurrently.
2. If it reproduces, take the Ministry advisory lock (`pg_advisory_xact_lock(hashtextextended(ministry_id, 0))`, the idiom already in `effect-store.ts`) before the roster read for `intake.submit`.
3. Add an idempotency key (a hidden per-render nonce) on the public submit forms, so a retried POST is recognised as the same submission.

**Acceptance.**
- The concurrent test produces one Person and one queued Welcome Message across `scripts/locked-tests.sh --times 3`.

### F6. Supabase Auth's OTP endpoint is live although nothing uses it (plausible), medium

**What happens.**
Phone login needs an SMS provider configured (ADR-0008), so `/auth/v1/otp` is reachable with the public anon key even though one-time codes are post-launch.
With signups off, it sends a code to a *registered* number and refuses an unregistered one.
That reveals which numbers have accounts (enumeration), and lets anyone spend SMS on Admins' and Leaders' phones.
The limit is Auth's `sms_sent`, which is 30/hour project-wide in `config.toml`.
Nobody has checked this against production; it needs one controlled request against a preview or prototype project, not production.

**Requirements.**
1. Confirm the behaviour on `discipler-prototype`.
2. If it holds:
   - Auth CAPTCHA (F2.1) covers the OTP endpoint as well.
   - Lower `sms_sent` to the minimum and put Geo Permissions and spend caps on the Auth Twilio account (F1.5).
   - If the provider allows it, block OTP sends until one-time codes ship.

## Hardening that isn't a finding

- **H1, a secret scanner in CI.**
  Add `gitleaks` to `.github/workflows/ci.yml`, over the full history once and then over each push.
  The manual scan was clean, and this keeps it that way.
- **H2, asymmetric JWT keys on production.**
  Confirm the production project uses asymmetric signing keys (ES256/RS256) rather than the legacy shared secret.
  `middleware.ts`'s comment assumes a published signing key, and with the legacy secret `getClaims` quietly becomes a network call.
- **H3, a DNS audit.**
  List every record on Discipler's domains, and remove any that point at a Vercel project, a Supabase project or a Twilio endpoint that no longer exists.
  Four Vercel projects exist (`discipler`, `discipler-web`, `discipler-ops`, `discipler-grill-baseline-v2`), so check each one's domains before it's retired.
- **H4, hosted Auth settings drift.**
  `config.toml` sets `enable_signup = false`, but that only governs local.
  Record the production values for signup, password minimum, CAPTCHA, leaked-password protection and rate limits, and check them in one place.

## Open questions (product decisions, not engineering defaults)

- **Q1. Bot check on the intake form.**
  Which vendor, and may it ever show a visible challenge to a congregant?
  Turnstile's managed mode usually doesn't, but it can.
- **Q2. Which countries may Discipler text?**
  `docs/open-questions.md` says *international leaders have to work*.
  A Geo Permissions allowlist has to name the countries, so that decision now has a security cost attached.
  The options:
  - a short global list
  - a per-Ministry list
  - allow everywhere and rely on the F1.3 ceiling and Twilio's pumping protection
- **Q3. The Welcome Message ceiling.**
  How many first submissions per Ministry per day is normal on a launch Sunday?
  When the ceiling is hit, what does the Admin see and do: release the held texts, or remove the people?
- **Q4. MFA for Admins.**
  Is it required, optional, or deferred with one-time codes?
- **Q5. Verifying the current password under Auth CAPTCHA.**
  The change-password check is a sign-in, so it would need its own token.
  The options are a token on `/account` or a different way to verify.
  This is an ADR-0016 question.

## Proposed tickets

| Ticket | What | Blocked by |
| --- | --- | --- |
| 01 | Security headers and a frame-ancestors test (F3.1) | Nothing |
| 02 | Revoke `anon` on public RPCs, fix the null-uid idiom, add the function-grant test (F4) | Nothing |
| 03 | Production Auth settings: leaked-password protection, minimum 8, documented (F2.3, H4) | Nothing (ready-for-human, dashboard) |
| 04 | Vercel Firewall rate limits on intake submit and sign-in (F1.2, F2.2) | Nothing (ready-for-human, dashboard) |
| 05 | Twilio Geo Permissions, pumping protection, spend caps on both accounts (F1.4, F1.5) | Q2 |
| 06 | Turnstile on the intake forms (F1.1) | Q1 |
| 07 | Supabase Auth CAPTCHA on sign-in and the password-change check (F2.1) | Q5 |
| 08 | Welcome Message ceiling per Ministry (F1.3) | Q3 |
| 09 | Reproduce and fix the concurrent intake race (F5) | Nothing |
| 10 | Confirm and close the OTP endpoint exposure (F6) | 07 |
| 11 | Enforced CSP with nonces (F3.2) | 01, 06, 07 |
| 12 | gitleaks in CI (H1) | Nothing |
