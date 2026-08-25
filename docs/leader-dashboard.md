# Discipler — The Leader Dashboard

The leader-facing web surface. A leader is the only participant-side role with an account; people being discipled have none.

## Getting in

A leader's first contact is an SMS invitation link sent when an admin creates a relationship for them. The message names the relationship and the church and carries no phone numbers:

> Hi David — you've been paired with Emily Johnson through Anthem Church. Tap here to see your pairing and get started: {{link}}
>
> Reply STOP to opt out. Msg & data rates may apply.

The link is individualized and resolves to that person's record. Possession of the phone it was sent to is the authentication; there is no email verification in the path. It expires after 7–14 days and is consumed when the leader creates their account, not when they first tap it — a leader who opens the link and is interrupted can return to the same SMS rather than needing a re-issue.

Tapping through reveals the pairing first: who they have been matched with, and for which ministry. Only then does Discipler ask for anything. To accept, the leader sets a name and a password; the Accept button explains that a password is required to accept. The number Discipler will text is displayed, not requested — with a "not my number" link that notifies the admin rather than changing anything, so a forwarded link can never re-point a leader's account at a different phone.

The name a leader types is what appears on the web. A spelling that differs from intake is not an error and raises no flag.

Acceptance activates the relationship, releases the Starter Message to everyone in it, and records that this leader agreed to this relationship at this time.

Sessions are long-lived, on the order of a year. A leader whose session dies signs in with their phone number and password. One-time codes are a post-launch addition; until they ship, a lost password requires an admin reset.

## What the dashboard holds

The leader's list of the relationships they lead, and for each one three things and nothing else: the availability overlay, the material assigned to it, and the name and phone number of everyone in it. No message history, no analytics, no ability to edit anyone else's data.

Each relationship on the list shows its current status. A paused relationship stays on the list, visibly marked `Paused`, for the whole pause — pausing never removes, archives, ends, or hides it, and everyone in it stays where they are. Its weekly check-ins are suppressed until the leader replies `START` or an admin resumes it.

## The availability overlay

One grid per relationship, with **days of the week down the vertical axis and times of day across the horizontal axis**. Everyone's intake availability is drawn on the same grid so a leader can see where a meeting fits.

For a relationship with one participant, a slot is **green** where both the leader and the participant marked themselves available, and **yellow** where the participant is available but the leader did not mark that slot. Yellow is deliberately asymmetric: it shows a leader exactly where the other person can meet and they said they could not, which is where a leader may choose to move something.

For a relationship with several participants, each person carries their own color, so the leader can see at a glance which slots gather the most people.

Nothing on the grid schedules anything. Discipler highlights the slot with the greatest overlap that the leader also marked, but the leader chooses the time and sends the invitation themselves — including choosing a slot with better overlap that they did not originally mark. Where no slot works for everyone including the leader, the grid says so plainly rather than recommending a time the leader cannot attend.

Availability is a starting point for making first contact, not a standing record of anyone's schedule.

## Updating availability

Participants cannot change their own availability in V1 — there is no dashboard and no SMS path for it. An admin can send a participant a tokenized link that reopens their intake form prefilled, and that is the only route. Participant-editable availability is a later capability, deliberately out of V1.
