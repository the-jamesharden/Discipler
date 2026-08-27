# 03 — Intake, consent, and the Welcome Message

**What to build:** A Person opens a link and completes one short form — no account, no software to learn. They select every time window that could work on a grid rather than describing their schedule in prose, state what they are hoping to get out of discipleship, give their age as a range, select their gender, and optionally give an email. On submitting they immediately receive a Welcome Message, and they move to `Ready to Pair`.

SMS consent and contact-sharing consent are two separate decisions, because a person can reasonably agree to hear from their church and not agree to have their number handed to another congregant. The exact wording each Person agreed to is recorded with its version identifier and its own timestamp. Existing consent records are never migrated forward to a new version.

This ticket introduces the outbound queue. Every message passes a recipient-level check before it sends, enforced at the sending layer rather than at the button, and contact-sharing consent is checked at send time rather than assumed from enrollment. Every message carries the Ministry name prefix; the Welcome Message is first contact, so it also carries the compliance prefix and the opt-out and rate-disclosure language.

Intake is the only thing that grants consent — importing someone never speaks on their behalf.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] A Person can complete Intake from a link with no account, reached either from a link the pastor sent them or from a QR code opening that same link
- [ ] Each consent record states which of those two routes the Person arrived by
- [ ] Availability is selected on a grid; Discipleship Goal, age band, and gender are captured; email is optional
- [ ] SMS consent and contact-sharing consent are separate required decisions, each stored with its own timestamp and the consent version
- [ ] Completing Intake enqueues a Welcome Message and moves the Person to `Ready to Pair`
- [ ] All outbound messages pass through one queue with a recipient-level check at the sending layer
- [ ] Contact-sharing consent is evaluated at send time
- [ ] Outbound messages carry the Ministry prefix; first contact also carries the compliance prefix and opt-out language
- [ ] A Person with no consent record receives nothing
- [ ] The queue carries a per-recipient-phone key and a prompt state — open, answered, superseded, timed out — so the serialization in ticket 20 can be added without a schema migration

## Comments

### Amended — dual-role persons

The outbound queue is the only place the per-phone send checks live, and ticket 20
adds serialization on top of it. The schema needs the phone key and the prompt
state now so that serialization is a query change rather than a migration.

### Schema skeletons landed with ticket 02

`intake_submission` and `consent_record` exist, carrying only what Participation
Status has to read: that a submission exists, and that a consent of a given kind was
granted with its version and timestamp. What the form captures -- availability, the
Discipleship Goal, age band, gender, the optional email -- is still this ticket's,
and so is every rule above.

Two floors are already enforced in the database and this ticket sits on top of them:
a Person with no SMS consent, or with an open opt-out, cannot be the recipient of an
outbound message at all. The recipient-level checks named above -- cooldowns, nudge
limits, contact-sharing consent at send time -- are the sending layer's and are still
to be built.

### Settled — how a Person reaches Intake

Intake is the single consent gate: completing the form creates the SMS consent
record and nothing else does. There are two routes to the form and only two --
a link the pastor sends directly, which is the primary path, and a QR code opening
that same link, which is what works when a room of leaders can complete it together
at a meeting. Both put the same wording in front of the same person and both produce
the same record.

An Admin attesting to consent on a congregant's behalf is not a route, at import or
anywhere else. Inbound-keyword opt-in is post-V1.

`consent_record.source` landed with ticket 02's review pass, as `pastor_link` or
`qr_code`, and it is `not null` with no default -- so the form has to say which route
the Person came by, and a write that cannot say fails rather than guessing. Recorded
in `docs/consent-language.md` and `docs/product-rules.md`.

### Unresolved — the Welcome Message and *no SMS before pairing approval*

Two rules in this repository presently disagree, and this ticket is where they
collide. Nothing here is settled, and the acceptance criteria above are left as
written.

- This ticket says *completing Intake enqueues a Welcome Message*, which sends to a
  Person who has consented but has not been paired with anybody.
- The messaging order recorded elsewhere says *no SMS at import, and no SMS before
  pairing approval*, which the Welcome Message would break.

Both readings are defensible -- the Welcome Message goes to somebody who has just
given SMS consent on the form, which is the thing the rule protects -- but which one
holds decides whether this ticket sends anything at all. Raised in
`docs/open-questions.md` rather than settled here.
