# 19 — Ministry isolation extended to relationships and Leaders

**What to build:** A Leader reaches the relationships they lead and nothing else — enforced in the database, the way Ministry isolation already is, rather than by the application remembering to filter.

Ticket 01 established that no Ministry may read another's data. It left a second boundary unenforced: within a Ministry, `person_read_own_ministry` grants every member — including `tier = 'leader'` — SELECT on every Person on the Roster. Ticket 06 promises a Leader sees only their own relationships, and today that promise is held by application code alone. This ticket moves it into row-level security, where the first one already lives.

Leader-facing policies key off **membership, not tier**. The calling user's Person is `person.user_id = auth.uid()` within the current Ministry, and a Leader reaches a relationship where that Person holds an open leader membership on it. An Admin keeps ministry-wide read through the existing tier-based policies, so an Admin who also leads passes both sets in one session, from one `ministry_member` row that says `admin`.

Being discipled grants nothing. A Person with an account who is a Participant in someone else's relationship reads none of that relationship's data — not the other Participants, not their check-in answers — and being a Leader elsewhere does not change that by a single row.

The relationship table also needs the invariant that row-level security cannot express: every member's `person.ministry_id` must equal the relationship's. Writes arrive through `discipler_command` on a trusted connection, so this is a trigger, not a policy.

**Blocked by:** 05, 18

**Status:** ready-for-agent

- [x] Leader-facing policies are expressed through open leader membership and never through `ministry_member.tier`
- [x] `person_read_own_ministry` no longer grants a Leader the whole Roster
- [x] An Admin who leads two relationships passes the Admin policies and the Leader policies in one session
- [x] A Participant with an account cannot read the other Participants' data in the relationship where they are a Participant
- [x] Holding a Leader membership elsewhere grants nothing in a relationship where the Person is a Participant
- [x] A leader membership in one Ministry grants nothing in another
- [x] A membership whose Person belongs to a different Ministry than the relationship is rejected by the database
- [x] Every policy changed is recorded with its before and after

## Comments

### Implemented — leader-scoped access

Implemented in `supabase/migrations/20260826000100_relationships_roles_and_leader_access.sql`.

**Policies changed.**

| Policy | Before | After |
| --- | --- | --- |
| `person_read_own_ministry` | `app.is_member_of(ministry_id)` | dropped, replaced by the three below |
| `person_read_own_ministry_admin` | — | `app.is_admin_of(ministry_id)` |
| `person_read_self` | — | `user_id = auth.uid()` |
| `person_read_led` | — | `app.leads_person(id)` |
| `ministry_event_read_own_ministry` | `app.is_member_of(ministry_id)` | `app.is_admin_of(ministry_id)` |
| `outbound_message_read_own_ministry` | `app.is_member_of(ministry_id)` | `app.is_admin_of(ministry_id)` |
| `relationship_read_own_ministry` | — | `app.is_admin_of(ministry_id) or app.leads_relationship(id)` |
| `relationship_member_read_own_ministry` | — | `app.is_admin_of(ministry_id) or app.leads_relationship(relationship_id)` |
| `relationship_command`, `relationship_member_command` | — | `ministry_id = app.command_ministry_id()` |

`ministry_read_own` and `ministry_member_read_own` are unchanged: both tiers may see
which Ministry they belong to, and the Leader Dashboard needs to name it.

**Three leaks closed, not one.** The Roster was the one this ticket was written for.
`ministry_event` and `outbound_message` carried the same `is_member_of` predicate, so
a Leader could read the Ministry's entire append-only history and its whole outbound
queue -- every message sent to every Participant, including the Concern text of
relationships they have nothing to do with. That is a worse leak than the Roster and
it was hiding behind the same helper.

**The Ministry check is declared, not triggered.** `relationship_member` carries its
own `ministry_id` and reaches its relationship and its Person through composite
foreign keys, so a membership whose Person belongs to another Ministry is rejected by
the key rather than by a trigger someone can later forget to fire. It also means the
table is discovered by `rls-coverage.test.ts`, which finds ministry-owned tables by
looking for the column -- a membership table without one would have escaped the audit
silently.

**Settled: the invariant applies to a non-Admin.** A Participant with an account
must not read the other Participants' data in the relationship discipling them --
tested for a Leader-tier account (`Mo`). An Admin reads it, as an Admin. That is the
feature and not an exception: the Admin is the pastor, and routing check-in content
into pastoral view is why check-ins exist. Recorded in `docs/product-rules.md` under
*Roles Are Relationship Memberships*; not to be re-raised as a leak.

20 new tests, 85 passing overall against a local Supabase stack, none skipped.
