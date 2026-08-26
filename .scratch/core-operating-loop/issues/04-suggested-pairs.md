# 04 — Suggested Pairs

**What to build:** An Admin opens Suggested Pairs and sees proposed one-to-one matches instead of comparing everyone's availability by hand. Each is labelled Excellent fit, Good fit, or Recommended, and each states its reason in one plain sentence the Admin could read aloud to anyone — "Four shared time slots. You both selected Career and calling." No numeric score appears anywhere. People who share no availability with any eligible Leader appear in a separate No Schedule Overlap section, visible but never presented as a fit.

Ranking is a pure function: eligible Roster and Ministry constraint configuration in, tiered and ordered Suggested Pairs plus the No Schedule Overlap set out. No I/O and no clock beyond a supplied "now" for tie-breaking.

Constraints filter before anything is ranked and never appear as a reason. Gender must match and is absolute — a Ministry wanting mixed-gender relationships disables the rule deliberately in settings. The age band constraint excludes a Participant more than one band above the Leader and governs suggestion only. Ranking is availability overlap first, Discipleship Goal separating comparable overlaps, ties broken by longest wait since Intake. Because the two constraints differ in whether they can be overridden, they need visibly different treatment in the settings UI; presenting them as a uniform list of toggles would misrepresent one of them.

Implements `docs/adr/0001-pairing-suggestion-inputs.md`. The reason string is a permanent constraint, not a UI preference — enforce it in the type system if possible, so a suggestion without a reason cannot be constructed.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Ranking is a pure function, tested directly, with a case for every rule in ADR-0001 including the negative ones
- [ ] Gender mismatch is filtered before ranking and is not overridable
- [ ] The age band rule filters suggestions only
- [ ] Tiers are assigned as specified and no numeric score is ever emitted
- [ ] Ties are broken by longest wait since Intake, and ordering is stable between visits
- [ ] Every suggestion carries a one-sentence reason; a suggestion without one is unconstructible
- [ ] The No Schedule Overlap set is returned separately and never presented as a fit
- [ ] Suggestions recalculate as soon as pairing changes who is available
- [ ] The settings UI distinguishes the absolute constraint from the overridable one
