# 06 - The shared numbers

> **Changed by the mock-up 3 review (2026-10-30), read the spec's "Decided in the mock-up 3 review" before building.**

**What to build:** Discipler sends for every church from one shared set of Discipler-owned numbers, each person always hearing from the same number, instead of one number per church (Q66).

**Blocked by:** nothing

**Status:** shipped

## What is true today

- `ministry.sending_number` (from `20260909000100_the_number_a_ministry_sends_from.sql`) holds one number per church, read by `src/platform/supabase/outbound-queue.ts`.
- `src/platform/twilio/message-transport.ts` sends `From`, `To` and `Body`, with no Messaging Service SID.
- `app/sms/inbound/route.ts` ignores `To`, and `app.sender_of_inbound` matches the sender's phone across all churches.
- `discipler-sms` (`MGa42ffb2e85f4dcf704083fad06f171ef`) holds +13185316138, +15674303906, +14129606955 and the rejected toll-free +18335050572.

## The rule

- A shared number belongs to Discipler, not to a church.
- Each (phone, church) pair is assigned one Discipler number the first time that church texts that phone, and keeps it.
- A phone held by people in two churches gets a different Discipler number for each church.
- For a reply, the sender's phone finds the Person as today; when that phone is in more than one church, `To` decides which church.
- Every text starts "{Messages read as} via Discipler:", Messages read as being the existing `from_name` setting (James, mock-up 3).
- Discipler writes the frame of every text: that start, the reply choices and the rates and opt-out lines.
  A church may reword only the check-in's sentences inside it, through Settings' "What the check-in says" (James, mock-up 3); the composer keeps the frame whatever the church writes.
- The three numbers in use join the shared set, keeping each existing (phone, church) on the number it hears from today.
- Five more numbers are bought and added to `discipler-sms`.
- The toll-free number is taken out of `discipler-sms` and kept.
- support@ is emailed when the shared numbers run near capacity, which replaces the planned alert at 40 numbers.
- There is no waiting list: a church can text as soon as it signs up.

## Acceptance

- A new church texts its first participant from a shared number with no operator step.
- A person in two churches receives each church's texts from a different number, and a reply to each lands with the right church.
- A STOP to one church's number leaves the other church's texts to that person running.
- A church's own check-in sentence still goes out with Discipler's start and reply choices, and a reply of `1` or `A` to it is counted.
- An existing participant of Example Ministry, SAU BCM or Anthem keeps hearing from the number they hear from today.
- `.scratch/shared-numbers` tickets 01 to 03 still hold: a phone held by two Persons in one church follows "whoever was asked".

## For James

1. Buying five numbers adds about $6 a month.
2. Decided in mock-up 3: "{Messages read as} via Discipler:" on every text, and a church may reword only the check-in's sentences inside Discipler's frame.
3. The A2P campaign's sample messages show Discipler's words; whether a church's reworded sentences need the samples widened is yours to check with Twilio.

## Comments

### Built (2026-10-31)

- Every text starts "{Messages read as} via Discipler:", the first text ever sent included; `composeMessage` in `src/domain/outbound-copy.ts` writes the start and the rates line, and the reply choices stay constants in the same module, so the frame lives in one place for ticket 40 to build inside.
  The `identifyDelivery` flag and the stacked `Discipler:` prefix are gone.
- Migration `20261101060000_the_shared_numbers.sql` adds `shared_number` (operator-only), `sending_number_assignment` (church-scoped, one row per (church, phone), unique per (phone, number)) and `shared_number_capacity_alert` (operator-only).
  Its data step puts each church's own number into the shared set and gives every phone the church knows (each Person's, and every `to_phone` it ever queued) that church's number and checks that nothing moved.
  `ministry.sending_number` stays for now (see "A two-step migration" below).
  `ministry_setup.sending_number` becomes nullable and keeps the numbers already issued links named, as history.
- `app.sending_number_for(phone, at)` gives a pair the least-loaded shared number this phone does not already hear from for another church, under a per-phone advisory lock, and keeps it.
  The sending layer asks for it per message after the recipient checks and before the claim; a phone with no number free waits on the queue (`awaitingANumber`) unclaimed.
- `app.sender_of_inbound(phone, to)`: a phone in one church resolves as before whatever it texted; a phone in two is placed by the church whose number it texted, and the old within-church rule then applies.
  `/sms/inbound` reads Twilio's `To`.
- Provisioning and the Setup Link no longer take a sending number, so a church texts as soon as it exists; `scripts/setup-link.ts` takes the name and the Admin phone only.
- `scripts/shared-number.ts` (`npm run shared-number -- "+1..."`) adds a bought number to the set.
- The near-capacity alert: `capacityConcerns` in `src/domain/shared-numbers.ts` decides, `watchSharedNumberCapacity` in `src/service/shared-number-capacity.ts` runs it once per hourly tick and tells `SupportAlerts` once per concern per size of the set.
  `SupportAlerts` is a port in `src/service/ports.ts`; the composition root logs the alert until ticket 10's email sender is merged, when its implementation replaces `loggedSupportAlerts` in `src/service/container.ts`.
  The port's input is counts and a day only (`SharedNumbersNearCapacity`: concern, numbers in the set, (phone, church) pairs carried, most churches on one phone, and the UTC day as YYYY-MM-DD), never a phone number.
  The wiring at merge is one adapter in `container.ts`: `getEmailSender().send({ kind: 'numbersNearCapacity', subject, body, once })`, with the subject and body built from those counts as `EmailField` values, and `once` as `numbers-near-capacity:${concern}:${numbers}:${day}`.
  The once-per-concern-per-set-size rule is stored on our side in `shared_number_capacity_alert`; the day in `once` only lets Resend drop a same-day retry when the email went but recording it failed.
- Docs: `docs/product-rules.md`, `docs/check-in-rhythm.md`, `docs/open-questions.md` (the Silence Gap prefix question is resolved) and a Shared Number entry in `CONTEXT.md`. The ADR is ticket 35's.

### Decisions made on gaps

- **Near capacity means either of two things.** `recipients`: the pairs reach four in five of 200 per number (1,280 on eight numbers). `one_phone`: the person in the most churches has at most one number left. Alternative: a single per-number load figure only. 200 per number is the old per-long-code guidance taken as a conservative stand-in; it is a constant James can change.
- **Told once per concern per size of the set**, recorded in `shared_number_capacity_alert`, so adding a number re-arms it. Alternative: once a day while near capacity.
- **A missing `To` is not refused.** A phone in one church is placed without it, as before; a phone in two is placed with nobody. Twilio always sends it.
- **Pairs are per phone, not per Person**, because a number is one conversation (ADR-0005); an Admin texted from no Person row gets one too.
- **The data step includes removed people and every phone ever queued**, so anyone restored or re-texted hears from the number they always did.
- **A pair is given its number when its first text is about to be sent**, after the consent checks, and keeps it even if the vendor then refuses that text.
- **No number is ever taken out of the set by code.** A person keeps their number, so removing one would strand its people; that is an operator decision for later.
- **Acceptance "a church's own check-in sentence still goes out with Discipler's start and reply choices"**: no church can reword yet (ticket 40), so it is held by the frame being composed in one place and tested on today's words; ticket 40 adds the church sentence inside it.
- **Acceptance "tickets 01 to 03 still hold"**: they are needs-triage and unbuilt, so a phone held by two Persons in one church still resolves to nobody, now judged within the church the reply texted; nothing here builds or blocks them.

- **A two-step migration (James, 2026-11-01).** The migration is pushed before the merged build is live, so the build still serving must keep working against it.
  `app.sender_of_inbound` declares `texted_number text default null`, so its one-argument call still resolves as one function with the same grants.
  `ministry.sending_number` is kept rather than dropped; it has been nullable since `20260909000100`, so it needed no `drop not null`.
  The new build neither reads nor writes it.
  **Follow-up, done 2026-11-02:** `20261102120000_drop_ministry_sending_number.sql` drops `ministry.sending_number`.
  Before it was written, production showed all three churches' numbers in the shared set, 61 pairs, none on another number and no texted phone without a pair, so the push-to-deploy window left nothing to carry.
  The one-argument form needs no drop of its own, because it is the same function as the two-argument one; removing the default is optional, and it stays, since `create or replace` cannot remove one and the default costs nothing.
  Alternative: one step and an accepted window at a quiet hour, in which a `STOP` or an answer could be lost.
  In the window the old build sends without writing a pair, so a phone a church first texts then is given its shared number on the next text after the deploy, which may not be the number it heard from in the window.

### Tested (2026-10-31)

- `npx vitest run tests/domain tests/app`: 109 files, 2250 tests, all passed. `npx tsc --noEmit`: clean.
- Locked run 1 (23 files touching sending, inbound, provisioning and the changed copy): 20 passed, 3 failed.
  Two were real and are fixed in 17021a5: one test still called the one-argument `app.sender_of_inbound`, and one copy assertion still expected the old start.
  The third was three 5-second timeouts in `relationship-state-and-care` at a load average of 50 to 60.
- Locked run 2 (the 3 failed files plus the 29 other integration files that send, drain or receive): 31 of 32 files, 395 of 396 tests passed; the one failure was a 5-second timeout in `the-person-page-over-http`, which sends nothing.
- Locked run 3 (`the-person-page-over-http` and `relationship-state-and-care` alone): 2 files, 35 tests, all passed.
- The data step, checked in a rolled-back transaction on a production-shaped world (the three churches' numbers, their phones from Person rows and queued texts, a removed person, two churches once sharing a number): every (phone, church) kept the number it hears from today (70 of 70), no pair it was not given, a reply to SAU BCM's and to Anthem's number is placed with that church, and SAU BCM's next text goes from its own number.
- Settings at 1280 and 390 wide: the message preview reads "Riverside Chapel via Discipler: David, you've been paired ...", and nothing else on the page changed.

### Closed out (2026-11-02)

Merged in PR #35 (49d4bb2) and its migrations are on production.
What is left for James moved to `docs/open-questions.md`: *what is left in Twilio for the Shared Numbers* and *whether a church's reworded sentences need the A2P samples widened*.
