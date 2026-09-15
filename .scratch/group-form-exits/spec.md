# Spec: The group form's two exits

Status: ready-for-agent

Raised by James on 2026-09-13 during the Materials grill and approved in Lavish the same day as S-7 and S-8 of `.lavish/materials/design.html`.
Its own effort because neither exit carries a Material and both ship without waiting on any Materials ticket.

## Problem Statement

The group form's step three asks which group the Person would like to join and offers nothing else.
Somebody who found no group that fits has no honest answer, and somebody who meant the discipleship form has to leave, find the other link, and retype what they already answered.
The form points to the discipleship form only when the Ministry has no group to offer at all.

## Solution

Two additions to step three, drawn in S-7.

1. A last option in the same radio group, dashed, reading "I don't have a group in mind" with the line "We'll let <Ministry> know you'd like to be placed in one."
   Choosing it and continuing lands the Person on the Roster with the group path recorded and no group named, and raises a Follow-Up item of a new kind carrying the Person.
2. A line under the form's actions: "Looking for one-to-one discipleship instead? I meant to sign up for mentorship."
   It links to the discipleship wizard's first question with age, gender and availability carried in the query string, so those steps are already answered there.

## Settled at the grill

- The "no group" answer is an option in the list rather than a separate button, so the step still has one submit and works with no script. Confirmed in the Lavish callout on S-7.
- The person who chose it lands on the Roster and an item is raised, because a decision waiting on the Admin must not scroll out of view. They do not simply appear on the Roster with nothing raised, and they are not folded into the mentorship path.
- The switch runs one way only, from the group link to the discipleship wizard. The reverse waits until somebody asks for it.
- The item is closed by placing the Person in a group or by resolving it alone.

## The Follow-Up kind

`group_placement_wanted`, the eighth kind in `FOLLOW_UP_KINDS`, carrying the Person and nothing else, named for the condition like the seven before it.
It never clears itself.
The database check constraint on which kinds carry a payload is extended for it.
Its tag reads "Wants a group"; its line reads "Signed up on the group link on <date> with no group in mind. <Gender>, <age band>, available <days and parts>." drawn from the Person's Intake.
Its actions, drawn in S-8: a dropdown of the groups open to the Person (accepted, named, unended, and open to their declared gender, mixed groups always, exactly the list the group form offers them) with a button "Place in this group", and Resolve.
The one-open-item index already holds one such item per Person.

## The new Admin act

`relationship.place { ministryId, relationshipId, personId, followUpItemId, placedBy }`.
It generalises `relationship.admit`: the same membership row, the same ministry event shape, the same gender trigger at the insert, and it closes the item it came from in the same transaction.
Refusals: the group is not open to the Person's gender, the group is not accepted or has ended, the Person already belongs to it, the Person has no consent on file.
`relationship.admit` stays as it is; the two differ in where the group was chosen and both are recorded as what they were.

## The switch

The group wizard's step three renders the line with a link to the discipleship wizard's route carrying the query the wizard machine builds from the answers already given: age band, gender and availability.
The discipleship wizard already reads its answers from the query and opens on its first unanswered question, so it opens on the mentor-or-mentee choice and skips the three carried steps.
Nothing is written by following the link.
`via` travels with the query as it does between steps, so the submission still records how the Person reached the form.

## Intake changes

The group path accepts the `none` answer: `intake.group_not_selected` is raised only when the field is empty, and `none` is a valid value that records the submission with a null group.
The done page for this answer says the Ministry has been told and will be in touch about a group, and does not say a group was joined.
Nothing before step three changes.

## Tests

- Domain: the new kind, its payload, the placement refusals, the intake boundary accepting `none`.
- Integration: the item is raised once per Person, placing closes it and writes the membership, resolving closes it without one, the item lists only groups open to the Person.
- Over-HTTP: choose "no group" through to the done page and find the item on Follow-Up; place the Person and see them on the Roster in the group; follow the switch from step three and land on the discipleship wizard's first question with the later steps pre-answered.

## Acceptance

- Both additions appear on step three exactly as S-7 draws them and only there.
- Care Needed shows the new item as S-8 draws it, and the Follow-Up badge counts it.
- `docs/product-flow.md` and the Care Needed rules doc name the new kind and the placement act.
- `CONTEXT.md` gains "Group placement" as a glossary entry pointing at the kind and the act.

## Deploy order

The migration adding the kind and the constraint change is pushed before the code merges, as every migration is.
