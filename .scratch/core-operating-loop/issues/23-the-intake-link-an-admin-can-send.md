# 23 — The Intake link an Admin can send

**What to build:** The surface that gives an Admin the Intake link for their Ministry, and the QR code that opens the same link.

Ticket 03 built the form and both routes to it: `/intake/<ministry>` for a link a
pastor sends, and `?via=qr` for a QR code opening that same link. Nothing in the
product hands the Admin either one. The link exists and works; the only way to
obtain it is to know the Ministry's identifier and type the URL, which is not a
route a pastor has.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] An Admin can see and copy their Ministry's Intake link from the Roster
- [ ] The same page renders a QR code for that link with `?via=qr`, at a size that scans off a screen and off a printed page
- [ ] The QR code can be saved or printed, so it can be put in front of a room at a leaders' meeting
- [ ] The page says which route each produces, because `consent_record.source` records the difference and a compliance review asks about it

## Comments

### Why this is a ticket and not part of 03

Ticket 03's first criterion is *"A Person can complete Intake from a link with no
account, reached either from a link the pastor sent them or from a QR code opening
that same link."* Both routes are built and both are tested end to end. What is
missing is the Admin's side of the sentence -- the *sending* -- which is a Roster
surface rather than anything to do with Intake, and which ticket 03 did not build
and did not list among the work it deferred.

Found in the ticket 03 review, 2026-08-28.
