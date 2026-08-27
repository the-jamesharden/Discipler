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

Presented as a separate required checkbox. It is checked at send time, not assumed from enrollment: Discipler includes a person's phone number in a message or on a dashboard only where this consent is present.

The wording covers relationships of any size, because a relationship is one leader and N participants and the same statement has to hold for both.

> I agree that my name and phone number may be shared with **{{ministry_name}}** and with the people in the discipleship relationship I am placed in — the leader, and anyone else being discipled alongside me.

## Why the two are separate

A person can reasonably agree to hear from their church and not agree to have their number handed to another congregant. Bundling them into one checkbox would make both unreliable and would leave Discipler unable to answer what someone actually agreed to.

## What is not covered here

These statements cover messaging and contact sharing only. They are not a privacy policy, not terms of service, and not consent to any use of a person's data beyond operating their own discipleship relationship and their own ministry's reporting.

Nothing in this wording permits a person's data to leave their ministry. See the Ministry isolation rule in `docs/product-rules.md`.
