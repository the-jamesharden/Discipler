# A Material Change Is Texted Once It Settles

## Status

accepted

Supersedes the *No Interface Action Sends a Message* rule in `docs/product-rules.md` in one respect, and amends ADR-0010's *there is no admin-initiated send anywhere in Discipler*.

## Decision

**When the Material a person is working through changes, they are sent one text, once nothing feeding it has changed for an hour, at most once a day, and only if where things ended up differs from what they were last told.**
James decided it on 2026-09-24: "a singular text that goes out each mentor whenever a material has been changed", limited so that an Admin "confirming then editing rapidly over and over the same day" sends nobody a stream of texts.

The button does not send it.
An Admin assigns, edits or takes a Material away, and history records that; the hourly tick later reads what each person was last told (`material_notice`), what is running now, and when anything feeding it last changed, and decides.
The rule is `src/domain/material-notices.ts`; the wording is `materialMessage` in `src/domain/outbound-copy.ts`.

What counts as a change is the Material a relationship is on, and what that Material holds: its text and its files and links, compared as a fingerprint.
A corrected title changes nothing anybody needs to be told.
A paused relationship's change waits for the resume.
The text goes out in the hours a check-in may, 8am to 9pm in the Ministry's timezone, and the day it is counted in is the Ministry's.

## Context

`docs/product-rules.md` settled that no Admin action sends a message, and ADR-0010 made `Nudge` reveal a number rather than send anything, because Discipler's whole participant-facing surface is SMS and a Ministry that over-messages its own congregation gets its number carrier-flagged.
That reason still stands, and it is why this text is shaped the way it is: never sent by a button, never more than one a day a person, never sent for a change that was undone, and always through the sending layer's recipient check like every other text.

The alternatives James was shown on 2026-09-24:

- **The next morning, as a digest** of the day's changes. Rejected: a change at 9am waits a day for no reason.
- **The first change at once, and later ones the next day.** Rejected: the first of several edits is the one most likely to be wrong, and it is the one that would go.

## Consequences

- There is now one text in the product that follows an Admin's act, and the one-a-day ceiling is what bounds it; a second such text would need its own ceiling, not this one's.
- The tick is hourly, so the text arrives one to two hours after the last change. James accepted that on 2026-09-24 rather than a separate, more frequent check.
- The migration that introduced `material_notice` records everybody in a running relationship as already told about the Material they were on, so shipping it texted nobody about something they already had.
