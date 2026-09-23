# A Removal Keeps the Person and Takes the Account

## Status

accepted

## Decision

**Removing somebody from the Roster writes a dated `person_removal` row and deletes nothing about the Person.**
They leave every live list, the database refuses to pair them, and the sending layer withholds anything addressed to them.
A new Intake from their number closes the row, and they come back as the same Person.

**Their account is deleted with them**, where no other Person or membership holds it, so a removed Discipler can no longer sign in (James, 2026-09-22).
Where another Ministry's Roster holds the same account (ADR-0009), only this Ministry's link and Leader access go.

**Their pairings go by the Unpair acts, in the same transaction.**
The route reads which act each pairing takes off the Roster, by the rule Unpair uses, and the service runs those commands and then `person.remove` inside one unit of work.

## Context

James asked for a way to remove somebody from a person's page, and answered four questions on a mock-up: history kept, pairings ended by the removal, Intake as the only way back, and everyone but Admins.
He added that a removed Discipler's account goes with them.

Deleting the Person would have been the simplest reading, and the wrong one here.
The project's rule is that stored history is the source of current state; a deleted Person takes their pairings' weeks, their endings and their answers with them, and every count built over those changes after the fact.

Deleting the account is the part that cannot be undone.
Banning it instead would keep a credential alive for somebody who is no longer part of the Ministry, and would need a way to lift the ban that nothing else in the product has.
A Discipler who comes back through Intake is Ready to Pair and gets an account the usual way, by accepting an invitation, so nothing is lost that the product cannot give back.

Running each Unpair act and then the removal as separate transactions would leave a half-removed Person when a pairing changed under the page.
One transaction means a removal happens whole or not at all, and each act still refuses for itself what the Roster could not see.

## Consequences

`public.roster` is not changed: the page documents filter removed people, because two unmerged branches recreate that function and whichever lands last would drop a filter written there.
The Roster's document says who is an Admin with the column under the row, so a later `public.roster` carrying `is_admin` itself becomes the one answer.

A number shared by somebody removed and somebody still on the Roster resolves an inbound text to the one still on it.
Where nobody on the Roster holds the number, a removed Person's `STOP` is still recorded against them.

The account deletion runs in `app.let_go_of_the_account`, a definer function, because the command connection holds no grant on `auth` and no delete on `ministry_member`, and should not.
