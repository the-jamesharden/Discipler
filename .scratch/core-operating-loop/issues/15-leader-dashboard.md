# 15 — The Leader Dashboard

**What to build:** A Leader signs in and sees the relationships they lead — the list is whatever they currently hold an open leader membership on, asked of the data rather than read off an access tier, so an Admin who leads two relationships sees them without a second account and a Leader whose last relationship ends stops seeing the surface without anyone revoking anything.

There are two surfaces in V1 and no third: Admin and Leader. Being discipled grants no surface at all. A Person who leads two relationships and is a Participant in a third sees the two, and nothing of the third — its Leader holds it, and its availability changes still go through an Admin-sent intake link like every other Participant's., and for each one three things and nothing else: the availability overlay, the Material assigned to it, and the name and phone number of everyone in it. No message history, no analytics, no ability to edit anyone else's data.

Each relationship shows its current status. A paused one stays on the list, visibly marked `Paused`, for the whole pause.

The availability overlay is one grid per relationship, days of the week down the vertical axis and times of day across the horizontal. Everyone's Intake availability is drawn on the same grid so the Leader can see where a meeting fits. For a relationship with one Participant, a slot is **green** where both the Leader and the Participant marked themselves available, and **yellow** where the Participant is available but the Leader did not mark that slot. The yellow is deliberately asymmetric: it shows a Leader exactly where the other person can meet and they said they could not, which is where a Leader may choose to move something. For a relationship with several Participants, each person carries their own color so the Leader can see which slots gather the most people.

**Nothing on the grid schedules anything.** Discipler highlights the slot with the greatest overlap that the Leader also marked, but the Leader chooses the time and sends the invitation themselves — including choosing a slot with better overlap that they did not originally mark. Where no slot works for everyone including the Leader, the grid says so plainly rather than recommending a time the Leader cannot attend. Availability is a starting point for making first contact, not a standing record of anyone's schedule.

Contact details shown here respect each Person's contact-sharing consent, which is checked at display time rather than assumed from enrollment. A Leader whose session has expired signs in with their phone number and password.

**Blocked by:** 12, 14

**Status:** ready-for-agent

- [ ] The Leader surface is shown on a live query for open leader memberships, never on `ministry_member.tier`
- [ ] An Admin who also leads reaches both surfaces in one session, holding only a `tier = 'admin'` row
- [ ] A Leader sees only the relationships they hold an open leader membership on
- [ ] A Leader who is also a Participant elsewhere sees nothing of that relationship here, and that membership grants them no access anywhere
- [ ] Each relationship shows its status, including `Paused`
- [ ] The overlay draws days vertically and times horizontally, with everyone's availability on one grid
- [ ] One-Participant overlays distinguish mutual availability from Participant-only availability
- [ ] Multi-Participant overlays give each person their own color
- [ ] The greatest-overlap slot the Leader also marked is highlighted, and nothing is scheduled
- [ ] Where no slot works for everyone including the Leader, the grid says so
- [ ] The assigned Material and the contact details of everyone in the relationship are shown
- [ ] Contact details are gated on contact-sharing consent at display time
- [ ] A Leader can sign back in with phone number and password

## Comments

### Amended — dual-role persons

Q6, settled: two surfaces only, Admin and Leader, and no Participant surface for
anybody. This keeps `docs/leader-dashboard.md`'s *three things and nothing else*
intact rather than adding a fourth section to it.

The tier check is what changes. `unique (ministry_id, user_id)` means an Admin who
leads holds one row and it says `admin`, so a surface gated on `tier = 'leader'`
would hide their own relationships from them.
