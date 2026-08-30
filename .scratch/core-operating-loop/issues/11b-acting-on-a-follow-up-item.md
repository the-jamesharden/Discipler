# 11b — Acting on a follow-up item inline

**What to build:** An Admin looking at a follow-up item can act on it without leaving the view: see contact details, resolve the item, or send one additional check-in.

**The limits are ticket 11a's.** Nudge is capped at the sending layer, not here. A disabled Nudge button is a courtesy this ticket may offer; it is not the rule and nothing here may stand in for it.

**Blocked by:** 10

**Status:** ready-for-agent

- [ ] A follow-up item exposes contact details, resolve, and send-one-check-in inline
- [ ] Contact details shown respect the recipient's contact-sharing consent

## Comments

### Split from ticket 11 — 2026-08-30

Ticket 11 carried two independently verifiable outcomes: a sending-layer invariant
and an Admin surface. It is now 11a and 11b (this ticket), split on the line the
ticket's own text drew — *that limit is enforced at the sending layer, not at the
button.*

No design decision changed in the split. Both paragraphs and both criteria above
are ticket 11's, verbatim; the cooldown, the caps, the timezone and ISO week
resolution, and the dual-role amendment moved to 11a intact. The one addition is
the paragraph naming the seam.

`Blocked by: 10` is ticket 11's, unchanged on both halves.

### Surfaced — is the inline check-in subject to a ceiling?

Not resolved here, and not resolvable by partitioning. Ticket 11 exempts the
Check-In Rhythm from the nudge ceiling because it is *self-limiting by
construction*. The send-one-check-in action above is Admin-triggered rather than
the rhythm, so that reasoning does not reach it, and ticket 11 never said whether
it draws on the nudge budget, carries its own ceiling, or is unbounded.

An Admin holding a Care Needed list with an unmetered send button is the failure
11a exists to prevent, so this needs an answer before 11b ships. It is stated as a
gap rather than filled in, per the working rule against inferring material product
behavior.
