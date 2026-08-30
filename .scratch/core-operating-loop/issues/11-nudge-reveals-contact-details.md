# 11 — Nudge reveals contact details

**What to build:** An Admin looking at a follow-up item can act on it without leaving the view: see the Participant's contact details, or resolve the item.

**Nudge sends nothing.** It reveals the number so the Admin can reach the Participant directly. Discipler's job is to say who needs a call, not to make it and not to become another inbox. There is no admin-initiated send anywhere in the product, which is why there are no per-recipient rate limits to enforce: the Check-In Rhythm is the only participant-facing traffic, and it is self-limiting by construction.

The contact details shown respect the recipient's contact-sharing consent, which is a decision about *now* and not one assumed from enrolment. A Participant who granted sharing and later withdrew it has two records, and the older one must not answer for them.

**Blocked by:** 10

**Status:** ready-for-agent

- [ ] A follow-up item exposes contact details and resolve inline
- [x] Contact details shown respect the recipient's contact-sharing consent
- [x] Nudge enqueues nothing and sends nothing

## Comments

### Built — the reveal, but not the surface it is inline in — 2026-08-30

Two of the three criteria are met and the first is half-met. What was missing was
never `resolve`, which ticket 07 built and `CommandService.execute` already
reaches; it was the *reveal*, and the reason it was missing is worth recording.

Contact-sharing consent was resolved in exactly one place — `contactToShare` on
`OutboundQueue`, on the trusted connection the queue is drained on. An Admin is
not that connection. `app.current_consent` is deliberately not granted to
`authenticated` (migration `20260828000100`, and the comment there gives the
reason: a browser session calling it directly would be probing any Person's
consent in any Ministry). So the signed-in Admin had no consent-respecting path to
a number at all.

`public.contact_to_share(uuid)` is that path — SECURITY DEFINER, checking
`app.is_member_of` before it answers, granted to `authenticated` — reached through
`CareNeededReader.contactToShare`. Two paths to one rule, deliberately not shared,
because the sending layer and a browser session are not the same principal and the
rule lives in SQL where both already meet.

**Left open: `authenticated` holds `select on person`, phone column included.** A
signed-in Admin can still read a number without consulting consent, so the new
function is the consent-respecting path rather than the only one. Revoking that
column grant is not this ticket's call: ticket 15 has the Leader Dashboard showing
"the name and phone number of everyone in" a relationship, so which surfaces may
read the column unmediated is a question those two tickets settle together. Named
in the migration as well, so it is not rediscovered.

**Left open: there is no view for anything to be inline in.** Ticket 07 said "Care
Needed is a reader, not a screen"; ticket 10 shipped `listCareNeeded` and it still
has no caller; `app/` holds roster, intake, invitation, login and sms and no
Admin care surface. Ticket 15 is the *Leader* dashboard, a different surface. No
ticket in 01–26 builds the Admin's Care Needed screen, and this ticket's first
criterion cannot be closed until one does. Not invented here — what that screen
lists, how it orders, what it shows when empty and how it is scoped are product
decisions, not implementation ones.

`Nudge enqueues nothing` is asserted against the reveal itself rather than left as
a property of absent code, so the day somebody adds a send to it the assertion
fails. 724 tests pass against a local Supabase stack, none skipped.

### Amended — Nudge does not send, and 11a is withdrawn — 2026-08-30

This ticket was ticket 11, *Nudge and outbound limits*, and was split into 11a
(sending limits) and 11b (the inline actions) on the grounds that the two halves
were independently verifiable. 11a was built and then reversed in full.

The premise was wrong. `Nudge` was written in `docs/product-rules.md` and
`docs/pastor-dashboard.md` as sending one additional check-in under three
per-recipient ceilings, with `See contact details` listed beside it as a separate
action. The two were one action all along and it sends nothing, so the ceilings
had no subject. Both Settled sections are amended and
`docs/adr/0010-nudge-reveals-a-number-and-sends-nothing.md` records the decision,
its cost, and what was withdrawn.

What survives from 11a is nothing in the codebase. The recipient-level check at
the sending layer that ticket 03 built is untouched and was never part of it.

The split is undone with it: with the limits gone there is one outcome left, and
it is this ticket.

### Withdrawn — send one additional check-in

Ticket 11 gave the Admin a third inline action, *send one additional check-in*,
and it is gone with the rest of the sending. An Admin who sees a missed check-in
picks up the phone.

The cost is named in ADR 0010 and is not hidden here: a conversation held outside
Discipler does not land in the week-by-week history, so the history is thinner
than it would have been. That was the trade the product owner made deliberately.
