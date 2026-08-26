# 05 — Creating a relationship

**What to build:** An Admin pairs people three ways from the same workflow: accepting a suggestion, pairing any two eligible people manually from the Roster without using a suggestion, or selecting several people together to form one relationship. An unpaired Person carries a Pair action directly on their Roster row.

Creating a relationship does not activate it. It enters `Awaiting Leader Acceptance`, everyone in it leaves the suggestion pool, and Participants receive nothing at all — nothing reaches them before their Leader has agreed to lead them. The Roster shows who each Person is in a relationship with, and a relationship with several participants shows everyone in it.

This ticket introduces the core primitive: **one Leader and N Participants**. A relationship with one Participant is one-to-one; with more than one it is a group. There is no separate group entity, no participant-id column on the relationship, and no group-specific code path. Membership is a dated join — each Participant's involvement carries a start date and a nullable end date. Message copy branches on Participant count, never on a group-versus-one-to-one flag. Any design reintroducing that distinction is a regression.

Manual pairing may override the age band constraint. It may never override gender.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] An Admin can create a relationship from a suggestion, from two people on the Roster, or from several people selected together
- [ ] A created relationship is `Awaiting Leader Acceptance` and enqueues nothing to Participants
- [ ] Everyone in a created relationship leaves the suggestion pool
- [ ] The relationship is one Leader and N Participants with no separate group entity and no group code path
- [ ] Participant membership carries a start date and a nullable end date
- [ ] Manual pairing can cross the age band constraint and cannot cross the gender constraint
- [ ] The Roster shows every member of a relationship, not just one
