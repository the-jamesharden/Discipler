# Discipler — Consent Language

The exact wording a person agrees to at intake. Discipler records each consent independently, with its own timestamp, alongside the version identifier below.

**This wording has not been reviewed by a lawyer.** It is drafted to be accurate and to cover the obligations Discipler actually creates, but TCPA exposure is not something to accept on an agent's judgment. Review before the first pilot.

## Current version

`consent_version = "2026-11-v1"`

Changing any wording below requires a new version identifier. Existing consent records keep pointing at the version the person actually saw; they are never migrated forward.

A new version asks nothing new of anybody who already agreed.
Nothing reads a record's version to decide what to send or who may be paired: what counts is the person's latest decision on each consent, whatever version it was made under.

The wording of each earlier version is under [Earlier versions](#earlier-versions).

## How a person reaches this form

Consent to take part is obtained through the intake form and through nothing else.
There are two routes to it, recorded on each consent record as `source`:

- `pastor_link` — a pastor sends the person the link directly. The primary path.
- `qr_code` — a QR code opening the same link, for a leaders' meeting where a room can complete it together.

Both put the same wording in front of the same person, so both produce the same record. The route is kept because *how did this congregant come to agree* is a question a compliance review asks, and a column added afterwards cannot answer it retrospectively.

An admin attesting to consent on a congregant's behalf is not a route, at import or anywhere else. Inbound-keyword opt-in is post-V1.

Since the Exponential launch there is a third source, which is not a route to this form: `ministry_setup`, the Admin's own consent at sign-up, below.

## The Admin's consent at sign-up

An Admin who signs a church up agrees, on the page that asks for their email and mobile phone, to be texted at that phone.
The wording sits under the phone field, word for word:

> By continuing, you agree to receive texts from Discipler at this number, including sign-in codes and test check-ins. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.

Continuing is the consent, and its time is kept.
The record for that phone is written when the church is opened, with that time and `source = 'ministry_setup'`, because it needs a Person and a Ministry, and nothing is texted before then.
It covers the texts it names, a code that proves the phone is theirs and the test check-in, and nothing else: it is never consent to the Check-In Rhythm as a Leader or a Participant.
It is not an Intake: it does not change the Admin's Participation Status, and being paired still needs an Intake, with both statements below.

An Admin from before sign-up has no such consent.
The test check-in's card shows them the same sentence with "By sending" in place of "By continuing", above its button, and sending is their agreement.

This is different wording from Statement 1, so it is recorded with a version identifier of its own, `SIGN_UP_CONSENT_VERSION` in `src/domain/consent.ts`, never one of the identifiers on this page.
Its time is when "Email me a code" was pressed for that phone: a resend keeps it, and pressing it again with a different phone moves it, since the consent is for that number.
The public description of this opt-in, for the carrier registration, is drafted for trydiscipler.com/sms-opt-in in `docs/legal/sms-opt-in-sign-up-section.md`.

## Statement 1 — SMS consent

Presented as a required checkbox.
Discipler sends nothing to anyone whose record lacks it, except the texts an Admin's own consent above names.

> I agree to receive text messages from **{{ministry_name}}** through Discipler about my discipleship relationship, including a weekly check-in. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. See our [Privacy Policy](https://trydiscipler.com/privacy/) and [Terms of Service](https://trydiscipler.com/terms/).

The two links open in a new tab, so reading one does not cost a person a half-filled form, and pressing one does not tick the box.

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

These statements cover messaging and contact sharing only. They point at the privacy policy and the terms of service without being either, and they are not consent to any use of a person's data beyond operating their own discipleship relationship and their own ministry's reporting.

Nothing in this wording permits a person's data to leave their ministry. See the Ministry isolation rule in `docs/product-rules.md`.

## Earlier versions

### `2026-09-v1`

In use until November 2026.
Statement 2 is the same as above.
Statement 1 read:

> I agree to receive text messages from **{{ministry_name}}** through Discipler about my discipleship relationship, including a weekly check-in. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.

`2026-11-v1` added the last sentence and its two links to Statement 1 and changed nothing else.
