# 15 — The Leader Dashboard

**What to build:** A Leader signs in and sees the relationships they lead — the list is whatever they currently hold an open leader membership on, asked of the data rather than read off an access tier, so an Admin who leads two relationships sees them without a second account and a Leader whose last relationship ends stops seeing the surface without anyone revoking anything.

There are two surfaces in V1 and no third: Admin and Leader. Being discipled grants no surface at all. A Person who leads two relationships and is a Participant in a third sees the two, and nothing of the third — its Leader holds it, and its availability changes still go through an Admin-sent intake link like every other Participant's., and for each one three things and nothing else: the availability overlay, the Material assigned to it, and the name and phone number of everyone in it. No message history, no analytics, no ability to edit anyone else's data.

Each relationship shows its current status. A paused one stays on the list, visibly marked `Paused`, for the whole pause.

The availability overlay is one grid per relationship, days of the week down the vertical axis and times of day across the horizontal. Everyone's Intake availability is drawn on the same grid so the Leader can see where a meeting fits. For a relationship with one Participant, a slot is **green** where both the Leader and the Participant marked themselves available, and **yellow** where the Participant is available but the Leader did not mark that slot. The yellow is deliberately asymmetric: it shows a Leader exactly where the other person can meet and they said they could not, which is where a Leader may choose to move something. For a relationship with several Participants, each person carries their own color so the Leader can see which slots gather the most people.

**Nothing on the grid schedules anything.** Discipler highlights the slot with the greatest overlap that the Leader also marked, but the Leader chooses the time and sends the invitation themselves — including choosing a slot with better overlap that they did not originally mark. Where no slot works for everyone including the Leader, the grid says so plainly rather than recommending a time the Leader cannot attend. Availability is a starting point for making first contact, not a standing record of anyone's schedule.

Contact details shown here respect each Person's contact-sharing consent, which is checked at display time rather than assumed from enrollment. A Leader whose session has expired signs in with their phone number and password.

**Blocked by:** 12, 14

**Status:** shipped

- [x] The Leader surface is shown on a live query for open leader memberships, never on `ministry_member.tier`
- [x] An Admin who also leads reaches both surfaces in one session, holding only a `tier = 'admin'` row
- [x] A Leader sees only the relationships they hold an open leader membership on
- [x] A Leader who is also a Participant elsewhere sees nothing of that relationship here, and that membership grants them no access anywhere
- [x] Each relationship shows `Paused` where a Pause stands. **Amended:** no other status. See *Amended -- status is the Admin's* below
- [x] The overlay draws days vertically and times horizontally, with everyone's availability on one grid
- [x] One-Participant overlays distinguish mutual availability from Participant-only availability
- [x] Multi-Participant overlays give each person their own color
- [x] The greatest-overlap slot the Leader also marked is highlighted, and nothing is scheduled
- [x] Where no slot works for everyone including the Leader, the grid says so
- [x] The assigned Material and the contact details of everyone in the relationship are shown
- [x] Contact details are gated on contact-sharing consent at display time
- [x] A Leader can sign back in with phone number and password

## Comments

### Amended — dual-role persons

Q6, settled: two surfaces only, Admin and Leader, and no Participant surface for
anybody. This keeps `docs/leader-dashboard.md`'s *three things and nothing else*
intact rather than adding a fourth section to it.

The tier check is what changes. `unique (ministry_id, user_id)` means an Admin who
leads holds one row and it says `admin`, so a surface gated on `tier = 'leader'`
would hide their own relationships from them.

### A live gap this ticket closes

Row-level security is row-level, so a Leader reading a Person they lead reads that
Person's `phone` column along with everything else on the row. Contact-sharing consent
governs whether a number may be *shown*, and this dashboard is the surface that owes
that check -- it is checked at the moment of display, never assumed from enrolment.
Until this ships, the column is readable by a Leader whose Participant did not consent
to sharing it. Recorded by ticket 02, which added the column.

### Settled — sign-in is a phone number and a password

*A Leader whose session has expired signs in with their phone number and password* is
correct and is now the rule for every user including Admins. Ticket 01's email sign-in
page is superseded. See `docs/adr/0008-the-phone-number-is-the-sign-in-credential.md`.

### Settled — the display-time consent check calls `app.current_consent`

The record behind this check could not express a withdrawal: only a grant wrote a row,
so the check read *has ever granted*. Fixed ahead of ticket 16 in migration
`20260828000100`. `app.current_consent(person, kind)` is the one definition of a
current consent, and this dashboard is its fifth caller — use it rather than writing a
sixth variant of the query.

### Amended -- status is the Admin's, and `Paused` is not a status

Settled during implementation. The Leader Dashboard shows **no Relationship State**.
Healthy, Stalled and Needs Care are Discipler's reading of how a relationship is
doing, and that reading belongs to the Admin: it is what Care Needed exists to
surface and what a pastor acts on. A Leader sees the people they lead, not a verdict
on how their leading is going.

`Paused` stays, and the distinction is worth stating because the checklist item
above used to run the two together. A Pause is not a judgement about the
relationship -- it is the Leader's own act, and it is the reason their weekly
check-ins have stopped arriving. Withholding it would leave a Leader unable to tell
a pause they took from a Discipler that had gone quiet. `CONTEXT.md`'s **Paused**
entry already says a paused relationship stays "visibly marked as paused on both the
leader's list of relationships and the admin dashboard", which is exactly this and
nothing more.

**`docs/leader-dashboard.md` conflicts and has not been edited.** Its line *"Each
relationship on the list shows its current status"* is now wider than the product.
Left for a human, because that file is product definition rather than a ticket.

The consequence is that this ticket needed no widening over check-in history: the
grants on `checkin_sequence`, `checkin_prompt`, `ministry_event` and `concern` are
untouched, and a Leader still reads none of them. Only the Pause moved, and it moved
inside `public.relationship_pauses` rather than through the policy on
`ministry_event` -- see the migration.

### Settled -- the phone column is no longer readable unmediated

Migration `20260905000100` deferred *which surfaces may read `person.phone`
unmediated* to this ticket. The answer is **none**.

`revoke select on person from authenticated`, then a column grant naming every
column but `phone`. A column privilege cannot be subtracted from a table-level
grant, so `revoke select (phone)` would have left the number readable -- checked
against the live database rather than assumed.

`public.contact_to_share` is now the only path a browser session has to a number,
and its own check narrowed from `app.is_member_of` to *Admin of the Ministry, or
leads this Person*. The old test was right while Care Needed was the only caller and
wrong the moment this dashboard shipped: a Leader holds a `ministry_member` row too,
so ministry membership would have let them ask about anybody in the congregation.

`email` is deliberately still readable. It is the same kind of fact under the same
consent, but no surface displays it, so there is nothing to gate at display time.
**For ticket 16**, which is the first to put an email address on a screen.

One consequence worth knowing about: a whole-row reference needs SELECT on every
column, so dropping `phone` took `participation_status` as a PostgREST computed
column with it. The Roster now reads `public.roster(uuid)`. The derivation is
unchanged.

### Settled -- the availability overlay is a definer function, not a policy

`intake_availability` rows are keyed to a submission, and `intake_submission` is
Admin-only -- so a policy widened for Leaders would have had to reach a table the
Leader cannot see, and would have answered *no rows* for the Leader it was written
for. `public.relationship_availability(relationship)` is the widening and the whole
of it; the table itself stays shut.

It returns each Person's **most recent** submission rather than the union of all of
them. An Admin can reopen somebody's Intake form with a tokenized link, so a second
submission is ordinary, and unioning the two would leave a Person permanently
available at a time they went back and unticked.

### Settled -- a Leader sees the Material period that is running, and no other

Ticket 14 withheld the Leader grant as "a policy written wider than the product is a
grant waiting for a screen" and named this ticket. The screen shows one Material:
the one the relationship is working through now. So the policies on `material`,
`material_assignment` and the storage bucket are all scoped to `ended_at is null` --
a Leader's sight of a Material arrives when an Admin assigns it and leaves when they
assign the next one. The closed periods are the relationship's history, and this
surface carries none.

`public.material_periods(uuid)`, granted to nobody by ticket 14, is granted to
`authenticated`. It is security invoker, so those policies are what bound it.

### Settled -- sign-in, and what it cost

`/login` takes a phone number and a password, for every user including Admins, and
reads the typed number through `asPhoneNumber` -- the same function the spreadsheet
importer and the Intake form read one through. Ticket 01's email page is replaced.

Sign-in lands on `/`, which asks what the session holds before sending anyone
anywhere: an Admin reaches the Roster, everybody else reaches their own
relationships, and an Admin who leads reaches the second from a link on the first.

**A deployment note that is not obvious.** Supabase turns phone login off entirely
when no SMS provider is configured, so `[auth.sms.twilio]` is enabled in
`supabase/config.toml` with credentials substituted from the environment. Discipler
asks it to send nothing -- one-time codes are post-launch -- and its own outbound SMS
does not go through it at all. The new variables are in `.env.example`.

### Amended by ticket 31 - the overlay's axes are swapped - 2026-09-01

This ticket fixed the overlay as days down the vertical axis and times across the horizontal, and shipped that way.
Ticket 31 reverses it: time of day down, days across, on every availability grid in the product, so the overlay reads the same way as the Intake grid a person filled in.
The shading rules, the per-person dots and the recommended-slot outline are unchanged.
The redraw and its tests are ticket 31's work; nothing here reopens.

### The axes stay as shipped, and the columns become hours - 2026-09-01

The amendment above is withdrawn: James reversed it the same day.
Days run down the vertical axis and time of day across, exactly as this ticket fixed it.
What does change under ticket 31 is the columns: the grid becomes hourly, 8am to 8pm, twelve columns instead of five named blocks, which supersedes ADR-0006.
The shading rules, the per-person dots and the recommended-slot outline are unchanged.
