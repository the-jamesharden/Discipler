# 03 - A pairing checked without being formed

**Effort:** `manual-pairing`.
Every ticket number on this page means a file in `.scratch/manual-pairing/issues/`, and the spec is `.scratch/manual-pairing/spec.md`.
A bare "ticket NN" in existing code, migrations or `CONTEXT.md` (ticket 29, ticket 36) belongs to `core-operating-loop`, which has its own 01 to 36, and is not one of these.
In code and migrations written for this ticket, say "Manual pairing, ticket NN", as tickets 01 and 02 did.

**What to build:** A way to ask the domain whether forming a relationship would be refused, that cannot write.
Nothing an Admin can see changes.
This is the prefactor that lets ticket 04 promise all or nothing across several one-to-ones without keeping a second copy of the pairing rules.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

**Budget:** ~130k of 250k tokens (reads 45, writes 25, test runs 20, gate 30, overhead 10).
If the session passes 200k before the gate, stop and say so on this ticket rather than pressing on.

## Why

The spec's rule: there is no batch command, `CommandService.execute` takes one command, so N × 1:1 pairs is N transactions, and the set is validated through the boundary before any is formed.
A route that re-implemented the gender rule or the Intake rule to pre-check a set would be the fence break ADR-0004 exists to stop.
So the check has to be the same decision formation makes, stopped before its effects are applied.

## Acceptance

- [ ] The command service can be asked to check a `relationship.create` command, and answers with the same `PairingRefusal` formation would have thrown, or with nothing when formation would have gone ahead.
- [ ] The check runs the same boundary decision formation runs, against the same context, read the same way.
  There is one copy of every pairing rule after this ticket, as there was before it.
- [ ] The check cannot write: no relationship, membership, invitation, history event or outbound message exists after it, whatever it answered.
  A test proves this against the database and not only against a fake store.
- [ ] Checking and then forming the same command gives the same answer both times, for a command that passes and for each refusal the pairing suites already cover (gender, Intake not completed, opted out, a Material the Ministry does not hold, an unnamed group, an undeclared group).
- [ ] Only `relationship.create` can be checked.
  This is not a general dry-run for every command, and nothing else gains one here.
- [ ] Formation itself is untouched: the existing pairing suites pass without edits.

## Notes for whoever picks this up

Rules that live only in the database (the partial unique indexes, the two gender triggers) are enforced on write and the check will not see them unless the boundary already mirrors them.
List on this ticket any refusal the database can raise that the check cannot predict.
Ticket 04 has to report those honestly when they happen partway through a set, and needs the list.
