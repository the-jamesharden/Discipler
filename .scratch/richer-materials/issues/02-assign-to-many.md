# 02 - Assign one Material to many relationships

**What to build:** **Assign to more** on a Material's folder, the page at `/materials/<id>/assign`, and `material.assign_to_relationships`, as `spec.md` *Assigning to many at once* describes and M-3 of `.lavish/richer-materials/mockup.html` draws.

**Blocked by:** nothing

**Status:** ready-for-agent

## Acceptance

- [ ] The page lists every live, accepted relationship not already on the Material, those on no Material first, then grouped by their Material in title order, each with a checkbox, the Men's / Women's filter carried as `?gender=`, and "Select all shown".
- [ ] The button reads "Assign <title> to N relationships" and counts the ticks; with none ticked it is disabled, and the route refuses an empty list.
- [ ] `material.assign_to_relationships { ministryId, materialId, relationshipIds, assignedBy }` runs `app.assign_material` for each in one transaction; any refusal refuses the lot and the page names the relationship and the reason.
- [ ] Each assignment writes its own `relationship.material_assigned` event, exactly as one Save does, so history reads the same whichever way it was assigned.
- [ ] The page is one read, through a page function answering for the session first (ADR-0023), and `every-page-function-answers.test.ts` picks it up.
- [ ] Over HTTP: assign three at once, refuse the lot when one ended between load and press, and the folder shows the new count.
