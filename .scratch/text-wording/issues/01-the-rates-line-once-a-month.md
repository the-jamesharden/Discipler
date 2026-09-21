# 01 - The rates line, once a month

**What to build:** *Msg & data rates may apply. Reply STOP to opt out, HELP for help.* reaches a Person at most once in a calendar month, on the first text of that month that would carry it, and is left off the rest.

**Blocked by:** None - can start immediately.

**Status:** ready-for-agent

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

- [ ] Discipler records, for every text it queues, whether that text carried the line, as a fact on the queued message and not something read back out of its body.
- [ ] A text that would carry the line leaves it off where the same Person has already been queued one carrying it in the current calendar month, by the Ministry's own timezone, which is the month the check-in rule already uses.
- [ ] It is decided per Person and not per relationship: a Leader of three relationships is sent it once.
- [ ] A text refused or never sent does not count as the Person having had it.
  Say on this ticket how *never sent* is read, since a queued text can fail at the vendor.
- [ ] The Leader's monthly check-in rule becomes this rule and is not kept beside it: one Person, one month, one line, whichever text comes first.
- [ ] Two texts queued to one Person in the same command, such as an invitation and a Starter Message, carry it once between them.
- [ ] `CONTEXT.md`'s *Starter Message* stops saying it *always* carries the line, and says when it does.
  `docs/consent-language.md` and the comment on `OPT_OUT_DISCLOSURE` say the rule as it now is.
- [ ] The Ministry settings preview shows a message as it reads when it does carry the line.
- [ ] Domain tests cover: first contact; a Starter Message in the same month as the Welcome (left off) and in a later month (carried); a Leader's first check-in of a month after a Starter Message that month (left off); two texts in one command; a Leader of several relationships.
- [ ] Integration tests cover the same against the real queue, and the month boundary in a Ministry whose timezone is not UTC.

## Comments

### Written by the agent that took James's note, 2026-09-21

Not built with the wording changes of that day, because it changes a compliance rule the glossary states and needs the queue to remember something it does not record today.
Carriers and the CTIA guidance ask for opt-out instructions on the first message and at regular intervals on a recurring program; once a month is the interval this product already chose for check-ins.
That is my reading and not legal advice: James may want it checked against the A2P campaign as registered before this ships.
