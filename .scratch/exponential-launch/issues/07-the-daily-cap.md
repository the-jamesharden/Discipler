# 07 - The daily cap

**What to build:** Discipler keeps working under Twilio's daily limit for a Low Volume Standard brand instead of losing texts (Q67).

**Blocked by:** 06

**Status:** ready-for-agent

## Why

The brand allows about 2,000 texts a day to T-Mobile users and about 6,000 across all carriers, counted per EIN.
Over it, sends fail with Twilio error 30023 until midnight Pacific.

## The rule

- A church's check-ins are spread across its check-in hour instead of all going at once.
- When Twilio answers a send with 30023, that text and the rest of the day's queue are held, and sent after midnight Pacific.
- support@ is emailed the first time that happens each day, and not again that day.
- A held text is never sent twice.

## Acceptance

- A test that makes the transport answer 30023 holds the queue and resumes it after midnight Pacific on a test clock.
- One alert email per day, however many sends hit the cap.
- Check-ins for one hour leave spread across that hour.
