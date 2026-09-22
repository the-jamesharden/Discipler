# 01 - The rates line, once a month

**What to build:** *Msg & data rates may apply. Reply STOP to opt out, HELP for help.* reaches a Person at most once in a calendar month, on the first text of that month that would carry it, and is left off the rest.

**Blocked by:** None - can start immediately.

**Status:** shipped

**Built:** 2026-09-22, on `wave1/rates-line-once-a-month`; on `main` in PR #16 the same day, with its migration on production.

**It adds a migration**, which James pushes to production by hand.

## Decided by James, 2026-09-21

> If it's not the time of the month where they need to have the message and data rates aspect, don't just include that on every single message.
> Only include that once a month, when that's needed.
> If that's already been sent, then that can be left out of the messages.

## Why

The line is not on every text today.
The rule in `src/domain/outbound-copy.ts` is: on first contact, on the Starter Message, after a thirty-day Silence Gap, and on a Leader's first check-in of each calendar month.
But those occasions fall close together for one Person: somebody who completes Intake, is paired the same week and whose leader then has somebody join their group reads it three times in a few days.
That is what James saw when the texts were laid side by side, and it reads as boilerplate on everything.

Once a month is what the monthly check-in rule already does for Leaders.
This ticket makes it the rule for every text and every Person.

## What stays

- **First contact always carries it**, with the A2P identification it already carries. Nobody has been sent anything before it, so *at most once a month* never takes it off.
- **After a thirty-day Silence Gap it is carried again.** A gap that long always crosses into a month the Person has not had it in, so the two rules agree; say on this ticket if a case is found where they do not.
- The words of the line do not change.
- Which messages *may* carry it does not change: the ones that state `discloseOptOut: true` today.

## Acceptance

- [x] Discipler records, for every text it queues, whether that text carried the line, as a fact on the queued message and not something read back out of its body.
- [x] A text that would carry the line leaves it off where the same Person has already been queued one carrying it in the current calendar month, by the Ministry's own timezone, which is the month the check-in rule already uses.
- [x] It is decided per Person and not per relationship: a Leader of three relationships is sent it once.
- [x] A text refused or never sent does not count as the Person having had it.
  Say on this ticket how *never sent* is read, since a queued text can fail at the vendor.
- [x] The Leader's monthly check-in rule becomes this rule and is not kept beside it: one Person, one month, one line, whichever text comes first.
- [x] Two texts queued to one Person in the same command, such as an invitation and a Starter Message, carry it once between them.
- [x] `CONTEXT.md`'s *Starter Message* stops saying it *always* carries the line, and says when it does.
  `docs/consent-language.md` and the comment on `OPT_OUT_DISCLOSURE` say the rule as it now is.
- [x] The Ministry settings preview shows a message as it reads when it does carry the line.
- [x] Domain tests cover: first contact; a Starter Message in the same month as the Welcome (left off) and in a later month (carried); a Leader's first check-in of a month after a Starter Message that month (left off); two texts in one command; a Leader of several relationships.
- [x] Integration tests cover the same against the real queue, and the month boundary in a Ministry whose timezone is not UTC.

## Comments

### Written by the agent that took James's note, 2026-09-21

Not built with the wording changes of that day, because it changes a compliance rule the glossary states and needs the queue to remember something it does not record today.
Carriers and the CTIA guidance ask for opt-out instructions on the first message and at regular intervals on a recurring program; once a month is the interval this product already chose for check-ins.
That is my reading and not legal advice: James may want it checked against the A2P campaign as registered before this ships.

### Implementer, 2026-09-22: built, and what was decided while building

Built on `wave1/rates-line-once-a-month`, cut from `67bc096`.
New code says "Text wording, ticket 01".
No message's words changed; only whether the line is on them.

**Where things are.**

- `supabase/migrations/20261007000500_the_rates_line_once_a_month.sql` adds `outbound_message.carries_rates_line`, not null and with no default, backfilled once from the body for rows queued before it existed, and a partial index for the history read.
  No database function is added, so there is nothing to revoke.
- `src/domain/rates-line.ts` is the rule, pure: `settleRatesLine` settles every text one command queues against `RatesLineHistory` (when each Person was last queued a text that carried the line, and the Ministry's timezone), and `ratesLineIsDue` compares calendar months in that timezone.
- Every `OutboundMessageDraft` states `ratesLine`: `always`, `once_a_month` or `never`, next to `kind` and as required as it.
  The copy in `src/domain/outbound-copy.ts` still composes each text as it reads when it carries the line; `withoutRatesLine` takes it off, and `settleRatesLine` refuses a draft whose words disagree with what it says.
- `applyEffects` in `src/service/command-service.ts` reads `ratesLineHistory` for the Persons the command texts and enqueues the settled texts; `enqueueMessages` writes `carries_rates_line`.
- The Leader's monthly check-in rule is gone from `src/domain/boundary.ts`: a conversation's opening question is `once_a_month` like any other text, and `lastCheckInAt` now serves only the cadence.
- Tests: `tests/domain/the-rates-line-once-a-month.test.ts` and `tests/integration/the-rates-line-once-a-month.test.ts` cover every case the criteria list, the Sydney month boundary, a withheld text and a vendor-refused one.
  Domain tests that were about something else read texts through `readAfterTheLineThisMonth` in `tests/support/effects.ts`.
- `CONTEXT.md` gains *Rates Line* and the Starter and Resume Messages point at it; `docs/consent-language.md`, `docs/product-rules.md` and `docs/check-in-rhythm.md` say the rule as it now is.

**Checked.**
The whole typecheck is clean apart from `.next/types`.
`tests/domain` and `tests/app` whole: green.
Through `scripts/locked-tests.sh`: the new suite and the nine it touches, green.
The first full run had one red test, `accepting-an-invitation`, ordering two texts by an `enqueued_at` that one pinned clock ties; it now orders by `created_at` as well.
The full run after that: 179 files and 2636 tests passed, 1 test skipped (in `invitation-over-http`, as before), no file skipped.
The Ministry settings page on this checkout's build in Chrome, through a cookie proxy: the preview reads exactly as the invitation text, and the rest of the page is unchanged.

**Decided here, each the conservative reading, with the alternative.**

1. **How *never sent* is read.**
   A text withheld at send time (opted out, no consent, no number by then) does not count: nobody read it, and the next text that may carry the line carries it.
   A text the vendor refused does count, because the dispatcher leaves it on the queue and tries it again on every drain, so it is still going to be read.
   The alternative was to count only texts the vendor accepted (`sent_at`); that would let every text queued before the first drain carry the line too, which is the repetition James asked to remove.
   The cost: a text the vendor refuses forever keeps a Person's line "had" for that month, and that is the known forever-retry cost `outbound-dispatch.ts` already names.
2. **The Welcome Message and `HELP` always carry it**, and each counts as the Person having had it that month.
   The Welcome is first contact and the opt-in receipt, and the `HELP` reply is where carriers expect the opt-out instructions whatever else was sent.
   The alternative was to put both under the monthly rule, which would take the opt-out words off a `HELP` reply.
3. **Within one command, an `always` text counts first**, so a Welcome and another text to the same Person carry it once, on the Welcome; among the rest the first in the command carries it.
4. **A text to nobody on the Roster keeps the line**, since there is no Person to have had it. None exists today.
5. **Two commands at the same instant for one Person can both carry it.** Each reads the history in its own transaction; locking the Person would risk deadlocks with the row locks commands already take.
   The failure over-discloses and never under-discloses.
6. **The backfill reads the body once**, for rows that predate the column, so nobody is sent the line again in the month this ships merely because the history was blank.
   The alternative, backfilling false, would send it once more to everybody that month.
7. **The settings preview is unchanged.** It shows the invitation, which never carries the line, and it reads word for word as the text (`tests/app/the-settings-preview.test.ts`); a message that may carry it would be previewed with it, because the copy composes it that way.
   Previewing a Starter Message as well would be new UI, and is James's to ask for.

**For James.**

- Push the migration to production by hand before this merges.
- A case where the two rules disagree, as the ticket asked: a thirty-day Silence Gap inside one 31-day month, such as a Starter Message on 1 January and a resume on 31 January, now leaves the line off the resume, where the old resume carried it every time.
  Keep it (the month rule as written), or carry the line again after thirty days of silence as well?
- The CTIA reading in the first comment still wants checking against the A2P campaign as registered.

### James, 2026-09-22, in the Lavish review of the wave

- The thirty-day Silence Gap inside one calendar month: *Keep once a calendar month, as the ticket says*.
  Nothing changes; the resume on 31 January after a Starter Message on 1 January carries no rates line.
- The carrier registration: *Ship it: the registration does not bind this*. In James's words: I checked, it agrees.

Folded into the ship branch with the rest of the wave. The migration is still James's to push before this merges.
