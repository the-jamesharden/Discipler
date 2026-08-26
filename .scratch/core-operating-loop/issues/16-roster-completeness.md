# 16 — Roster completeness

**What to build:** Three gaps in the Roster that each stand between an Admin and a Person's real situation.

An Admin can **set an intended role** for a Person before they complete Intake, so they can plan while waiting on them. This is a plan, not a fact — it does not make the Person pairable and does not substitute for Intake.

An Admin can **send a Person a link that reopens their own Intake form prefilled**, so availability or a phone number can be corrected without giving them an account. This is the only route by which a Participant's availability changes; there is no Participant dashboard and no SMS path for it in V1.

A Person who has **opted out** is excluded from pairing and from follow-up, so the Ministry honors what they told them. `STOP` moves a Person to `Opted Out` at the person level. They receive nothing further, appear in no suggestion, and are not surfaced as a care item — an opted-out Person is not a problem to be solved.

**Blocked by:** 04, 08

**Status:** ready-for-agent

- [ ] An Admin can set an intended role on a Person who has not completed Intake
- [ ] An intended role does not make a Person pairable
- [ ] An Admin can send a tokenized link reopening a Person's Intake, prefilled
- [ ] Re-submitting Intake updates availability and contact details without creating a duplicate Person
- [ ] Re-submitting records a fresh consent record rather than overwriting the earlier one
- [ ] `STOP` moves a Person to `Opted Out`
- [ ] An opted-out Person receives no further messages, appears in no suggestion, and raises no care item
- [ ] An opted-out Person in an existing relationship does not silently end it
