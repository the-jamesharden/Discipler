# 03 - Assigning a Material

**What to build:** The assign row at the foot of every card on S-2 and S-3, the Material field on the groups card of Intake forms in S-6, and the Material's title beneath each group on the group form's step three in S-7, all in `.lavish/materials/design.html`.
Behind them: `relationship.assign_material` gains a nullable Material and a route from each of the two cards, `app.assign_material` learns to un-assign, and `groups_open_to_join()` carries the title.

**Blocked by:** 02

**Status:** ready-for-agent

## Acceptance

- `app.assign_material` accepts a null Material once the history is open, closing the running period and opening a no-material one at the same instant, and answers a new refusal `material_already_running` when the target equals the running period's Material; the opening-period rule in `app.reject_broken_material_history` is untouched and every ticket 14 test still passes.
- The command `relationship.assign_material` takes `materialId: MaterialId | null`; the store translates the new refusal; the domain names it.
- Every assignment starts at the clock's now; no start date is accepted from a form.
- The assign row on a Material's folder card is a form with a dropdown of every live Material plus "No material", pre-selected on the current one, and Save; on the no-material folder the dropdown opens on "Choose a material…" with Assign; the row is pinned to the bottom of the card whatever the card's text above it.
- The leader name on a card is the only link on it, to the Follow-Up item where one exists.
- The groups card on Intake forms gains the Material dropdown after the approval checkbox on an accepted group, saved in the same press as the name and the toggle, with the hint and the "Working through it since <date>" line; an unaccepted group's card shows the label and the sentence naming the leader instead, and no dropdown.
- `groups_open_to_join(uuid)` gains `material_title text`; the group option on step three shows "Working through <title>" as its description line, and nothing when the group has none.
- `intake_forms_page()` gains the live Materials and the running period per group; the change is additive within one migration.
- Over-HTTP: assign from a card, swap, un-assign, assign from the groups card, refuse an unaccepted group, the Leader dashboard shows the change, the group form shows the title and drops it after an un-assign.
- `docs/product-rules.md` V1 Scope gains a supersession line dated with the merge saying the material assignment interface shipped and pilot support no longer configures assignments by hand.

## Comments
