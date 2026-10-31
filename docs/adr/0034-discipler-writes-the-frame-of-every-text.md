# Discipler Writes the Frame of Every Text

## Status

accepted

A permanent rule, kept with ADR-0033.
Amends ADR-0015: the structure of a message is still not a Ministry's, and a Ministry now owns the check-in's sentences inside it.

## Decision

**Discipler always writes the frame of every text it sends: the "{Messages read as} via Discipler:" start, the reply choices, and the rates and opt-out lines.**
**A church may reword only the check-in's sentences inside that frame, in Settings' "What the check-in says".**
James decided the frame in the mock-up 3 review (2026-10-30), and how far a church may go in round 3 of it.

- The check-in has four sentences a church may rewrite: the question, how it went, after a concern, and the thank-you.
  "[name]" in a sentence stands for whoever the check-in is about.
- A blank sentence falls back to Discipler's words, and each sentence has a length limit.
- Whatever a church writes, the composer adds the start, the reply choices and the rates line, so every answer can still be counted and every text still says how to stop it.
- No other text is a church's to reword: the Welcome Message, the Starter Messages, the invitation, reminders, keyword replies and `HELP` are Discipler's words, with the church's name and nouns where they always were.
- A change applies from the next check-in sent; a text already sent keeps the words it went out with.

## Context

Every text goes out from a Discipler number under Discipler LLC's carrier registration (ADR-0033), so Discipler is answerable for every word of it.
The registration describes Discipler's messages, the opt-out language carriers require has to be on them, and the reply router can only count a reply to a question whose choices it wrote.

Churches asked to sound like themselves, and a church run by one person wanted its texts to sound like that person.
Messages read as answers the second; the check-in's sentences answer the first.

## Considered options

James asked to see all three in mock-up 3.

**Keep Discipler's words for every text.**
Rejected.
The check-in is the text a Leader reads every week, and a church's own way of asking is what makes it feel like their church.

**Fully free text.**
Rejected.
A church could drop the reply choices, so answers stop being countable, or the opt-out line, so a text breaks the registration that every church's texts depend on.
It would also be a free-form message from a church to its people on a shared number, which is what *No Interface Action Sends Free-Form Text* refuses.

**Each sentence, inside Discipler's frame.**
Chosen.

## Consequences

**The trade-off is a church's voice against everyone's numbers.**
A church gets four sentences and no more, and Discipler accepts a little content it did not write on its numbers.
Whether the carrier registration's sample messages need widening for reworded sentences is for James to settle with Twilio before ticket 40 ships.

This changes the rule, as the spec put it, that Discipler only ever sends texts it writes: Discipler now writes the frame of every text and all of most texts, and a church writes up to four sentences of one.

ADR-0015's two rules about a Ministry's nouns still govern every text Discipler writes.
A church's own sentence is its own, so Discipler does not apply them to it.

The frame is a permanent rule because the numbers are shared: loosening it for one church loosens it for every church's sender.
