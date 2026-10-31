# 09 - Verify

**What to build:** A Twilio Verify service named "Discipler", and the check of an Admin's own phone on their first test check-in (Q63).

**Blocked by:** nothing

**Status:** ready-for-agent

## The rule

- The service sends 6-digit codes by SMS, to US numbers only.
- An Admin's phone is verified the first time they ask for a test check-in; after that it is never asked again for that phone.
- Verify sends from Twilio's own senders, so it is not gated by ticket 05 and does not count against the campaign.
- A code request is rate-limited per Admin and per phone.

## Acceptance

- An Admin whose phone is unverified is sent a code, enters it, and the test check-in goes out.
- A wrong code five times ends that attempt.
- A non-US number is refused before Twilio is called.
