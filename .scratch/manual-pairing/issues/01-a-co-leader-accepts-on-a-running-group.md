# 01 - A co-leader accepts on a group already running

**What to build:** What the Invitation Link's page shows, records and sends when the leader accepting was added to a group that has already started.
Today that acceptance activates the group a second time and sends the Starter Message again; after this ticket it records the co-leader's Acceptance and nothing else.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

**Old tickets:** this is old ticket 11, whole; none of it is committed.
What an unaccepted co-leader is given until they accept was decided by James and built at `69bbe9e`, and is in `06-committed-already.md`.
Here "old ticket NN" means a ticket of the earlier cuts, 01 to 27, kept under that number in `06-committed-already.md`, and existing code that says "Manual pairing, ticket NN" means those.
New code says "Manual pairing, recut ticket NN".

## Decided by James, 2026-09-20

The spec says a Discipler added to a group "gets an invitation link the same way a mentor does when first paired, and accepts on it; the group keeps running meanwhile".
It does not say what acceptance sends when the group is already running.
Until now every Acceptance either activated the relationship, which sends the Starter Message, or waited for another leader.
These three were asked of James and answered on 2026-09-20.

1. When a co-leader accepts on a running group, is anything sent to the Disciples?
   **Nothing.**
   The Starter Message went out at activation, and a second one would introduce a relationship they are already in.
2. Are the group's existing leaders told, and if so when?
   **Nothing is sent to them by the product, neither when the Admin adds the co-leader nor when the co-leader accepts.**
   If they are to be told, somebody tells them by hand, outside the product.
   This ticket builds no message, button or notice for it.
3. If the co-leader declines, or never answers, is a Follow-Up Item raised as it is for a leader invited at formation?
   **Yes, the same item**, since it is the same unanswered invitation.

## Acceptance

- [ ] Accepting records the Acceptance on that leader's membership, timestamped, and nothing else about the group's history changes.
- [ ] The relationship's activation moment is not restamped, and the Starter Message is not sent again.
- [ ] Accepting on a running group sends nothing to the Disciples and nothing to the group's existing leaders.
  Adding the co-leader sends the existing leaders nothing either; the only message is the co-leader's own invitation.
- [ ] The invitation page shows who they would be leading and who they would be leading with, before they accept.
- [ ] From acceptance on, the co-leader is treated as a group formed with two leaders already treats its second leader.
  This ticket designs nothing new for check-ins or care signals.
- [ ] A group that was still awaiting its first leader activates only when both have accepted, and sends one Starter Message.
- [ ] Declining, and an invitation nobody answers, raise the same Follow-Up Item as they do for a leader invited at formation.
- [ ] Integration tests cover: acceptance on a running group, on a paused group, on a group still awaiting its first leader (in both orders), a declined invitation, and that no message goes to a Disciple or to an existing leader in any of them.

## Comments

### Found while building old ticket 22's second stage

Written by its implementer on 2026-09-20, and kept whole in `06-committed-already.md`.
The first is why ticket 04's **Add as co-leader** button waits for this ticket.

- **Accepting on a running group re-activates it.** `relationship.accept` decides `activatesRelationship` as *every other leader has accepted*, which is true for a co-leader on a running group. It would append a second `relationship.activated`, open a second Material period, and send the Starter Message to every leader and every Disciple again. The database only guards the column. Old ticket 11's first two criteria are exactly this; it is said here because it is a text to real phones, and because old ticket 26 waits on 22, 24 and 25 but not on 11.
- **The five-day item now raises for them**, which James answered yes to on 2026-09-20. Its usual answer, **Cancel**, is refused on a running group (`relationship.already_accepted`), so there is no way to withdraw an unanswered co-leader invitation short of ending the group. *Cancelling behaves as it does for a leader invited at formation* is true and tested for a group still awaiting its leader, where cancelling takes their membership with it; on a running group there was never anything to cancel at formation either.
