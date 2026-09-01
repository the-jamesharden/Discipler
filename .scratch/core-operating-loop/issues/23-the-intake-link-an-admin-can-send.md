# 23 — The Intake link an Admin can send

**What to build:** The surface that gives an Admin the Intake link for their Ministry, and the QR code that opens the same link.

Ticket 03 built the form and both routes to it: `/intake/<ministry>` for a link a
pastor sends, and `?via=qr` for a QR code opening that same link. Nothing in the
product hands the Admin either one. The link exists and works; the only way to
obtain it is to know the Ministry's identifier and type the URL, which is not a
route a pastor has.

**Blocked by:** 03

**Status:** shipped

- [x] An Admin can see and copy their Ministry's Intake link from the Roster
- [x] The same page renders a QR code for that link with `?via=qr`, at a size that scans off a screen and off a printed page
- [x] The QR code can be saved or printed, so it can be put in front of a room at a leaders' meeting
- [x] The page says which route each produces, because `consent_record.source` records the difference and a compliance review asks about it

## Comments

### Why this is a ticket and not part of 03

Ticket 03's first criterion is *"A Person can complete Intake from a link with no
account, reached either from a link the pastor sent them or from a QR code opening
that same link."* Both routes are built and both are tested end to end. What is
missing is the Admin's side of the sentence -- the *sending* -- which is a Roster
surface rather than anything to do with Intake, and which ticket 03 did not build
and did not list among the work it deferred.

Found in the ticket 03 review, 2026-08-28.

### What shipped, 2026-08-31

A panel at the top of the Roster carrying the link in a field an Admin can select,
the QR code beside it, and a sentence on each saying which `consent_record.source`
it produces. The code is drawn by `/roster/intake-code.svg`, which takes the
Ministry from the session rather than the URL -- so one path answers every Admin
with their own code, and the response is `private, no-store` because a shared cache
holding the first would hand one Ministry's congregation another Ministry's form.
The Roster embeds that route rather than inlining a second copy, so the square an
Admin prints and the square they are looking at cannot come to differ.

The encoder is the `qrcode` package rather than one written here. A QR code that
does not scan fails in the one place nobody can debug it -- in front of a room, on
somebody else's phone -- and Reed-Solomon and mask selection are not product logic.
What is asserted at the vendor boundary is everything that decides whether the
square survives paper: a four-module quiet zone, black on white stated rather than
inherited from a themed page, an intrinsic size that scans off a screen, and a
viewBox so it prints at whatever size the paper is.

`Intake Link` was already a glossary term for a different thing -- one Person's
prefilled, expiring link. Both now appear on the Roster, so `CONTEXT.md` gained
**Ministry Intake Link** with the distinction, and the panel says on the page which
of the two an Admin is looking at.

### Raised, not built: three Intake paths

Asked for three QR codes -- mentor, mentee, and group -- rather than one. Three
codes require three paths, and three paths are a product change: leading is a plan
an Admin records (ticket 16), relationship kind is declared at pairing (ADR-0004),
and `consent_record.source` distinguishes only link from QR. Written up as ticket
27 with the open decisions rather than resolved inside this one.

### What the review changed, and one thing it did not

**The second copyable field went.** The panel briefly offered the code's own
`?via=qr` link beside the plain one, on the reasoning that a Ministry designing its
own poster would want it. That works against the criterion above it: a link texted
from that field records every Person who follows it as having scanned a code nobody
printed. The code is the artifact; the link it carries is not a second thing to
send, and a test now asserts the field is absent.

**The size the criterion is about is the one on the page.** The encoder's 640 is
what the file is worth on its own -- what a browser prints from the standalone route
-- and it decides nothing about what an Admin can hold a phone up to. That number is
the Roster's, it is stated on the element rather than in the stylesheet so one place
owns it, and the HTTP test asserts it rather than leaving a passing encoder test to
imply a size the page then overrode.

**Declined: naming `pastor_link` and `qr_code` on the screen.** The review read
`app/intake/reopen/[token]/page.tsx` as precedent for putting the enum values in
front of an Admin, but that file names `pastor_link` in a code comment, not in copy
a visitor reads. Nothing user-facing in Discipler speaks in column values, and the
criterion asks the page to say which route each produces -- which plain English does.
A compliance review reads the consent record, where the value actually is.

**Known limit:** the code is offered as SVG only. It prints and it saves, and it
scales, which is what the criterion asks for -- but tools that cannot import SVG
(Google Slides among them) will need it converted. A raster format is not offered
because nothing in this ticket asks for one.


### What the second review changed, 2026-08-31

Two criteria were being met by the Admin's knowledge of their browser rather than by
anything the page offered, and the review called both partial.

**Copying is a control now.** The link sat in a `readOnly` field and "copy" meant
select the text by hand. A `Copy` button sits beside it -- the first and only thing
in Discipler that runs in the browser, because there is no way to put something on a
clipboard without script. The field is still server-rendered and still a real field,
so an Admin whose browser runs none of it is exactly where they were; the button is
the improvement and not the mechanism, and a refused clipboard falls back to
selecting the field.

**Saving is a download now.** The panel offered one tab and left saving and printing
to `Ctrl+S` and `Ctrl+P` on it. Saving is its own link with `download`, which names
the file on the way out; the tab remains, and is now labelled as the printing one,
because a browser printing the square on its own puts it on the paper at whatever
size the paper is and the Roster around it would prevent that. The route still sends
`content-disposition: inline`, because the Roster embeds it as an `<img>`.

**`?via=qr` had three authors.** It was written in `ministryIntakeQrLink`, again in
the HTTP suite's `scanned` helper, and again in the encoder test's fixture link. Both
tests now ask the domain for it, so the one string a compliance review ends up
reading is written once and a drift in it fails the domain test rather than leaving
three files agreeing about the wrong thing.

**Two smaller things.** `invitationLink`'s docblock had been left stranded above the
`host` helper inserted beneath it, which left the one link function in the file
undocumented. And `img.qr`'s comment claimed the element owned the size while sitting
above `max-width: 100%`; the cap is a cap, it never enlarges the square, and the
comment says so.
