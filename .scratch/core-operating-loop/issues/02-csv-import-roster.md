# 02 — CSV import populates the Roster

**What to build:** An Admin uploads a spreadsheet of names, phone numbers, and email addresses instead of typing their congregation in by hand. Those people appear on the Roster as `No Intake Submitted`.

Being on a roster is not consent and is not a wish to participate. An imported Person receives nothing, cannot be paired, and cannot receive a check-in. Roster membership, Intake completion, and pairing eligibility are three separate facts and must never collapse into one flag.

The Roster shows every Person in the Ministry with their Participation Status. That status answers one question only — *is this person being discipled* — so it is derived rather than stored, and leading a relationship will never set it.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] An Admin can upload a spreadsheet and see the imported people on the Roster
- [ ] Imported people carry Participation Status `No Intake Submitted`
- [ ] Importing enqueues no outbound message to anyone
- [ ] An imported Person cannot be paired and cannot receive a check-in
- [ ] Rows that cannot be read are reported back to the Admin rather than silently dropped
- [ ] Participation Status is derived by one SQL function over intake, consent, and open participant memberships — never a stored flag, and never set by the importer
- [ ] This ticket ships three of the four values — `Opted Out`, `No Intake Submitted`, `Ready to Pair` — and the `Paired` branch arrives with ticket 05, where memberships first exist

## Comments

### Amended — dual-role persons

Participation Status is derived, not stored, and it means *being discipled* — see
`docs/product-rules.md` under *Roles Are Relationship Memberships*. The derivation
lands here with three values because `relationship_member` does not exist until
ticket 05; the `Paired` branch is an acceptance criterion there, not a follow-up.
