# Discipler — Consent Language

The exact wording a person agrees to at intake. Discipler records each consent independently, with its own timestamp, alongside the version identifier below.

**This wording has not been reviewed by a lawyer.** It is drafted to be accurate and to cover the obligations Discipler actually creates, but TCPA exposure is not something to accept on an agent's judgment. Review before the first pilot.

## Current version

`consent_version = "2026-09-v1"`

Changing any wording below requires a new version identifier. Existing consent records keep pointing at the version the person actually saw; they are never migrated forward.

## How a person reaches this form

Consent is obtained through the intake form and through nothing else. There are two routes to it, recorded on each consent record as `source`:

- `pastor_link` — a pastor sends the person the link directly. The primary path.
- `qr_code` — a QR code opening the same link, for a leaders' meeting where a room can complete it together.

Both put the same wording in front of the same person, so both produce the same record. The route is kept because *how did this congregant come to agree* is a question a compliance review asks, and a column added afterwards cannot answer it retrospectively.

An admin attesting to consent on a congregant's behalf is not a route, at import or anywhere else. Inbound-keyword opt-in is post-V1.

## Statement 1 — SMS consent

Presented as a required checkbox. Discipler sends nothing to anyone whose record lacks it.

> I agree to receive text messages from **{{ministry_name}}** through Discipler about my discipleship relationship, including a weekly check-in. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.

## Statement 2 — Contact sharing consent

Presented as a separate required **decision** — two answers, yes and no, rather than a checkbox that records only agreement. A person must answer it to submit the form, and *no* is one of the two answers: unanswered and declined are different facts, and a checkbox cannot tell them apart.

Declining does not block intake. A person who agrees to be texted and refuses contact sharing completes intake, reaches `Ready to Pair`, and can be paired; what changes is that their number is never included in a message or shown on a dashboard.

It is checked at send time, not assumed from enrollment: Discipler includes a person's phone number in a message or on a dashboard only where this consent is present.

The wording covers relationships of any size, because a relationship is one leader and N participants and the same statement has to hold for both.

> I agree that my name and phone number may be shared with **{{ministry_name}}** and with the people in the discipleship relationship I am placed in — the leader, and anyone else being discipled alongside me.

## Why the two are separate

A person can reasonably agree to hear from their church and not agree to have their number handed to another congregant. Bundling them into one checkbox would make both unreliable and would leave Discipler unable to answer what someone actually agreed to.

## What the texts themselves say about opting out

The statements above are what a person agrees to, once.
The texts they then receive carry a shorter line, the rates line: *Msg & data rates may apply. Reply STOP to opt out, HELP for help.*
It is not consent wording, so this section changes no version identifier.

It is not on every text (James, 2026-09-21).
A person is sent it at most once in a calendar month, on the first text of that month that may carry it, and it is left off the rest.
The month is the Ministry's own, by its timezone.
It is decided per person and not per relationship, so a leader of three relationships reads it once.

- The Welcome Message, which is first contact and the receipt for this consent, always carries it.
- The `HELP` reply always carries it, because saying how to make the texts stop is what it is for.
- The Starter Messages, the text a leader gets when somebody joins their group, a resume, and the question that opens a check-in may carry it, and do where the person has not been queued it yet that month.
- No other text carries it.

Each queued text records whether it carried the line, and that record is what later texts are decided against, never the text's wording.
A text withheld at send time, because by then the person had opted out or had no consent or number, does not count: nobody read it.
A text the vendor refused does count, because it stays on the queue and is tried again until it goes.

The rule is in `src/domain/rates-line.ts`.
Carriers and the CTIA guidance ask for opt-out instructions on the first message and at regular intervals on a recurring program, and once a month is the interval this product chose.
That reading has not been checked against the A2P campaign as registered, and should be before the first pilot.

## What is not covered here

These statements cover messaging and contact sharing only. They are not a privacy policy, not terms of service, and not consent to any use of a person's data beyond operating their own discipleship relationship and their own ministry's reporting.

Nothing in this wording permits a person's data to leave their ministry. See the Ministry isolation rule in `docs/product-rules.md`.
