# 06 - The shared numbers

> **Changed by the mock-up 3 review (2026-10-30), read the spec's "Decided in the mock-up 3 review" before building.**

**What to build:** Discipler sends for every church from one shared set of Discipler-owned numbers, each person always hearing from the same number, instead of one number per church (Q66).

**Blocked by:** nothing

**Status:** ready-for-agent

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
