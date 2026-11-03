# 40 - The check-in's words in Settings

> **From the mock-up 3 review (2026-10-30 and 2026-10-31), triaged 2026-10-31; read the spec's "Decided in the mock-up 3 review" and its triage decisions before building.**

**What to build:** "What the check-in says" in Settings, where an Admin rewrites the check-in's sentences inside the frame Discipler always writes, with a live phone showing the result.

**Blocked by:** 06

**Status:** ready-for-human

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
- Discipler writes the frame of every text, as a permanent rule (spec, The texting numbers): the "{Messages read as} via Discipler:" start, the reply choices ("Reply 1 for yes, 2 for no." and "Reply A for outstanding, B for good, C for okay, D for concern.") and the rates and opt-out lines.
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

## Comments

### Built (2026-11-03)

- `src/domain/check-in-words.ts` holds the four sentences: Discipler's words, what may be typed, and `fillingInTheName`.
  It is pure, because the screen's phone runs it in the browser, so what an Admin sees as they type and what the save decides cannot differ.
- The four composers in `src/domain/outbound-copy.ts` (`meetingQuestion`, `satisfactionQuestion`, `concernDetailRequest`, `checkInThankYou`) now take `words` and `subject`, stated rather than defaulted, and put the frame around them.
  Ticket 28 calls these same four with `MinistryVoice.checkInWords` and its own `subject`.
- `ministry` has four nullable sentence columns, with checks for blank, 160 characters, control characters and a question without `[name]`.
  `MinistryVoice.checkInWords` is the set in force; `MinistrySettings.checkInWords` is what was saved.
- `checkin_sequence.words` holds the four sentences a conversation opened with, which is what its later questions, reminders and thank-you are composed from.
- `app/settings/check-in-words.tsx` is the four lines and the phone, composed by the functions that send.
- `ministry.settings_changed` records each sentence's before and after.

### Today's words, checked against the ticket

Three of the four are identical.
The thank-you differs: the ticket and the spec's wording use a straight apostrophe, "We'll", and what goes out today has a curly one, "We’ll".
Today's text was kept, so a church with nothing saved sends exactly what it sends now, and the mock-up has the curly one too.

The ticket says `[name]` is composed as `checkInSubject` composes it, and no such function exists.
The function is `relationshipSubject`, which names a group by name and everything else by the people in it, and the question has used it since Roles per pairing.

### Decisions made

- **A conversation keeps the words it opened with**, not only the texts already sent.
  The ticket says a change applies from the next check-in sent, and the question, its reminder, the rating and the thank-you are all composed after the conversation opens, so without this a mid-week save would change a conversation part-way through.
  The alternative was to snapshot per question, which would let one conversation speak in two voices.
- **A reminder is the church's question, as it first went out.**
  ADR-0034 lists "reminders" among the texts that are Discipler's words; that reads as the acceptance reminder, which stays Discipler's.
  A check-in reminder is the same question sent again, and the code holds that it cannot read as a differently worded second question.
- **A clarification stays in Discipler's words.**
  It is not one of the four lines, and it says the reply choices again, so it belongs to the frame.
  At the concern step it still reads "Sorry, we didn’t catch that. Please tell us more about the concern."
- **The question must say `[name]`, or it is refused.**
  A Leader of three is asked it three times, and a `1` to a question that does not say who it means gets recorded against a person they may not have had in mind.
  The alternative was to allow it and warn, which leaves that wrong answer possible.
- **`[name]` works on all four lines**, as the mock-up's script fills it.
  On the rating and concern lines it is whoever that turn is about.
  On the thank-you it is everyone the conversation covered, since that text closes all of them.
  The alternative was refusing it on the thank-you.
- **Any other `[...]` or `{...}` is refused**, since `[first name]` would otherwise reach a phone as typed.
  `[Name]` and `[ NAME ]` are read as `[name]`.
- **Text an Admin types is data, so it cannot add to the frame.**
  The composers put the frame around it, which is what guarantees the start, the reply choices and the rates line whatever is saved.
  A sentence is also refused if it reads as the frame: "Reply 1", "reply yes", "1 for yes", "A = great", any reply keyword in capitals (the router's six plus the carrier's opt-out words), "opt out", "unsubscribe", "data rates", "via Discipler".
  It reads for what an Admin would plausibly type and does not claim to stop somebody determined; "stop by", "1 on 1", "please reply with more detail" and "at the end of the week" all pass.
  This reading lives in the domain and not in a database check, because it is a reading of English.
- **A link or a phone number is refused**, since the numbers are shared and one church's link is on every church's sender.
  The alternative was to allow them; the A2P campaign's declaration of links and numbers is part of James's open question.
- **Control and invisible characters are taken out, not refused**, because they arrive by pasting and nobody could see what to fix.
  This went into `readWording`, so every typed box has it.
  `Messages read as` had nothing else but a blank check (see below), and a `NUL` in any of them used to reach the database as a crash.
- **A line left as Discipler wrote it saves as nothing**, so the boxes can show Discipler's words for editing and "Use Discipler's wording" clears the church's words on save, without freezing a copy of Discipler's words on the church.
- **"Use Discipler's wording" puts the words back in the boxes** rather than blanking them, as the mock-up's button does.
  The ticket's "clears all four" is what the save then does.
- **Length is counted in characters, not UTF-16 units**, on the sentence as it would go out, so an emoji counts as one, as `char_length` does.
- **The phone's first bubble carries the rates line.**
  The mock-up drew it without; the ticket says the phone shows the frame, and the rates line is part of it.
  It is how that text reads the first time a month.
- **The phone is captioned "What each mentor receives"**, using the church's noun.
  The mock-up's "What Mark Wilson receives" was Example Ministry's data, and a real page has no one person to name.
- **The rating bubble answers D, not C**, since D is the concern now.
  The mock-up's script predates the four ratings.
- **No "New" tag.** The mock-up's was a review mark.
- **Each line is a one-row box that grows with its text**, rather than the mock-up's single-line input.
  At phone width a single-line input clipped even Discipler's own thank-you, so an Admin could not read what they were changing.
  At one line it is the mock-up's height, and Enter does nothing, since these are sentences.
- **With script on, a line that would be refused says so as it is typed and stops the form** through the browser's own validation, because a refused save comes back with the form as saved and the typing gone.
  Without script the server's refusal still holds.
- **A form that omits the fields reads as blank.** No church has words saved before this ships, so a tab open across the deploy cannot lose any.

### For James

- The Twilio question is still open: whether reworded sentences need the A2P campaign's sample messages widened.
  It should be answered before this ships.
- The refusal sentences in `app/settings/check-in-words-copy.ts` are drafts, as the mock-up drew none.
- `Messages read as` is not validated beyond blank, and it starts every text: it has no length limit and could say "Reply STOP".
  This ticket only took control characters out of it, and whether it needs the same refusals is an open question.
