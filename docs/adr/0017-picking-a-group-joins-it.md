# Picking a Group Joins It

## Status

accepted

## Decision

**A Person who picks a group on the Ministry's group Intake link is in that group the moment they submit, unless the pastor has set that group to ask first.**
The switch is per group, off by default, and editable afterwards.
A group set to ask first raises a `group_join_requested` Follow-Up Item instead, and an Admin admits the Person or closes the request.

Three things follow from it and are decided with it.

**A group has a name.**
An Admin types it when forming the group and may change it afterwards.
It is what the link offers, and it is what the weekly check-in asks about: *did you meet with Tuesday Men's Group this week*.
That settles the question `docs/open-questions.md` had parked for the check-in's sake.
A one-to-one is not named; it is called by the two people in it, and a name typed for one is dropped.
A group formed before this decision has no name until an Admin gives it one, is offered on no link, and keeps listing its Participants in the weekly question.

**The Person who joins hears nothing about it by text.**
They are sent the Welcome Message on submitting, because it is the consent receipt and the A2P first contact, and it promises them nothing about a match.
What happened is said on the page they are looking at: that they are in, and who leads the group, by first name.
Nothing is sent to them on admission and nothing on decline.
Declining is a conversation the Admin has, and the Admin has the number.

**The group's Leader hears every time.**
A text naming the Person's first name and pointing at the Leader dashboard goes out on a self-join and on an admission alike, because the Leader was in neither conversation.
The Leader's Starter Message gains the same link.
No text to a Leader carries a number.
The numbers are on the dashboard, behind sign-in and behind each Person's contact-sharing decision.

## Context

`docs/product-flow.md` said *groups are always formed manually* and `docs/product-rules.md` said *the pastor can manually create groups by selecting multiple participants for a leader*.
Both were written when the only way into a group was an Admin's hand.
Ticket 29 gives a Person a way to name the group they want, and the question the ticket carried open was whether naming it should admit them.

The case for a request an Admin acts on is the product's own.
Pastoral judgment stays in the loop, and an unauthenticated form writing `relationship_member` puts a stranger in a group with nobody deciding.
The case against is that a Person who has chosen has chosen.
A queue every join waits in is friction for the ordinary case, a church small group whose leader is glad of anyone who turns up, to protect against the unusual one.

The resolution is the per-group switch.
The ordinary case costs nothing.
A pastor who wants to look first turns the switch on for that group, and a pastor who gets burned by an open group closes it without ending it.
The switch is not a safety binding.
Ticket 25's declared gender is, and it holds on a join exactly as it holds at formation, through the same trigger on the same insert.
So unlike `kind` and `declared_gender` the switch is not immutable.

## Consequences

- `docs/product-flow.md` and `docs/product-rules.md` no longer say groups are formed only by the pastor.
  They say a group is formed by the pastor and may be joined through the group link.
- `relationship.name` and `relationship.join_requires_approval` exist, and neither is a ministry event: a rename destroys no history.
  Who changed them is still recorded, as `relationship.group_configured`, so a Ministry can answer later who opened a door and when.
- A self-join is recorded as `relationship.participant_joined` with the Person as the actor, and an admission as `relationship.participant_admitted` with the Admin and the item.
  An audit tells the two apart by type.
- The first path that adds a Participant to a relationship after formation exists, so the database now holds a one-to-one to one open Participant (`one_to_one_one_open_participant`), a cap of the same kind as the two ADR-0004 named.
- The Care Needed view has no page yet.
  The item is raised into `follow_up_item` where that view will read it.
  Until then a panel of people waiting, with the two answers on it, sits beside the group link they asked through, and deciding whether that panel moves to Care Needed is that view's ticket rather than this one's.
- A Ministry with no named, accepted group has a link that says so and points at the discipleship form.
  That is every Ministry on day one.
- A group still needs at least one Participant when it is formed.
  An empty group for the link to fill is a decision about the invitation, the Starter Message and the weekly question, all of which name Participants, and is its own ticket.
