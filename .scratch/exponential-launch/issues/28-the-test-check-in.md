# 28 - The test check-in

> **Triaged 2026-10-31 against the spec's "The test check-in", its mock-up 3 decisions and its triage decisions.**
> The screens are `.lavish/onboarding/s1-modal.html`, `s1-modal-existing.html`, `s2-verify.html`, `s3-sent.html`, `s4-waiting.html` and `s4-limit.html`.

**What to build:** An Admin can send a real check-in to their own phone to see what participants get, which is never counted anywhere.

**Blocked by:** 05, 09, 27, 40

**Status:** ready-for-agent

## The texts

- It walks the same check-in steps as a real check-in, composed by the same composer with the church's own words (ticket 40), Messages read as and nouns.
- The first text: "{Messages read as} via Discipler: This is your test check-in, the same one your {leader noun}s get. Did you meet with your {participant noun} this week? Reply 1 for yes, 2 for no."
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

## Comments

- From building tickets 02 and 09 (2026-10-31): staging records every text instead of sending it, but Verify sends from Twilio's own senders, so nothing stands in for it there yet.
  `src/platform/twilio/phone-verifier.ts` talks to Verify directly, and the container picks it with no regard for the deployment.
  This ticket gives the phone verifier a recording stand-in on staging, picked the way `MESSAGE_TRANSPORT` picks the message transport, so a test check-in can be walked through on staging without a real code reaching a real phone.
