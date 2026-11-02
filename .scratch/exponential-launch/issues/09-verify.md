# 09 - Verify

**What to build:** A Twilio Verify service named "Discipler", and the check of an Admin's own phone on their first test check-in (Q63).

**Blocked by:** nothing

**Status:** shipped

## The rule

- The service sends 6-digit codes by SMS, to US numbers only.
- An Admin's phone is verified the first time they ask for a test check-in; after that it is never asked again for that phone.
- Verify sends from Twilio's own senders, so it is not gated by ticket 05 and does not count against the campaign.
- A code request is rate-limited per Admin and per phone.

## Acceptance

- An Admin whose phone is unverified is sent a code, enters it, and the test check-in goes out.
- A wrong code five times ends that attempt.
- A non-US number is refused before Twilio is called.

## Comments

### Built (2026-10-31)

The server side of checking an Admin's own phone, for ticket 28's card to call.
The card itself, and sending the test check-in after a code is confirmed, are ticket 28's.

- `src/domain/phone-check.ts` holds the rules: `isUsPhone`, `readPhoneCode`, `codeRequestAllowed` and `attemptStanding`, with the limits as constants.
- `src/service/phone-check.ts` is the service, `getPhoneCheck()` in the container, with three calls: `status(admin)`, `sendCode(admin)` and `confirmCode(admin, typed)`.
  Each takes `{ userId, ministryId }` from the session, never a phone, and answers a value with a refusal code rather than throwing.
- `src/platform/twilio/phone-verifier.ts` talks to Verify's REST API with `fetch`: start a verification, check a code against its verification SID, and cancel one.
  It reads `TWILIO_VERIFY_SERVICE_SID` beside the account's existing SID and token.
- `src/platform/supabase/phone-checks.ts` keeps the records on the trusted connection, under an advisory lock per account and per phone.
- Migration `20261101090000_checking_an_admins_phone.sql` adds two operator-only tables, `phone_check` (one row per attempt, a verified phone being an attempt that ended `verified`) and `phone_check_code` (one row per code asked for).
- Two JSON routes for the card: `POST /account/phone/send-code` (no body) and `POST /account/phone/confirm-code` (form field `code`).
  Each answers `{ sent | verified: true, phone, phoneShown }` or `{ refusal, message, triesLeft? }` with a 4xx or 502 status, and 401 when signed out.
  The sentences are in `app/account/phone/copy.ts`.
- Verify sends from Twilio's own senders, so nothing here goes through the outbound queue, the texting gate (ticket 05) or the campaign.

### Decisions made on gaps

- **The phone checked is the one on the Admin's own Roster row** (`person.phone` where `person.user_id` is the session's account), the same row a test check-in texts.
  The alternative was the sign-in phone on the account, which ticket 21 makes optional for Admins who sign in with email.
- **"US only" means the 50 states and DC.**
  A +1 number in Canada, the Caribbean, or a US territory (Puerto Rico, Guam, the US Virgin Islands, the Northern Marianas, American Samoa) is refused before Twilio is called, because Twilio's geographic permissions list each as a country of its own.
  The alternative was to allow the territories and enable them on the service too.
  A refusal by the service's own geographic permissions (Twilio error 60605) is read as the same refusal, for an area code the list misses.
- **The code limits are 5 codes an hour and 10 a day, per Admin and per phone, each counted on its own.**
  Every request counts, one Twilio failed to send included, because each is a request Twilio may charge for.
- **An attempt** is the run of codes sent to one phone for one Admin until it is verified, five codes are tried, or its code expires 10 minutes after the latest was sent (Twilio's default lifetime).
  "Text me a new code" while an attempt is open resends within it, so the tries already spent stay spent; after an attempt ends, a new code starts a new attempt with five tries.
- **A try is counted before Twilio is asked**, so two codes typed at once cannot both be the fifth; a try Twilio never judged (a 5xx or a dead socket) is given back.
- **Something that is not six digits is refused without spending a try.**
- **At the fifth wrong code the verification is also canceled at Twilio**, best effort, though Twilio stops it on its own at its fifth check.
- **The refusal sentences are drafts** for James, since the mock-up showed only the card asking for the code.

### For James

- Create the Verify service "Discipler" in Twilio: code length 6, the default 10-minute code lifetime, SMS only, and United States only under its geographic permissions.
- Set `TWILIO_VERIFY_SERVICE_SID` on Production (and Preview) to the service's `VA...` SID.
- Approve or reword the refusal sentences in `app/account/phone/copy.ts`.
- The SAU BCM Admin's phone is Canadian, so it cannot be checked, and so cannot be sent a test check-in, under the US-only rule.

### Closed out (2026-11-02)

Merged in PR #35 (49d4bb2) and its migrations are on production.
The Verify service and `TWILIO_VERIFY_SERVICE_SID` are done (James, 2026-11-02).
No code has gone through the real service yet: the Acceptance line's "the test check-in goes out" is ticket 28's, as this ticket says, and that is where the real service is first exercised.
What is left for James moved to `docs/open-questions.md`: *the sentences an Admin's phone check refuses with* and *how an Admin with a non-US phone gets a test check-in*.
