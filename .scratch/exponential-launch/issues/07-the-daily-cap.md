# 07 - The daily cap

**What to build:** Discipler keeps working under Twilio's daily limit for a Low Volume Standard brand instead of losing texts (Q67).

**Blocked by:** 06

**Status:** ready-for-human

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

## For James

1. Decide whether the send pass runs more often than hourly.
   Until it does, "Check-ins for one hour leave spread across that hour" is **not met**: check-ins leave all at once on the hourly tick, as they do today.
   To switch it on, change `/cron/tick` in `vercel.json` to `*/5 * * * *` and `SEND_PASS_EVERY_MINUTES` in `src/domain/daily-cap.ts` to `5`, in one commit.
   A test fails if only one of the two changes.
2. Find out how Twilio reports 30023, by asking in the open support ticket or by reading one in the message log.
   See "Not known: when Twilio says 30023" below, because it decides whether the hold ever fires on production.

## Comments

### Built (2026-11-03)

- `src/domain/daily-cap.ts` says what a hold is, when a text may go again, and when a check-in may leave.
- `src/platform/twilio/message-transport.ts` throws `DailyCapReached` on 30023, whether it comes back as a refusal or on a message Twilio made and marked with it.
- `dispatchQueue` takes a `dailyCap`, so no drain can be assembled without one.
  A reply's drain and the tick's drain both pass through it.
- On 30023 the drain gives that text's number back, records the hold and stops.
  Until the hold ends every drain of every church sends nothing and does not ask Twilio.
  Its count is `waitingOnTheCap`, on the drain's outcome and in the tick's response, apart from `failed`.
- `daily_cap_hold` (migration `20261103100700_the_daily_cap.sql`) is one operator-only row a Pacific day, the first reach kept.
  It is a row and not a flag, so support@ is told once a day, and `alerted_at` stays null until the email has gone.
- A held text is never sent twice because nothing about it changes: it stays neither sent nor withheld, and is marked sent only when it is sent, under the drain lock of ADR-0020.
  Each text goes from the shared number its pair was given, as Twilio's `From` (ADR-0033).
- `outbound_message.not_before` gates a text, and `due` leaves a row out until then.
  Spreading gives each check-in in a pass its own moment, evenly across the hour from the pass that made it.

### Decisions made

- **A held text waits for its church's morning, not only for midnight Pacific.**
  Midnight Pacific is 3am in New York, and the hold can be thousands of texts.
  So a text queued before the hold lifted goes once it is inside the church's quiet hours (`withinQuietHours`), 8am on its clock.
  The alternative was to send at midnight Pacific as the ticket's words could be read, which would text a congregation at 3am.
  A text queued after the hold lifted, such as the answer to a reply at 12:05am Pacific, goes at once, as a reply always has.
- **Spreading is off while `SEND_PASS_EVERY_MINUTES` is 60, and it is 60 today.**
  `checkInNotBefore` returns null then, so every row's `not_before` is null and today's sends are unchanged.
  It is a constant and not an environment variable, because the cron it describes is a file in the same repository and can then only change with it.
  `tests/domain/the-daily-cap.test.ts` holds the constant to `vercel.json`, so a not-before can never be stamped on a pass that cannot honour it.
  `tests/integration/spreading-check-ins.test.ts` runs the real tick and queue as if the constant were 5, and is what says nothing else is needed.
- A spread check-in is spaced from the pass that made it, not from the top of the church's hour, so a late pass stays evenly spread and may run past the hour.
- A hold stops every text to every carrier, as the spec says, though Twilio's page says this limit is about T-Mobile.
  Texts to other carriers wait for a limit they had not reached, which costs a few hours and loses nothing.
  The alternative needs each recipient's carrier, which Discipler does not have.
- Twilio Verify codes are not held: they do not pass through the outbound queue or count against the campaign (ticket 09).
- The alert retries on each drain until it goes, and its `once` is the Pacific day, so two drains that both find it owed send one email (Resend drops the second by its key).
  A hold is still in force if the email cannot go, and if the hold cannot be recorded the next drain costs one more refused text.
- `DailyCap` is required on `dispatchQueue` rather than optional.
  The alternative would let a later caller send through a hold by leaving it out.

### Not known: when Twilio says 30023

The ticket says "when Twilio answers a send with 30023", and that is what is built and tested.
Twilio's error page does not say whether a `POST` to `Messages.json` ever answers it, and the support article on the daily limit refused the fetch (403).
From memory, and not confirmed by anything that could be read here, errors numbered 30xxx are reported after a `201`, on the message's status.
If 30023 is one of them:

- `deliver` returns normally and the row is marked sent, so the text is lost.
- No hold is recorded and no email goes.
- The tests pass all the same, because they answer 30023 at the `POST`.

Nothing in Discipler reads a message's later status today: `deliver` sends no `StatusCallback` and keeps no message SID.
Catching it needs one of these, and each is a decision for James:

- A signed status-callback route, which this job was told not to add.
- Keeping the SID and reading each message's status back on the tick, which is one more Twilio call per text.

Either one calls `dailyCap.reached(now)` for the hold and the email.
It also has to put the refused row back on the queue, which nothing does yet: clear `sent_at` and give back its number.

### Not run

Nothing here has met real Twilio or real Resend, as the wave's rules require.
