# 28 - The test check-in

> **Triaged 2026-10-31 against the spec's "The test check-in", its mock-up 3 decisions and its triage decisions.**
> The screens are `.lavish/onboarding/s1-modal.html`, `s1-modal-existing.html`, `s2-verify.html`, `s3-sent.html`, `s4-waiting.html` and `s4-limit.html`.

**What to build:** An Admin can send a real check-in to their own phone to see what participants get, which is never counted anywhere.

**Blocked by:** 05, 09, 27, 40

**Status:** ready-for-human

## The texts

- It walks the same check-in steps as a real check-in, composed by the same composer with the church's own words (ticket 40), Messages read as and nouns.
- The first text: "{Messages read as} via Discipler: This is your test check-in, the same one your {leader noun}s get. Did you meet with your {participant noun} this week? Reply 1 for yes, 2 for no."
  It ends with "Msg & data rates may apply. Reply STOP to opt out, HELP for help." when it is the first text that phone may carry the rates line on that month, as `docs/consent-language.md` says.
- The last text, whichever way the Admin answered, is James's, word for word: "{Messages read as} via Discipler: Thank you! Glad you are getting to experience what Discipler can do for your ministry!!"

## The card (in ticket 27's modal)

- "Send yourself a test check-in", "We'll text {phone} the questions your {leader noun}s get each week.", and Send test.
- An Admin from before sign-up sees, above the button: "By sending, you agree to receive texts from Discipler at this number, including sign-in codes and test check-ins. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help."
- The first time, the phone is checked with Verify (ticket 09): "First, a quick check that this phone is yours. We texted a 6-digit code to {phone}.", a Code box, "Text me a new code" and Confirm and send.
- After sending: "Sent.", "Answer it on your phone the way a mentor would. Nothing from a test is counted.", "You can send {n} more today." and Send another.
- The same button sits in the setup bar's step 3 and opens this card.

## The rule

- It texts only the signed-in Admin's own phone, verified with Verify the first time; after that, never asked again for that phone.
- At most 3 a day per Admin, in the church's timezone.
- It has its own table and state machine; the reply router checks for an open test before anything else, and a test reply never touches a real relationship.
- An unanswered test ends after 1 hour, and ends at once whenever a real check-in is about to be texted to that phone, so a real check-in's reply is never caught by a test (James, triage 2026-10-31).
  Nothing is texted when a test ends.
- Refused while a real question is open on that phone: "You have a check-in waiting on your phone. Please answer it first, then try the test again. Thank you!"
- Over the limit: "You've sent three test check-ins today. Please try again tomorrow. If something isn't working, please email support@trydiscipler.com and we'll help. Thank you!"
- Tests show in Check-Ins with a Test tag and are never counted in Overview, Follow-Up or any count.
- Sending one ticks setup step 3.
- It is texted under the Admin's `ministry_setup` consent, or the agreement above for an Admin from before sign-up.

## Acceptance

- A test reply of `1` advances only the test.
- The fourth test in a day is refused with the message above.
- Overview's numbers are the same before and after a test.
- A test left unanswered for an hour is closed, and a `1` sent after that is handled as it would be with no test.
- A real check-in queued for an Admin's phone closes their open test before it is sent, and the reply lands on the real check-in.

The setup meter's bar is off on production until this ticket and its partner ship.
Whichever of 27 and 28 ships second sets `SETUP_METER_ON=true` on production, or removes the switch, and fixes the two bar faults listed at the end of ticket 26.

## Comments

- From building tickets 02 and 09 (2026-10-31): Verify sends from Twilio's own senders, outside the message transport, so ticket 02 also gives it a recording stand-in (`src/platform/recording-verifier.ts`), picked by the same `messageTransportKind`.
  On staging the code is written to the log and is always `000000`, so a test check-in can be walked through there with no real code reaching a real phone.
- From building ticket 26 (2026-11-03): the setup meter already reads step 3, so this ticket has only to record it and give the bar its button.
  When a test check-in is sent, append `testCheckInSent({ ministryId, sentBy, at })` from `src/domain/setup-meter.ts` as history, alongside this ticket's own table: the meter reads the event, so it names nothing that did not exist yet.
  Then set `test_check_in`'s `href` in `STEP_COPY` in `app/setup-meter-copy.ts`; the button and its place in "Next:" appear from that one line.

### From building ticket 28 (2026-11-04)

**What was built.**

- `src/domain/test-check-in.ts` holds every rule against an injected clock: who may send one, the day in the church's timezone, the hour, and what a reply does, through the one reader real replies use.
- `supabase/migrations/20261104110028_the_test_check_in.sql` adds the table `test_check_in`, one open per phone per church, a nullable `outbound_message.test_check_in_id`, the function `app.sender_of_open_test`, and a `test_check_ins` key on `public.check_ins_page()`.
- The commands `test_check_in.agree` and `test_check_in.send`, and `src/service/test-check-in.ts`, which is the order of a press: anything that would refuse first, then the agreement, then the code, then the send.
- Two JSON routes, `/overview/test-check-in/send` and `/overview/test-check-in/confirm`, and the card, `app/overview/onboarding/test-check-in-card.tsx`, in ticket 27's slot.
- The bar's Send test goes to `/overview?onboarding=cards#test-check-in`.
- The list on Check-Ins, in a card of its own under the columns.
- `SETUP_METER_ON` is gone, with `src/platform/setup-meter-switch.ts` and its test, so production needs no setting.
  Both bar faults are fixed: on a phone the folded bar's Next wraps, and in a narrow column the grown bar's seven steps wrap with none cut off.
- `scripts/locked-tests.sh` and CI now serve with `MESSAGE_TRANSPORT=record`, so a suite pressing the real button reaches no phone.

**What removing the switch shows the churches on production.**

From the deploy, every Admin of every church, SAU BCM, Anthem, Example Ministry and any test church, has the bar under the tabs on every Admin page until 100%, and the modal on their next Overview.
Each step their church has already done pops once with confetti as the modal closes, and a church with only the tour and the test left is offered the tour next.
Against a fixture of SAU BCM's shape, in a browser at 1440 and 390, it reads "71% complete · 5 of 7" and "Next: Take the 2-minute tour".
Production itself was not read, because the brief forbids it, so those are not the real churches' numbers.
The real numbers are what each church's Admin sees on their first sign-in after the deploy, and `app.setup_meter_of` answers only for a signed-in Admin, so a look at one of them is the check.

**Decisions on gaps, each with its alternative.**

1. A test's own table, and its texts are `no_reply` messages, so they never hold the number or queue behind it.
   The alternative was reusing `checkin_sequence`, which every count reads.
2. `outbound_message.test_check_in_id` exists so that a test that ends closes its unsent texts, withheld as `test_check_in_ended`, because "nothing is texted when a test ends" has to hold for a text waiting on a daily cap or a new church's limit.
   The alternative was leaving them to go out, answering nothing.
3. The hour runs from the question last asked, so answering slowly does not end it.
   It is exact: a reply past the hour closes the test in the same command and is handled as if there were none, and the tick's sweep closes the rest.
   The alternative was the hour from the first text, which would cut off an Admin mid-way.
4. A real check-in ends the test in the same transaction that opens the conversation, by phone, so somebody else on a shared phone counts too.
   A send takes the Person's lock and then the ministry's, as a tick does, so the two cannot miss each other.
5. A real text that is not a check-in, an acceptance question for example, does not end a test, as the ticket names only a check-in.
   For the rest of that hour a reply goes to the test.
   The alternative was ending the test on every question; say if you want that.
6. While a test is open STOP and START do what they always do, STOP also ending it.
   HELP is answered and raises no Follow-Up item.
   PAUSE and SWAP are read as replies to the test and asked again, since the router "checks for an open test before anything else".
   The alternative was keeping every keyword working, which could pause a real relationship from inside a test.
7. A phone two people on one Roster share resolves to nobody, so its replies are dropped today.
   `app.sender_of_open_test` is asked first, so a test works on one.
   The alternative was refusing a test on a shared phone.
8. The first text is James's frame with the church's own question sentence, `[name]` being "your {participant noun}", so it is exactly his words where no sentence is saved.
   The alternative was ignoring the church's sentence on the first text, which ticket 40 says it should use.
   A later Save does not change a test already open, as a real conversation keeps its words.
9. A concern's detail is not stored at all.
   There is nobody to tell, and it should not sit in a table nobody reads.
10. The agreement is recorded as `consent_record` `sms`, granted, `source = 'ministry_setup'`, with the version `TEST_CARD_CONSENT_VERSION`, on press and before the code, because its sentence names sign-in codes.
    An Admin from before launch who gave consent through Intake still sees it, because that consent did not name the test.
    An open opt-out or a latest "no" refuses, and pressing overturns neither.
11. A press decides everything it can before spending a code, including a non-US number.
    The alternative, checking only at the send, has an Admin type a code for a test that was never going to go.
12. The card reads this Admin's standing only when the modal is opening, on the trusted connection and without a lock, so no page waits on a tick and every other page's one read is untouched.
13. The card needs script, as ticket 09's routes are JSON.
    The alternative, a no-script form, would have needed the modal to carry its state through the address.
14. The modal's own progress line does not move when a test is sent, as `s3-sent.html` draws it.
    The bar is refreshed once the modal closes, and plays the tick then.
15. The tick and the Send another button: a card that is done reads Send another, and one showing a refusal reads Send test with no tick, as `s4-waiting.html` and `s4-limit.html` draw them even for a church that has sent one.
16. After the third send "You can send 0 more today" is left out and Send another stays pressable, so the Admin meets your sentence.
    On the next opening that day the card opens with that sentence and the button shut, as drawn.
17. On Check-Ins the list is its own card under the columns, this week's only, the church's latest 60, with the Admin's name, the Test tag, the outcome and the date.
    The alternative was rows in the columns, where a count could reach them.
18. A test's texts count toward a new church's weekly limit and the daily cap, since they are real texts on shared numbers.
    The alternative was exempting them, which needs a second path through the queue.
19. The bar's narrow layout wraps instead of sliding, on a phone as well.
    The alternative kept a sliding row on phones only; the mock-ups draw no phone row, and nothing was out of sight this way.

**For James.**

- SAU BCM's Admin has a Canadian phone, so pressing Send test reads "We can only text codes to US mobile numbers..." and their church cannot reach 100% or the badge unless an Admin with a US phone sends one.
  It is in `docs/open-questions.md` under *how an Admin with a non-US phone gets a test check-in*.
- The draft words are in `docs/open-questions.md` under *sign-up's numbers and wording*.
- The first press on production is the first code through the real Verify service, as ticket 09 says, and no real code or text has been sent in this build.

**What later tickets must build on.**

- Anything new that a reply router branch reads must come after the open-test check in `sms.inbound`.
- Anything that opens a real conversation goes through `openConversationWith`, which is what ends a test.
- `withoutTheSweep` in `tests/support/effects.ts` now expects both sweeps on a tick.
- `check_ins_page` is plpgsql now: a later replacement must keep `test_check_ins`.
- `history.replaceState` with an address is a router action in Next, and a `router.refresh()` asked for in the same tick is lost without an error: before it the refresh is discarded, and just after it the action settles a microtask later and overwrites the refresh's pending state.
  The modal says it has closed a task after changing the address for this reason, so listeners on `afterOnboardingCloses` can refresh.
  No suite drives a browser, so only a look in one shows this, as "14% complete · 1 of 7" under the closed modal.
