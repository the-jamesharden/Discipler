# The Roster Shows Contact Details to an Admin

## Status

accepted

## Decision

**Every row of the Roster shows the Person's phone number and email to an Admin.**
The details reach the screen through `public.roster`, a security definer function whose Admin test is the whole of the gate.
No column grant changes: a browser session still holds no `SELECT` on `person.phone`, so a Leader session reaches a number only through `public.contact_to_share`, which answers only where the Person currently consents to contact sharing.
No message discloses a number, as before.

## Context

Ticket 31 kept contact details off the Roster on the reading of ADR-0010 that a number is reached one Person at a time through the consent check and never listed.
Ticket 26 then took the phone column out of the grant on `held_import_row` on the same reading.

The product owner reversed it for the Admin surface on 2026-09-06, while adopting a Roster design that carries Email and Phone on every row.
The reasoning is who already holds the details.
An Admin uploaded them from the church's own spreadsheet, or the Person typed them on the Intake form the Admin sent.
A Roster that hides them from the one person who holds them is a Roster an Admin keeps a spreadsheet beside, and the contact-sharing consent was never a consent about the Admin: it governs whether a Person's number may be handed to *somebody else*, a Leader or a Participant, which is exactly what `contact_to_share` and the sending layer still enforce.

## Consequences

The Roster row, the person page, and the held-rows card may show a number and an email.
The reasons ticket 26 hid the number on a held row are gone with this, and the card shows it.

`contact_to_share` keeps its meaning and its one caller on the Follow-Up tab: a Leader is a different reader with a different consent behind them, and the Leader Dashboard's own reads (ticket 15) are unchanged.

The column comment on `person.phone` says which surfaces may read it, and the migration that widened `public.roster` is where the Admin path lives.
A future surface that wants a number for an Admin reads it through that function or one like it, never through a grant on the column.
