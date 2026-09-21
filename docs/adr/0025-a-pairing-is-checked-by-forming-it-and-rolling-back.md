# A Pairing Is Checked by Forming It and Rolling Back

## Status

accepted

## Decision

**Asking whether a relationship would be refused forms the relationship, in a transaction that never commits.**
`CommandService.checkPairing` runs the whole of what `execute` runs for a `relationship.create`: the same reads, the same boundary decision, the same writes, through one shared function.
It then leaves the transaction by throwing, and `EffectStore.transact` rolls back on any throw.
The answer is the `PairingRefusal` that formation would have thrown, or nothing where formation would have gone ahead.
No relationship, membership, invitation, history event or outbound message survives a check, whatever it answered.

**It is not the boundary's decision stopped before its effects.**
That is what ticket 03 of manual pairing (now in `.scratch/manual-pairing/issues/07-committed-already.md`) asked for, and what `.scratch/manual-pairing/spec.md` means by a set being "validated through the boundary", and it cannot work here.
Where either says the check cannot write, read: nothing a check writes is kept.
The boundary decides only the shape of the request: that there is a Discipler and a Disciple, that nobody is on both sides or listed twice, that a group is declared and named, that a Material chosen is on the Ministry's list.
Gender, Intake, opt-outs and the participation caps are triggers and indexes on `relationship_member`, and they answer only when a membership row is written.
A check that stopped before the write would pass a one-to-one across gender.

**Only `relationship.create` can be checked.**
This is not a dry run for commands in general.
The type admits one command and the service refuses any other at run time.

## Context

Manual pairing forms several one-to-ones from one submission.
There is no batch command: `CommandService.execute` takes one command, so N pairs is N transactions, and the set has to be judged before any of it is formed so that an Admin is never left with half of what they asked for because the third Disciple had not completed Intake.

Judging the set needs the pairing rules, and most of them are in the database on purpose.
ADR-0004 holds the participation caps in indexes because a rule enforced in the command boundary holds only until the first write path that forgets it.
The gender rule is in the database for the same reason, and the Intake and opt-out rules sit beside it as triggers on the same table.
The store translates a violated constraint into a `PairingRefusal` by its name, so an Admin is told the same thing whichever layer refused.

Two other ways to check a pairing were considered.

- **Run the boundary's decision and stop before the effects.**
  One copy of every rule, and no write of any kind.
  It sees seven of the eighteen refusals, and of the ones that protect people only that a group must declare what it is: not the match between two people, and not a declared group refusing somebody who is not of it.
  A set with a Disciple of another gender in it would pass the check and be refused partway through being formed, which is the outcome the check exists to prevent.
- **Mirror the database's rules in the boundary so a decide-only check can see them.**
  This is the option ADR-0004 rejected, arriving by a different door.
  Two copies of a safeguarding rule drift, and the copy that is wrong is the one an Admin is shown first.
  It would also need the boundary to be handed every person's gender, Intake and opt-out state and the Ministry's open memberships, read outside the statement that enforces them.

A third mechanism for the same design was also considered: a `rehearse` method on the `EffectStore` port that rolls back by contract.
It was declined because it is a second thing every store has to get right.
A throw is the one way out of `transact` that cannot commit, and that a throw lands nothing is already the promise every command depends on.

## Consequences

The check and formation cannot disagree about a rule, because there is one copy of each and both reach it by the same lines.
A rule added to the database later is seen by the check with no change to the check.

A check writes, briefly.
The rows exist inside its transaction and are visible to no other connection, but the locks are real: a concurrent pairing of the same Disciple waits on `participant_one_open_one_to_one` until the check rolls back, and a check that names a Material holds the advisory lock the Material list is read behind for as long as it runs.
That lock is keyed by the Ministry and is not the Material list's alone: editing the Discipleship Goals, the scheduled tick's read of who is still to accept, and an acceptance that spends a Material all wait behind it.
Each lasts as long as one formation does.
Because the locks are real, a check could deadlock with a real transaction wherever two real transactions could deadlock with each other, and Postgres ends a deadlock by killing one side with an error nothing translates.
The side it killed could be the real one, lost to a check that was only ever going to roll back.
Two such shapes existed, each was reproduced by a test before it was closed, and each is closed by everybody taking the same locks in the same order.

- **Two co-led groups naming the same two Disciplers in opposite orders.**
  Membership rows were written in the order a command named people, so each transaction held one entry in `leader_one_open_group` and waited for the other's.
  The store now writes a relationship's members in one fixed order, by Person id.
- **Forming or checking a pair that an open imported plan names, while that plan is being settled.**
  Settling locks the plan and then writes the Disciple's membership; forming wrote the membership and then closed the plan.
  A formation that will close plans now locks them before it writes a membership: the plan, then the membership, for everybody.
  This is the shape several one-to-ones under one Discipler can meet, since each of them may be a pair an import planned.

Anything that later takes two of these locks in one transaction takes them in that order: plans, then memberships by Person id.
A check costs what a formation costs, so judging a set of N is N transactions before the N that form it.
It also draws ids from the `IdSource` that are never used, which is harmless while ids are random.

**A check answers for the database as it stands, and a caller has to be ready to be refused after a check that passed.**
It sees nothing of what the rest of a set will do: two pairings of one Disciple each pass alone, and the second is refused when both are formed.
For several one-to-ones under one Discipler that is the only collision inside a set, since `leader_one_open_group` counts groups only and the other caps are per relationship, so a caller closes it by refusing a set that names a Disciple twice.
It sees nothing of what happens between the check and the formation either: another Admin pairing the same Disciple, somebody texting STOP, a Material being removed.
That gap is as wide as the set is long, and a caller reports honestly how many were formed and which were not.

Constraint triggers that are `initially deferred` fire at commit, so a check never reaches them.
None of them can refuse a pairing today: the one on `relationship_member` concerns a relationship that has ended, and a relationship being formed has not.
A deferred rule that could refuse a formation would make the check answer wrongly, and whoever adds one makes it immediate or teaches the check to run `set constraints all immediate` before it rolls back.

A store that swallowed the throw could not be trusted to have rolled back, so a check whose transaction returns normally fails loudly instead of answering that the pairing is fine.

An exception is the control flow.
That is unusual in this codebase and is deliberate: the sentinel is private to the service, carries nothing, and is caught by the one caller that threw it.
