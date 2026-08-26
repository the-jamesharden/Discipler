# 15 — The Leader Dashboard

**What to build:** A Leader signs in and sees the relationships they lead, and for each one three things and nothing else: the availability overlay, the Material assigned to it, and the name and phone number of everyone in it. No message history, no analytics, no ability to edit anyone else's data.

Each relationship shows its current status. A paused one stays on the list, visibly marked `Paused`, for the whole pause.

The availability overlay is one grid per relationship, days of the week down the vertical axis and times of day across the horizontal. Everyone's Intake availability is drawn on the same grid so the Leader can see where a meeting fits. For a relationship with one Participant, a slot is **green** where both the Leader and the Participant marked themselves available, and **yellow** where the Participant is available but the Leader did not mark that slot. The yellow is deliberately asymmetric: it shows a Leader exactly where the other person can meet and they said they could not, which is where a Leader may choose to move something. For a relationship with several Participants, each person carries their own color so the Leader can see which slots gather the most people.

**Nothing on the grid schedules anything.** Discipler highlights the slot with the greatest overlap that the Leader also marked, but the Leader chooses the time and sends the invitation themselves — including choosing a slot with better overlap that they did not originally mark. Where no slot works for everyone including the Leader, the grid says so plainly rather than recommending a time the Leader cannot attend. Availability is a starting point for making first contact, not a standing record of anyone's schedule.

Contact details shown here respect each Person's contact-sharing consent, which is checked at display time rather than assumed from enrollment. A Leader whose session has expired signs in with their phone number and password.

**Blocked by:** 12, 14

**Status:** ready-for-agent

- [ ] A Leader sees only the relationships they lead
- [ ] Each relationship shows its status, including `Paused`
- [ ] The overlay draws days vertically and times horizontally, with everyone's availability on one grid
- [ ] One-Participant overlays distinguish mutual availability from Participant-only availability
- [ ] Multi-Participant overlays give each person their own color
- [ ] The greatest-overlap slot the Leader also marked is highlighted, and nothing is scheduled
- [ ] Where no slot works for everyone including the Leader, the grid says so
- [ ] The assigned Material and the contact details of everyone in the relationship are shown
- [ ] Contact details are gated on contact-sharing consent at display time
- [ ] A Leader can sign back in with phone number and password
