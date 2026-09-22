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

**Status:** shipped

- [x] Ranking is a pure function, tested directly, with a case for every rule in ADR-0001 including the negative ones
- [x] Gender mismatch is filtered before ranking and is not overridable
- [x] The age band rule filters suggestions only
- [x] Excellent fit requires four or more shared cells spanning at least two distinct days
- [x] Four shared cells all falling on one day is Good fit, not Excellent fit
- [x] Good fit is two or three shared cells, Recommended is exactly one, and zero is No Schedule Overlap
- [x] Tiers are assigned as specified and no numeric score is ever emitted
- [x] `suggest_gender_match` and `suggest_max_age_band_gap` are read from Ministry settings, not from constants
- [x] Ties are broken by longest wait since Intake, and ordering is stable between visits
- [x] Every suggestion carries a one-sentence reason; a suggestion without one is unconstructible
- [x] The No Schedule Overlap set is returned separately and never presented as a fit
- [x] The leader pool is everyone eligible to lead who has completed Intake, given consent, and not opted out, filtered by the kind being suggested, with no cap on relationships already held
- [x] The participant pool is intake plus consent plus not opted out, ranked zero open participant memberships first
- [x] A person may appear as leader in one suggestion and participant in another in the same batch, and the pools are not deduplicated against each other
- [x] No suggestion pairs a person with themselves
- [x] No suggestion offers B as a participant under A while A is an open participant under B
- [x] Suggestions recalculate as soon as pairing changes who is available
- [x] The settings UI distinguishes the absolute constraint from the overridable one

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

- [x] Goal-matching and goal-differing pairs at the same cell count land in the same tier, and the goal-matching one ranks above
- [x] The reason sentence names the goal only when it matches, and never names a mismatch
- [x] A 25–34 Leader with a 35–44 Participant is suggested at the default gap of `1`
- [x] A 65+ Leader with an 18–24 Participant is suggested, proving the constraint is one-directional
- [x] `suggest_max_age_band_gap` of `0` excludes any Participant in a band above their Leader

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

- [x] A suggestion into a group that declared a gender offers only people of that gender
- [x] It does so even where `suggest_gender_match` is off, because a declaration is not
      that setting's to disable

**2026-09-07, ticket 36.** The eligibility flag this ticket's leader pool reads is gone. The pool is now everyone who leads an open relationship or whose Intake answer was the mentor side, with Intake, consent and no opt-out as before. An intended pairing (ADR-0022) is not a suggestion and is not fed to the scorer.

**2026-09-17, suggestions beyond the one-to-one.** This ticket is still the only place suggestions are specified, and it specifies one-to-ones. A toggle between Group, 1:2 pair and 1:1 is now wanted on the tab, with a person's own answer deciding which kinds they are offered for. See `.scratch/suggestions-beyond-the-one-to-one/`. Two consequences for whoever builds this ticket: the pool filter this ticket already describes as "filtered by the kind of relationship being suggested" is the seam the toggle hangs on, so build it as a parameter rather than as a one-to-one assumption; and ADR-0001's "exactly four inputs" is about to become five, the fifth being a constraint on the 1:2 pool alone. Four questions that ticket flags are unanswered and may rule the Group segment out by construction, chiefly whether a group suggestion can state its reason in one plain sentence.

**2026-09-18, suggestions beyond the one-to-one, decided.** The note above said ADR-0001's "exactly four inputs" was about to become five. It is not. James decided the 1:2 answer does not bind: it filters nobody and ranks nobody, is shown beside a name on the suggestion card as `first_time` is on manual pairing, and so is not a suggestion input. ADR-0001 stands as written. The toggle is confirmed as Group, 1:2 and 1:1 suggestions, and building the kind filter as a parameter still holds.

### Built - 2026-09-22

Built on `integration/manual-pairing`.
Every criterion above is ticked.
Status is `claimed` rather than `shipped` because nothing here is on `main` yet, and the migration has not been pushed to production.

What landed:

- `src/domain/suggestions.ts`, the pure ranking, with `tests/domain/suggested-pairs.test.ts` holding a case for every rule, including the negative ones.
- `public.suggestion_inputs(ministry)` and a new `suggested_pairs_page()` in `supabase/migrations/20261007000100_suggested_pairs.sql`.
  The page is the Roster's document plus the two settings plus each Person's latest Intake (age band, Goal, availability, when it was given, and the current decision on texts).
  The function is a definer with the Admin test inside, like `roster()`, because the consent rule is `app.current_consent` and that is not granted to `authenticated`.
- `src/platform/supabase/suggested-pairs-reader.ts` and a `SuggestedPairsReader` port of its own.
  `readSuggestedPairsPage` left `CareNeededReader`, where it would have closed an import cycle through the Roster reader.
- The tab draws the design prototype's cards: tier chip, Discipler → Disciple with age band and Goal, the reason, and **Create relationship**.
  Below them is the No Schedule Overlap section.
- The settings criterion was already met by ticket 22: Gender and Age are separate sections with different words, and nothing new was built for it.

Decisions taken while building, each with the alternative:

1. **The tier cutoffs are the old numbers, carried over unchanged:** 4+ across 2+ days, 2-3, exactly 1.
   They are still open (`docs/open-questions.md`, *Open: the suggestion tier cutoffs on an hourly grid*).
   They are one constant, `TIER_CUTOFFS`, so a new decision is one edit plus the boundary tests.
   The design prototype is already hourly and draws these same numbers, which is why they were used rather than a guess at new ones.
2. **Create relationship opens the Pair popup** from the Discipler, with the Disciple already ticked (`/roster?list=disciplers&pair=L&with=P`), as `.scratch/manual-pairing/spec.md` says accepting a suggestion will.
   The Admin still forms it there, with its Material; the alternative, forming it straight from the card, would skip the Material.
3. **One card per Disciple**, with the strongest Discipler for them, as the prototype draws it.
   The alternative is every eligible pair, which is a Disciplers-times-Disciples list.
4. **No Schedule Overlap leaves out anyone in the Leader pool**, as the prototype does.
   A Discipler who overlaps no other Discipler is not a Disciple nobody can place.
   Somebody with no same-gender Discipler at all is listed there too, since no eligible leader shares their time; the section never names the gender rule.
5. **Each No Schedule Overlap row has a Pair button** opening that person's popup from the Disciple's side, as their Roster row does.
   The button removed in manual pairing, ticket 07, went to `/roster/pair` with nobody chosen, and that reason does not apply to a per-person button.
6. **Held means any open membership still awaiting acceptance**, including a Discipler's own pending invitation onto a running group.
   The narrower reading holds only members of relationships nobody has accepted.
7. **The wait is measured from the latest Intake**, because that is the Intake whose answers are being ranked.
   The alternative is the first Intake, which would keep somebody's place in the queue after they reopen their form.
8. **Two people already in an open relationship together are never suggested**, for example a Discipler and a Disciple already in the same group.
   Nothing stated this; it is the smallest reading that avoids suggesting what already exists.
9. **The order is:** tier, then shared-slot count, then a shared Goal, then a Disciple holding no participant membership, then longest wait, then the Discipler's wait, then ids.
   Tier comes before count so that five hours on one Saturday (Good) never sits above four hours across two days (Excellent).
10. **Slot counts are said in words up to eighty-four** (*Twenty-one shared time slots.*), so a reason never starts with a digit.
11. **The group case is a parameter** (`SuggestionKind`) holding the leader-pool cap and the declared-gender rule, both tested; the tab shows one-to-ones only.
    What a group suggestion proposes is still open in `.scratch/suggestions-beyond-the-one-to-one/issues/02-...`.
    The scorer is told *counts as a group* as a boolean, the way the Roster reader is, so it never reads `kind` and the relationship-kind fence is unchanged.

### James, 2026-09-22, in the Lavish review of the wave

This ticket was built twice on the same morning: here, as `c1dbc15` on `integration/manual-pairing`, and on `wave1/suggested-pairs` by a wave agent, each with its own migration.
James chose: *Keep c1dbc15, and port the wave-1 fix so only Disciples are proposed*. The wave branch is not merged; its ticket notes stay on that branch.

- Whether a Discipler whom nobody disciples may ever be suggested as somebody's Disciple: *No: only people the Roster calls Disciples are proposed*.
  James adds: not on the suggested page, but if they fill out the Intake as a mentee then they can appear on both.
- So the participant pool is now the Roster's Disciples list, read from the same facts: somebody being discipled, somebody who asked to be discipled on their Intake form, or anybody who is not a Discipler.
  A Discipler whom nobody disciples and who did not ask is offered to lead and never to be led; the Pair popup a card opens could not have chosen them (`disciplesFor` in `app/roster/lists.ts`).
- James's note is a rule about the Roster, not only this page, and it was applied there: `isDisciple` now counts *asked to be discipled on the Intake form* beside *being discipled* and *an import paired them*, so a Discipler who answered the mentee side is on both lists, their person page says so (*Also a Disciple - asked to be on their Intake form*), and the Pair popup from a Discipler lists them.
  For everybody who leads nobody the answer changes nothing, since they are a Disciple already.
- Decision 4 above is superseded: No Schedule Overlap is now everybody in the participant pool with no placeable Discipler, and needs no rule of its own about Leaders, because the pool no longer holds a Discipler who is not a Disciple.
- Not ported from the wave branch: its year in Intake dates, its phone layout of the card and its copy test. They belong to its build, not this one; anything wanted from them is a ticket of its own.

`SuggestionCandidate.offeredToLead` became `declaredSide`, so the pools read the same fact the Roster does.
Cases in `tests/domain/suggested-pairs.test.ts` and `tests/app/roster-lists.test.ts`.

James also asked to start *Willing to be one of two* from the result; that is the next ticket, not this one.
