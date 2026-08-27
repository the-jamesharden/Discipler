# 04 — Suggested Pairs

**What to build:** An Admin opens Suggested Pairs and sees proposed one-to-one matches instead of comparing everyone's availability by hand. Each is labelled Excellent fit, Good fit, or Recommended, and each states its reason in one plain sentence the Admin could read aloud to anyone — "Four shared time slots. You both selected Career and calling." No numeric score appears anywhere. People who share no availability with any eligible Leader appear in a separate No Schedule Overlap section, visible but never presented as a fit.

Ranking is a pure function: eligible Roster and Ministry constraint configuration in, tiered and ordered Suggested Pairs plus the No Schedule Overlap set out. No I/O and no clock beyond a supplied "now" for tie-breaking.

Constraints filter before anything is ranked and never appear as a reason. Gender must match and is absolute — a Ministry wanting mixed-gender relationships disables the rule deliberately in settings. The age band constraint excludes a Participant more than one band above the Leader and governs suggestion only. Ranking is availability overlap first, Discipleship Goal separating comparable overlaps, ties broken by longest wait since Intake. Because the two constraints differ in whether they can be overridden, they need visibly different treatment in the settings UI; presenting them as a uniform list of toggles would misrepresent one of them.

Implements `docs/adr/0001-pairing-suggestion-inputs.md`. The reason string is a permanent constraint, not a UI preference — enforce it in the type system if possible, so a suggestion without a reason cannot be constructed.

Two independent pools feed the scorer. The **leader pool** is everyone marked eligible to lead who has completed Intake, given consent, and not opted out, filtered by the kind of relationship being suggested — a leader already holding an open group is out of the pool for group suggestions and still in it for one-to-ones. The **participant pool** is everyone with intake, consent, and no opt-out, ranked so that people holding no open participant membership come first. Both pools require Intake; they differ only in the eligibility flag and the caps. The pools are never deduplicated against each other: the same person appearing as a leader in one suggestion and a participant in another is the discipleship-multiplication case working correctly, not a bug to be tidied away.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Ranking is a pure function, tested directly, with a case for every rule in ADR-0001 including the negative ones
- [ ] Gender mismatch is filtered before ranking and is not overridable
- [ ] The age band rule filters suggestions only
- [ ] Tiers are assigned as specified and no numeric score is ever emitted
- [ ] Ties are broken by longest wait since Intake, and ordering is stable between visits
- [ ] Every suggestion carries a one-sentence reason; a suggestion without one is unconstructible
- [ ] The No Schedule Overlap set is returned separately and never presented as a fit
- [ ] The leader pool is everyone eligible to lead who has completed Intake, given consent, and not opted out, filtered by the kind being suggested, with no cap on relationships already held
- [ ] The participant pool is intake plus consent plus not opted out, ranked zero open participant memberships first
- [ ] A person may appear as leader in one suggestion and participant in another in the same batch, and the pools are not deduplicated against each other
- [ ] No suggestion pairs a person with themselves
- [ ] No suggestion offers B as a participant under A while A is an open participant under B
- [ ] Suggestions recalculate as soon as pairing changes who is available
- [ ] The settings UI distinguishes the absolute constraint from the overridable one

## Comments

### Amended — dual-role persons

The old pool — *currently eligible, unpaired mentors and mentees* — collapsed two
different facts into one and silently excluded every leader from being discipled.
Two pools replace it. The direct-cycle exclusion is scorer-level only; it is
deliberately not a database constraint, because an admin who wants to pair two
people into each other's care may have a reason the product does not know.

### Amended — the leader pool requires Intake

The leader pool was written as *everyone marked eligible to lead* and nothing more,
which put a Person who had never completed Intake, or who had opted out, into
suggestions the Admin could act on. Pairing requires completed Intake on both sides
of a relationship, so the leader pool carries the same Intake, consent and opt-out
test the participant pool does.

Eligibility to lead is unchanged and still a plan an Admin may record early -- see
ticket 16, *eligibility does not make a Person pairable and does not substitute for
Intake*. It is now a filter the pool applies alongside Intake rather than instead of
it. Ticket 02's review pass enforces the same rule in the database
(`reject_unready_leader`), so a suggestion that ignored this would be refused at the
membership insert anyway; the pool should not be offering it in the first place.
