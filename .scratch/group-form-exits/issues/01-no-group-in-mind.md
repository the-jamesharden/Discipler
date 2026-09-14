# 01 - No group in mind

**What to build:** The dashed last option on the group form's step three, the `group_placement_wanted` Follow-Up kind it raises, the item as S-8 of `.lavish/materials/design.html` draws it, and the `relationship.place` act that closes it by putting the Person in a group the Admin names.

**Blocked by:** nothing

**Status:** ready-for-agent

## Acceptance

- Step three offers "I don't have a group in mind" as the last option in the same radio group, dashed, with the line "We'll let <Ministry> know you'd like to be placed in one."; choosing it and continuing reaches the contact step and the done page says the Ministry has been told, not that a group was joined.
- The intake boundary accepts `none` on the group path and records the submission with a null group; an empty field still raises `intake.group_not_selected`.
- Migration: the kind is added to the Follow-Up kind constraint and to the payload check; the one-open-item index already holds one item per Person and the migration proves it with a test.
- The item shows the tag "Wants a group", the Person's name, the line drawn from their Intake, a dropdown of the groups open to them (accepted, named, unended, open to their declared gender, mixed always) with "Place in this group", and Resolve.
- `relationship.place` writes the membership row, appends the ministry event, closes the item in the same transaction, runs the gender trigger at the insert, and refuses a group not open to the Person, a group not accepted or ended, a Person already in it, and a Person with no consent on file; `relationship.admit` is unchanged.
- The Follow-Up badge counts the new item on every tab.
- Domain, integration and over-HTTP tests as the spec lists them.
- `docs/product-flow.md` and the Care Needed rules doc name the kind and the act; `CONTEXT.md` gains "Group placement".

## Comments
