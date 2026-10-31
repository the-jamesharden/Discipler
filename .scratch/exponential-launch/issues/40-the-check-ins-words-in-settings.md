# 40 - The check-in's words in Settings

> **From the mock-up 3 review (2026-10-30 and 2026-10-31), triaged 2026-10-31; read the spec's "Decided in the mock-up 3 review" and its triage decisions before building.**

**What to build:** "What the check-in says" in Settings, where an Admin rewrites the check-in's sentences inside the frame Discipler always writes, with a live phone showing the result.

**Blocked by:** 06

**Status:** ready-for-agent

## The rule

- The block sits in Settings under the check-in day and hour, as drawn in `.lavish/onboarding/settings-wording.html`.
- It has four lines, each one sentence an Admin may rewrite:
  - The question, Discipler's words "Did you meet with [name] this week?"
  - How it went, Discipler's words "How did the meeting go?"
  - After a concern, Discipler's words "Please tell us more about the concern."
  - The thank-you, Discipler's words "Thank you. We'll check in with you next week."
- "[name]" stands for whoever the check-in is about, composed as `checkInSubject` composes it today, so a group's check-in names the group the same way it does now.
- A blank line falls back to Discipler's words, and "Use Discipler's wording" clears all four.
- Each sentence is at most 160 characters, with a counter under the line once it passes 120 (James, triage 2026-10-31); a longer one is refused with its own refusal code.
- Discipler writes the frame of every text, as a permanent rule (spec, The texting numbers): the "{Messages read as} via Discipler:" start, the reply choices ("Reply 1 for yes, 2 for no." and "Reply A for outstanding, B for good, C for concern.") and the rates and opt-out lines.
  None of the frame can be edited, and each line's help says which ending is always added, so the answer can be counted.
- A live phone beside the block shows what a mentor receives, frame included, as the Admin types.
- The test check-in (ticket 28) uses the church's words, through the same composer.
- A change applies from the next check-in sent; a check-in already sent keeps the words it went out with, since sent texts are history.
- Messages read as gains the help line from the spec: it is followed by "via Discipler", and a church run by one person can use that person's name.

## Acceptance

- A church with no words saved sends exactly today's check-in texts.
- A church that rewrites the question sends its sentence with "[name]" filled in, followed by "Reply 1 for yes, 2 for no.", after the "{Messages read as} via Discipler:" start.
- A saved line that is blank, or only spaces, sends Discipler's words.
- A 161-character sentence is refused and nothing is saved.
- No saved wording can remove or change the reply choices, the start or the rates and opt-out lines.
- A text already sent still shows its original words wherever sent texts are shown.

## For James

1. The Twilio question in ticket 06 (whether reworded sentences need the A2P campaign's sample messages widened) should be answered before this ships.
