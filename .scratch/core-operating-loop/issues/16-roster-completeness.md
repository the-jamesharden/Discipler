# 16 — Roster completeness

**What to build:** Three gaps in the Roster that each stand between an Admin and a Person's real situation.

An Admin can **mark a Person eligible to lead** before they complete Intake, so they can plan while waiting on them. This is the intended-role field and the leader-pool flag in one: a plan that becomes eligibility, never two separate facts to keep in step. It is still a plan and not a fact — it does not make the Person pairable, does not substitute for Intake, and says nothing about whether they currently lead anything.

An Admin can **send a Person a link that reopens their own Intake form prefilled**, so availability or a phone number can be corrected without giving them an account. This is the only route by which a Participant's availability changes; there is no Participant dashboard and no SMS path for it in V1.

A Person who has **opted out** is excluded from pairing and from follow-up, so the Ministry honors what they told them. `STOP` moves a Person to `Opted Out` at the person level. They receive nothing further, appear in no suggestion, and are not surfaced as a care item — an opted-out Person is not a problem to be solved.

**Blocked by:** 04, 08

**Status:** ready-for-agent

- [ ] An Admin can mark a Person eligible to lead before they have completed Intake
- [ ] Eligibility to lead does not make a Person pairable and does not substitute for Intake
- [ ] Eligibility is independent of whether the Person has an account and of how many relationships they already lead
- [ ] The Roster shows the derived Participation Status, and a Person who leads but is discipled by nobody reads `Ready to Pair` with an explanation of why
- [ ] An Admin can send a tokenized link reopening a Person's Intake, prefilled
- [ ] Re-submitting Intake updates availability and contact details without creating a duplicate Person
- [ ] Re-submitting records a fresh consent record rather than overwriting the earlier one
- [ ] `STOP` moves a Person to `Opted Out`
- [ ] An opted-out Person receives no further messages, appears in no suggestion, and raises no care item
- [ ] An opted-out Person in an existing relationship does not silently end it

## Comments

### Amended — dual-role persons

Q4, settled: one field. `eligible_to_lead` *is* the intended role. Two flags would
have needed a rule for what a Person marked intended-leader but not eligible means,
and there is no answer to that question anybody would want to give.

The Roster explanation matters more than it looks. A coordinator seeing a man who
leads two relationships listed as `Ready to Pair` will read it as a bug unless the
screen says what the status is about — that he is not currently being discipled,
which is exactly the thing the ministry would want to notice.
