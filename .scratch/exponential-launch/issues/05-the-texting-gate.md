# 05 - The texting gate

**What to build:** No text leaves Discipler for a church unless its subscription is trialing, active or past due (Stripe still retrying), or it is billed outside Stripe (Q32).

**Blocked by:** 03

**Status:** shipped

## The rule

- The check lives in the one query every outbound text passes through, in `src/platform/supabase/outbound-queue.ts`, not in any page.
- A text for a church without access stays unsent and is never retried into a send later.
- Verify codes are not outbound check-in texts and are not gated by this, so a church can verify its Admin before paying.
- Participants are never texted about billing.

## Acceptance

- A church whose subscription ends gets no further check-ins, reminders or invitation texts.
- A trialing church texts normally.
- A past-due church keeps texting while Stripe retries, as the spec's Billing section says ("everything keeps running during Stripe's retries"); found while writing the docs for ticket 35.
- SAU BCM, Anthem and Example Ministry keep texting with no subscription.
- A page action for a church without access refuses with a refusal code rather than queuing a text.

## Comments

### Built (2026-11-03)

- `OutboundQueue.due`, in `src/platform/supabase/outbound-queue.ts`, is the gate, and every text passes it: `dispatchQueue` is the only caller of `MessageTransport.deliver`, and it sends only what `due` gave it.
- It reads access only through `app.billing_has_access`, which ticket 03 wrote as the one answer in `app.billing_state_of`, so ticket 04's change to what `trialing` means reaches it with no change here.
- A definite no closes every unsent row of the church, withheld for good with the reason `church_has_no_access`, and gives the drain nothing.
- The tick asks nobody anything at a church without access, plans wait, and lapsed invitations wait (`CommandService`, `scheduled.tick` in the boundary).
- An Admin's act that would queue a text refuses with a code in its surface's own family (`REFUSED_WITHOUT_ACCESS` in `src/service/command-service.ts`), with one sentence for all of them in `app/texting-gate-copy.ts`.
- Migration `20261104100500` only corrects the comment on `withheld_reason`, and nothing depends on it having run.

### What happens when the access read fails

**It fails open: the texts go.**
Only an answer of `false` from the database closes anything.
A read that throws, or answers anything else, leaves the church texting exactly as it did before the gate, logs the error, sets `accessUnread` on the drain's outcome and in the tick's response, and emails support@ once a day (`textingGateUnread`).
An Admin's act is let through the same way, on a savepoint so the failed statement does not poison its transaction.

The reason is the size of the two mistakes.
A wrong no closes rows for good and silences every church at once, and those texts cannot be got back.
A missed no costs some texts for a church that has ended, for as long as the read is broken.
The read fails alone only for something like a missing function or a lost grant, which is what a deploy mistake looks like, and this is what keeps that from being an outage.

The alternative was failing closed and leaving rows queued, losing nothing.
It was rejected because every church goes quiet until someone notices, and the backlog then leaves whenever the read is mended, whatever the hour.

If the database itself is down, `due` cannot list the queue either: the drain throws, nothing changes on any row, and the next drain sends them.
So a database outage still sends nothing and loses nothing, as it always has.

### "Never retried into a send later", and a church that restarts

**Closed means closed.** The first drain that finds a definite no marks every unsent row withheld, and a withheld row is never sent, so a restart has nothing old to send.
The tick still drains every church each hour, so a row sits at most an hour before it is closed.
Each pass until the restart then has nothing to do.

Closing rows was not enough on its own.
Left alone, an open check-in would be chased by the first tick after a restart: a Leader asked on a Monday and restarted three weeks later would get a reminder of that Monday's question.
So the first tick to see a church without access abandons its open conversations (`checkin.sequence_abandoned`, reason `church_has_no_access`).
After a restart nothing is left open, and the next thing a Leader hears is that week's check-in, composed fresh, at the church's own hour (`checkInDueThisWeek` already refuses to ask at any other hour, and asks once a week, so missed weeks do not pile up).

What a church loses by this, on purpose:

- A Welcome Message, a Starter Message or a reply composed while it had no access is never sent, restart or not.
- A Leader's answer that arrives after the abandoning has no open question to belong to, and is treated as a text with no conversation.
- A window with a wrong answer costs the rows it closed: if Stripe's webhook is slow right after a church pays, a text queued in those seconds by a form or a reply stays closed.

What waits instead of being lost, because nothing has been said to anybody yet: an import's planned pairing is formed at the first tick after the restart and its invitation goes then, and a lapsed invitation is withdrawn then.
After a restart the tick also resumes what it holds back, so an acceptance reminder or a Material notice that has come due goes on an ordinary pass.

The alternatives were leaving rows queued and closing them when the webhook sees a restart, which fails if the webhook is the thing that is late, and filtering by when access was regained, which needs a history of access the flag does not have.

### An inbound text to a church without access

It is heard, and nothing is said back.

- **`STOP` and `START`** are honoured as ever, and Discipler sends neither a reply.
  Twilio's own opt-out handling answers them, before Discipler sees them, and is not something this gate can stop.
- **A check-in answer, a keyword or a Concern** is kept, as the spec keeps answers on links, so an Admin can read a Concern on the read-only dashboard.
  Anything it would have texted next is composed and closed by the gate.
- **`HELP`** still reaches an Admin as a Follow-Up Item where a Disciple sent it, and Discipler's own HELP reply is closed like any other text.
  That is the ticket's rule read literally, and it is the one that could matter to a carrier: see "Open: Discipler's HELP reply for a church without access" in `docs/open-questions.md`.
- **Nothing is about billing**, and no new sentence goes to any phone.

Replies are not exempt because an exemption has to be a hole in the one query, and a row does not say it is a HELP reply today.

### Where a text leaves without passing the gate

- **Twilio Verify codes** (`src/platform/twilio/phone-verifier.ts`), on purpose and by the ticket's rule, so a church can verify its Admin before paying.
- **Twilio's own replies to `STOP` and `START`, and possibly `HELP`**, which Twilio sends itself.
  `docs/legal/sms-opt-in-sign-up-section.md` already says Twilio may answer HELP.
  Discipler cannot stop these and should not want to.

There is no other.
`api.twilio.com/.../Messages.json` is called only by `src/platform/twilio/message-transport.ts`, whose only caller is `dispatchQueue`, and there is no TwiML reply from `/sms/inbound`.

### Decisions made

- **The links people were already texted are not refused**, by the spec's line that they keep working and nothing is texted: `relationship.accept`, a decline, a dispute and an Intake submission all go through, and their texts are closed.
  Only an Admin's acts refuse.
- **An act that would send nothing is not refused**, so the check runs after the domain's decision, and the domain's own refusals come first.
  The read is only made when a text was composed.
  Everything else about a read-only dashboard is ticket 33's.
- **Unpair and Remove refuse where taking an invitation back would start a relationship and text its Starter Messages.** It is rare, and the alternative, doing it and letting the gate close the texts, starts a relationship nobody is told about.
  Those two routes and Re-invite land on the person's page with `?noAccess=1`.
- **The counts are apart.** `closedWithoutAccess` is its own number on a drain and in the tick's response, not added to `withheld`, for the reason `withheld` already explains: it says nothing about a recipient.
- **`createMinistryWithAdmin` passes `billedOutsideStripe: true`**, as ticket 03 said, and a suite about billing passes `false`.
  `billing-records` does, and the two one-read document suites now expect `outside_stripe`.

### Words on a screen, drafts for James

- `app/texting-gate-copy.ts`: "Your church has no active subscription, so Discipler cannot send this text. Nothing was changed."
- The `textingGateUnread` email to support@, in `src/service/support-alerts.ts`.

**Decided by James on 2026-11-03.**
A past-due church keeps texting during Stripe's retries.
A failed access check sends, and tells support@ that day.
Discipler's HELP reply: test on a real phone, and exempt it if Twilio does not answer (see `docs/open-questions.md`).
