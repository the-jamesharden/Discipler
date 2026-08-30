# Nudge Reveals a Number and Sends Nothing

## Status

accepted

## Decision

**`Nudge` shows an Admin the Participant's contact details on a Follow-Up Item. It sends
no message and enqueues nothing.** There is no admin-initiated send anywhere in
Discipler, and therefore no cooldown, no daily cap and no weekly ceiling governing one.

The only participant-facing traffic Discipler generates is the Check-In Rhythm and the
reminders belonging to it: one sequence per Leader per week, advancing only on reply,
one reminder per question, at most two clarifications, and a follow-up to whoever did
not answer. That is self-limiting by construction, which is why nothing further is
needed to hold the line.

`Nudge` and *see contact details* were written as two separate actions on the Follow-Up
Item. They are one action.

## Context

`docs/product-rules.md` carried two Settled sections built on the other reading. *No
Interface Action Bypasses Messaging Limits* used twenty clicks of `Nudge` producing one
message as its worked example, and *Nudge Limits* set three per-recipient ceilings with
pilot starting values of one per twelve hours, two per day and four per week.
`docs/pastor-dashboard.md` listed five actions on a Follow-Up Item, of which `Nudge`
"sends one additional check-in and only when that recipient is eligible under the
messaging limits" and *See contact details* was a separate entry.

Four lines below that list, the same file says something the rest of it does not support:

> Messaging a participant through Discipler is deliberately absent. The admin picks up
> the phone; the product's job is to say who needs a call, not to become another inbox.

Both readings cannot be right. An action that fires an SMS at a congregant on an Admin's
click is messaging a participant through Discipler, whatever the body of the message was
composed by. The limits existed to make that action safe; removing the action removes the
thing they were making safe.

The product owner settled it: `Nudge` was always the contact-details action. The sending
behavior and the three ceilings were a misreading that had been written into the rules as
settled and had reached implementation.

## Consequences

Ticket 11a, which built the ceilings, is reversed in full — the rule module, the
`outbound_message.kind` discriminator, the per-Person send counting, and the two test
files. Its subject no longer exists, so the work is withdrawn rather than left dormant.

**The recipient-level check at the sending layer stays**, and is untouched. Consent, an
open opt-out and a missing phone number are still resolved when a message is sent rather
than when it is queued, because a Person who withdraws consent between the two must not
receive what was already waiting. That check came from ticket 03 and never depended on
nudges. What is gone is only the per-recipient rate limiting stacked on top of it.

The Ministry timezone loses one of its listed responsibilities. It still anchors
availability blocks, the check-in cadence, the ISO week boundary behind the care
counters, and the monthly opt-out rule — but no longer a nudge day or week window,
because there is none.

Ticket 20's criterion that *a held message consumes no nudge budget* is withdrawn for the
same reason: there is no budget for a held message to leave unspent. The per-phone hold
itself is unaffected, and still delays a check-in behind an open conversation.

**The cost is real and worth naming.** An Admin who sees that somebody missed a check-in
can no longer ask Discipler to re-prompt them. The reply must come through a phone call or
a text the Admin sends themselves, and the Participant's answer to a conversation held
outside the product does not land in the week-by-week history. That is the trade: the
history is thinner in exchange for a product that never messages a congregation on
anyone's behalf but its own rhythm's.

If a re-prompt is ever wanted, it arrives as a new decision with its own ceiling, and this
ADR is the record of why there was not one.
