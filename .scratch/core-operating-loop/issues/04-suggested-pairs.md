# 04 — Suggested Pairs

**What to build:** An Admin opens Suggested Pairs and sees proposed one-to-one matches instead of comparing everyone's availability by hand. Each is labelled Excellent fit, Good fit, or Recommended, and each states its reason in one plain sentence the Admin could read aloud to anyone — "Four shared time slots. You both selected Career and calling." No numeric score appears anywhere. People who share no availability with any eligible Leader appear in a separate No Schedule Overlap section, visible but never presented as a fit.

Ranking is a pure function: eligible Roster and Ministry constraint configuration in, tiered and ordered Suggested Pairs plus the No Schedule Overlap set out. No I/O and no clock beyond a supplied "now" for tie-breaking.

**Tiers are counts of shared cells, and nothing else.** The grid is seven days by five
blocks, so an overlap is a count out of thirty-five. Excellent fit is four or more
shared cells spanning at least two distinct days; Good fit is two or three; Recommended
is exactly one; zero puts the Person in the No Schedule Overlap section. The
two-distinct-days requirement is what stops four blocks on one Saturday — most of that
Saturday, not four separate chances to meet — from reading as strongly as four cells
across a week.

Constraints filter before anything is ranked and never appear as a reason. Gender must match and is absolute — a Ministry wanting mixed-gender relationships disables the rule deliberately in settings. The age band constraint excludes a Participant more than one band above the Leader and governs suggestion only. Ranking is availability overlap first, Discipleship Goal separating comparable overlaps, ties broken by longest wait since Intake. Because the two constraints differ in whether they can be overridden, they need visibly different treatment in the settings UI; presenting them as a uniform list of toggles would misrepresent one of them.

Implements `docs/adr/0001-pairing-suggestion-inputs.md`. The reason string is a permanent constraint, not a UI preference — enforce it in the type system if possible, so a suggestion without a reason cannot be constructed.

Two independent pools feed the scorer. The **leader pool** is everyone marked eligible to lead who has completed Intake, given consent, and not opted out, filtered by the kind of relationship being suggested — a leader already holding an open group is out of the pool for group suggestions and still in it for one-to-ones. The **participant pool** is everyone with intake, consent, and no opt-out, ranked so that people holding no open participant membership come first. Both pools require Intake; they differ only in the eligibility flag and the caps. The pools are never deduplicated against each other: the same person appearing as a leader in one suggestion and a participant in another is the discipleship-multiplication case working correctly, not a bug to be tidied away.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Ranking is a pure function, tested directly, with a case for every rule in ADR-0001 including the negative ones
- [ ] Gender mismatch is filtered before ranking and is not overridable
- [ ] The age band rule filters suggestions only
- [ ] Excellent fit requires four or more shared cells spanning at least two distinct days
- [ ] Four shared cells all falling on one day is Good fit, not Excellent fit
- [ ] Good fit is two or three shared cells, Recommended is exactly one, and zero is No Schedule Overlap
- [ ] Tiers are assigned as specified and no numeric score is ever emitted
- [ ] `suggest_gender_match` and `suggest_max_age_band_gap` are read from Ministry settings, not from constants
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

### Amended — tier cutoffs are locked

*Meaningful overlap* was never defined, so nothing said where Excellent fit stopped and
Good fit began. It is now a count out of the thirty-five cells the grid
has: 4+ across 2+ days, 2–3, exactly 1, zero. Recorded in `docs/product-rules.md` under
*Settled: Suggestion Tiers Are Counts of Shared Cells*.

**This conflicts with ADR-0001 and the conflict is open.** ADR-0001 defines Excellent
fit as meaningful overlap *plus a matching Discipleship Goal*, and Good fit as
meaningful overlap *with differing goals*. Under the locked cutoffs the Goal does not
determine the tier. Whether the Goal now orders candidates within a tier, or still
gates Excellent, is unresolved and blocks this ticket's tier tests. See
`docs/open-questions.md`.

The two constraints are now Ministry settings — `suggest_gender_match` and
`suggest_max_age_band_gap` — built by ticket 22. The age constraint moves from
*fixed at ten years for V1* to a configurable band gap, which is the unit it was
already evaluated in.

### Settled — the Goal is a tiebreaker, and the age constraint has a direction

**The ADR conflict above is closed.** The Discipleship Goal orders candidates *within*
a tier and never gates one. Tiers stay counts of shared cells exactly as written. Every
tier case still needs a goal-matching and a goal-differing variant, and under this
reading they assert the *same tier* and a *different order*.

Gating was the reading that contradicted ADR-0001 rather than the one that departed
from it: capping six cells across four days at Good fit because the goals differ is the
Goal outranking availability, which the ADR forbids outright.

The reason sentence follows: *"Four shared time slots. You both selected Career and
calling."* where goals match, *"Four shared time slots."* alone where they differ. The
card never names a mismatch.

**The age band constraint is directional**, and the ticket text above ("excludes a
Participant more than one band above the Leader") was already right — it was being read
as symmetric. `suggest_max_age_band_gap` means *the number of age bands a Participant
may be above their Leader*, default `1`, no limit below.

- [ ] Goal-matching and goal-differing pairs at the same cell count land in the same tier, and the goal-matching one ranks above
- [ ] The reason sentence names the goal only when it matches, and never names a mismatch
- [ ] A 25–34 Leader with a 35–44 Participant is suggested at the default gap of `1`
- [ ] A 65+ Leader with an 18–24 Participant is suggested, proving the constraint is one-directional
- [ ] `suggest_max_age_band_gap` of `0` excludes any Participant in a band above their Leader

### Carried over from ticket 25 — suggestions filter on the declared gender too

Ticket 25 gave `relationship` an immutable `declared_gender`, so *gender must match* is
now two rules and the scorer has to know about both. Ticket 25 could not build this half:
there is no scorer yet, and it left the criterion here rather than holding itself open.

- The one-to-one rule is unchanged — the two people in a suggested pair must be of the
  same gender, subject to `suggest_gender_match` as this ticket already says.
- **A suggestion into an existing group that declared a gender may only offer people of
  it**, whatever `suggest_gender_match` says. A declaration is a statement an Admin made
  about one relationship on purpose, and the Ministry-wide setting does not disable it.
  This is the rule ticket 25's checkbox meant by *suggestions filter on the same rule
  they are ranked under*.
- The filter is not overridable and never appears as a reason, exactly like its sibling.

- [ ] A suggestion into a group that declared a gender offers only people of that gender
- [ ] It does so even where `suggest_gender_match` is off, because a declaration is not
      that setting's to disable
