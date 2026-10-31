# A Shared Set of Discipler Numbers

## Status

accepted

Supersedes *Each ministry sends from its own number* in `docs/product-rules.md`, *Every Message Is the Ministry's Voice*, and the `Discipler:` prefix of *The A2P Compliance Prefix Is a Stated Exception*.
Supersedes the part of ADR-0019 in which a Ministry Setup Link names the number a church sends from.

## Decision

**Discipler sends every church's texts from one shared set of Discipler-owned numbers, in one Twilio Messaging Service, instead of a number per church.**
James decided it in the grilling (Q66), and the start of every text in the mock-up 3 review (2026-10-30).

- A number belongs to Discipler, not to a church.
- Each person, in each church, is given one Discipler number the first time that church texts them, and always hears from it.
- A person in two churches hears from a different Discipler number for each, so their replies never mix and a `STOP` to one church leaves the other running.
  That holds only because each text is sent with its number as Twilio's `From`, never by the Messaging Service's SID: Twilio scopes a `STOP` to the number it was sent to when a text names its sender, and to every number in the service when the service picks one ([Twilio, opt-out keywords](https://support.twilio.com/hc/en-us/articles/223134027-Twilio-Support-for-Opt-Out-Keywords-SMS-STOP-Filtering)).
  It is to be confirmed on two real phones, a `STOP` to one church's number and a text from the other's, before any phone is in two churches.
- A reply is matched by the sender's phone, as before; when that phone is in more than one church, the number it was sent to decides which.
- Every text starts "{Messages read as} via Discipler:", for example "Riverside Chapel via Discipler: Did you meet with Jordan this week? Reply 1 for yes, 2 for no."
  Messages read as is the church's existing Sending Name setting: the church's name unless an Admin changes it.
- Numbers are added when volume needs one, not when a church signs up, and support@ is emailed when the set runs near capacity.
- The numbers in use before this joined the set, each person keeping the number they already heard from.

## Context

A number per church was bought and registered with the carriers by hand, and carried on the Ministry Setup Link.
That made the operator part of opening every church, and it was the hard part `docs/open-questions.md` named when James asked for self sign-up.
Registering each church as its own sender would need each church's own brand and EIN, which James rejected (Q65).

*Every Message Is the Ministry's Voice* held that Discipler never names itself in a text, and *The A2P Compliance Prefix Is a Stated Exception* stacked `Discipler:` on a few texts only.
The carriers hold whoever owns the number responsible for what is sent from it, and once the numbers are Discipler's that is Discipler LLC on every text, not on a few.
The open question that nothing computed a Silence Gap, so `Discipler:` never reached the first text after one, is moot: every text now names Discipler.

## Considered options

**Buy and register a number per church automatically.**
Rejected.
Per-church registration means a brand and EIN per church, fees per church, and days of carrier review before a new church can text, which a church signing up at a booth cannot wait for.

**One Discipler number for every church.**
Rejected.
A person in two churches could not be told apart by their replies, and a `STOP` to one church would stop them all.

**Keep `Discipler:` only on the first text and after a Silence Gap.**
Rejected in the mock-up 3 review.
A text from a number shared by many churches needs to say on its face which church is speaking and through whom, and "{church} via Discipler:" says both in fewer characters than the stacked prefix.

## Consequences

**The cost is shared fate.**
A number per church meant a church that over-messaged lost its own number.
Now every church shares Discipler's brand, its daily carrier limit and its reputation, so one church's misuse can slow or stop texts for all of them.
That is why Discipler writes the frame of every text (ADR-0034), why no interface action sends free-form text (ADR-0031), and why texts are spread across the check-in hour and held when the daily limit is reached.

The church is still the speaker of every text and still named first; Discipler is named after it as the service delivering it.
*Every Message Is the Ministry's Voice* is narrowed accordingly: Discipler never speaks for itself in a text, and every text says it comes through Discipler.

Twilio may yet classify Discipler as a platform that registers on churches' behalf, which would bring per-church registration back.
The shared numbers are the best case, not a certainty, and the answer is worked out with James when Twilio replies.

A Ministry Setup Link no longer names a number, because no church has one.
