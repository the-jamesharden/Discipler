# 14 - The over-200 follow-up

**What to build:** When a church on $97 has more than 200 people in active relationships for a whole month, support@ is emailed to follow up.

**Blocked by:** 03, 10

**Status:** ready-for-agent

## The rule

- People in active relationships means Disciplers and disciples together, each counted once.
- The count is derived from history, not stored as a running total.
- There is no automatic move to $147.
- One email per church per month.

## Acceptance

- A church above 200 for a whole calendar month causes one email; a church that dips under 200 in that month causes none.

## Comments

### Built (2026-11-03)

- `src/domain/over-200.ts` holds the rule, and `fewestPeopleInActiveRelationships` in `src/domain/growth.ts` holds the count, read from the same history as the growth chart.
- `src/service/over-200-watch.ts` is the watch.
  `/cron/tick` runs it once a pass, after every church's work and after the Stripe sweep, and reports `over200` in its response: `{ told, failed }`, `no_prices` or `failed`.
- `src/platform/supabase/over-200-follow-ups.ts` reads and remembers; `src/platform/stripe/prices.ts` asks Stripe which prices are the first price.
- `over_200_follow_up` holds one row per church per month that called for an email, as an operator-only table (migration `20261104101400_the_over_200_follow_up.sql`, not pushed).
  The same migration lets `discipler_command` run `app.growth_inputs`, so the history is read as the church.
- The email is `over200FollowUp` in `src/service/support-alerts.ts`, to support@ only.

### For James

1. Push the migration before the deploy.
   Without the table the watch reports `failed` and the tick carries on.
2. The restricted Stripe key needs read on Prices, which ticket 04 asks for too.
   Without it the tick reports `over200: "failed"` every pass and no email can ever go.
3. Ticket 04's catalog has to exist in the account, because the watch finds the first price by its lookup keys.
   Until it does the tick reports `over200: "no_prices"`.
4. Check the lookup against the real Stripe once, because neither it nor a real send could be run here.
   After deploy, `over200` in the tick's response should be `{ "told": 0, "failed": 0 }`.

### Decisions

- **What "above 200 for a whole calendar month" means in a church's time zone.** The month runs from midnight on its first to midnight on the first of the next, on the wall in the Ministry Timezone, read with the same `monthOpensAt` as the growth chart.
  So it is not the same stretch of time for every church, and a month has no answer until it has closed at that church: Los Angeles's October closes three hours after New York's.
  The alternative was one UTC month for every church, under which a late-evening dip on the 31st in America would count against the wrong month.
  A church that changes its zone has its months read in the new one; the row is keyed on the month's label, so that cannot cause a second email.
- **Above means above at every instant.** The count is read at the month's opening and at every instant in it that the history changed, so nothing is sampled and a dip of a minute spoils the month.
  Exactly 200 is not above 200, because the first price is "up to 200", though the ticket's acceptance says "dips under 200"; the spec's "stays above 200" wins.
  The alternative was reading the count once a day, which would ignore a brief dip such as a relationship ended and re-formed a few minutes later.
  The cost as built is that such a church waits another month for its follow-up, which is cheap beside emailing about a month it did not stay above.
  An ending and a start at one instant are one change, so one person moved in a single command is no dip.
- **A church that signed up mid-month is first answered for its first whole calendar month.** A church has to have been on a live Subscription at the first price from the instant the month opened, read from `billing_event`.
  Signing up on 15 November with 300 people means nothing for November, and an email on 1 January if it stayed above through December.
  The same rule covers a history imported from before it subscribed, a church that came onto Stripe billing or down from $147 partway through, and a Subscription that lapsed and restarted inside the month.
  The alternatives were counting from sign-up to the end of the month, which is not a whole month, or 30 rolling days, which is not a calendar month.
- **"On the $97 price" is asked up to now, not only up to the month's close.** A church moved to $147, or ended, before the question was answered has nothing to follow up, so it gets no email.
  The alternative, answering only as of the close, would ask someone to move a church that had already moved.
- **The yearly bill of the first price counts as being on $97.** The spec makes it one price billed two ways.
  A coupon changes no price, so the Exponential offer, a referral month and a plant's free year are all still on it.
- **A free trial and a payment in Stripe's retries count as being on the price**; every church starts on $97 and the Subscription is on it from the start.
  The alternative, waiting for a first real payment, could delay the follow-up by two months for an offer's church.
- **People in active relationships are those in relationships accepted, not ended and not paused, with at least one Disciple**, the same reading as the growth chart, plus the Disciplers who had accepted by then.
  The alternative was counting a paused relationship's people, since the church still has them; the product already says paused is not active.
- **The first price is found by Stripe lookup key, once a pass**, using the keys ticket 04's catalog creates, so no ID has to be configured and staging's differ from production's by themselves.
  The alternative was two environment variables holding the IDs, which would be a second list of what ticket 04 already names.
  Both keys have to resolve, or nothing is read, because a yearly church missed for want of one price would be missed in silence.

### Exactly once

- **Recorded, then told, then marked told**, as the balance watch does, on a primary key of church and month.
- A tick that failed asks again on the next pass, since the question is put to history and history has not moved.
- A pass looks at the last two closed months at each church, so even a month in which no tick ran at all is still answered.
  An outage longer than that loses the oldest month, which was left rather than asking without limit, because a correction to old history could otherwise email about a month long gone.
- An email that failed stays recorded and untold, and every pass sends whatever is owed, whichever month it is about.
  That retry does not ask again, so a church that moved price between the failure and the retry still gets its email.
- An email that went but was not marked is sent again on the next pass under the key `over-200:<church>:<month>`, word for word because it is written only from the row, and Resend drops it.
  That key lasts 24 hours, so a duplicate would take a database that can be read but not written for a whole day; that is the one gap in "exactly once".
- Two passes racing record one row, then send under one key.
- A "no" is not recorded: it is read off history again on each pass, so a corrected history can still be answered inside the two months.
  To keep that cheap, one query first rules out every church with no more than 200 people holding a membership in that time, and reads no history for them.

### What the email says

The church's name, the month, the fewest people that month as a number, the two prices and the Stripe customer ID.
No name from the Roster, no phone number and no Concern.
The church's name is there because nobody could follow up without it, and it is kept on the row so a rename cannot change a retry's words.
The words are drafts for James, in `src/service/support-alerts.ts`.

### For the merge with ticket 04

- `FIRST_PRICE_LOOKUP_KEYS` copies the two keys from ticket 04's `src/domain/offers.ts`, which was not committed when this was written.
  Once both are in, point it at `startingPrice('month').lookupKey` and `startingPrice('year').lookupKey`.
- Ticket 04 adds `awaiting_payment_method` to `billing_event`, and a trial not yet confirmed reads `trialing` there with the standing `incomplete`.
  This watch asks the standing now, so such a church gets no email.
  What it cannot see from here is a trial confirmed partway through a month, which reads as on the price from when it opened; adding `and not awaiting_payment_method` to `recordsOf`'s billing read would close that.

### Left alone

- A church with no time zone is skipped, since none is guessed.
  Every church opened since PR #25 has one.
- Nothing tells the church itself, and nothing moves its price; the spec gives both to whoever follows up.
