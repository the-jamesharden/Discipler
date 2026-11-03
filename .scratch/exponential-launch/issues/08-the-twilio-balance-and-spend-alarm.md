# 08 - The Twilio balance and spend alarm

**What to build:** support@ hears about a failing Twilio balance before it stops every church's texts and codes (Q70).

**Blocked by:** 10

**Status:** shipped

## The rule

- The scheduled tick reads `GET /2010-04-01/Accounts/{sid}/Balance.json` every few minutes.
- Below $75, support@ is emailed once, and again only after the balance has recovered and fallen again.
- A Twilio Usage Trigger posts to a signed Discipler route when one day's spending passes a set amount, and support@ is emailed.
- Auto-recharge itself is a Console switch with no API, and is James's (see For James).

## Acceptance

- A stubbed balance of $70 sends one email and no more on the next ticks.
- A forged Usage Trigger request without Twilio's signature is refused.

## For James

1. As the Twilio organization owner, turn on auto-recharge: add $500 when the balance drops below $100, with a backup card.
2. Decided 2026-10-29 (Q78): $250 a day, about twice the expected daily spend at 100 churches (about $3,650 a month).

## Comments

### Built (2026-11-03)

- `src/service/twilio-balance-watch.ts` is the watch: it reads the balance, opens a fall when it is below the floor, tells support@ once for that fall, and closes the fall when the balance is back.
  `/cron/tick` runs it once a pass, after every church's work, and reports what it found as `twilioBalance` in its response: `fine`, `recovered`, `told`, `still_low`, `no_account` or `failed`.
- `TWILIO_BALANCE_FLOOR_CENTS` in `src/domain/twilio-balance.ts` holds the floor.
- `src/platform/twilio/account-balance.ts` reads `Balance.json` with a 10-second timeout.
- `twilio_balance_fall` remembers each fall, as an operator-only table (migration `20261103100800_the_twilio_balance_falls.sql`, not pushed).
- `app/sms/usage-trigger/route.ts` takes the Usage Trigger's callback, proved with the same `signedByTwilio` check `/sms/inbound` now shares, and sends the `twilioSpendPassed` email.
  A forged request gets 403 and a failed send gets 500, because Twilio retries a 5xx.
- Both emails go through the one sender and carry amounts, a time and Twilio's name for the usage category, with no church, person, phone number or account ID.

### How often it reads

The ticket says every few minutes, but `vercel.json` runs `/cron/tick` once an hour, and no more frequent cron has been decided.
So the balance is read once an hour today, and on every pass if the cron changes, with nothing else to alter.
At an hour between reads, a balance could fall through the floor and run out between two passes.

### For James, in detail

1. **Change auto-recharge first.** It is below $10 up to $50 today, so the balance sits under the $75 floor in normal use and the alarm fires on the first tick after deploy.
   Change it to below $100 up to $500, as step 1 above says.
2. Push `20261103100800_the_twilio_balance_falls.sql` before the deploy.
   Without the table the watch reports `failed` and the tick carries on, so the order costs an alarm and breaks nothing.
3. **Create the Usage Trigger** on the same Twilio account whose `TWILIO_AUTH_TOKEN` production holds, since that token is what the route checks:
   - CallbackUrl: `https://app.trydiscipler.com/sms/usage-trigger`, exactly, because the signature covers the URL
   - CallbackMethod: `POST`
   - UsageCategory: `totalprice`
   - TriggerBy: `price`
   - TriggerValue: `250`
   - Recurring: `daily`
   - FriendlyName: `Discipler daily spend`

   By API, with the account's own values for the two placeholders:

   ```
   curl -X POST "https://api.twilio.com/2010-04-01/Accounts/$TWILIO_ACCOUNT_SID/Usage/Triggers.json" \
     -u "$TWILIO_ACCOUNT_SID:$TWILIO_AUTH_TOKEN" \
     --data-urlencode "CallbackUrl=https://app.trydiscipler.com/sms/usage-trigger" \
     --data-urlencode "CallbackMethod=POST" \
     --data-urlencode "UsageCategory=totalprice" \
     --data-urlencode "TriggerBy=price" \
     --data-urlencode "TriggerValue=250" \
     --data-urlencode "Recurring=daily" \
     --data-urlencode "FriendlyName=Discipler daily spend"
   ```

   Twilio does not let the category or value of an existing trigger be changed, so a different amount later is a new trigger and a delete of this one.
4. **Check both against the real Twilio once**, because neither could be checked here.
   Twilio's balance page is gone from its docs (404), so the `balance` and `currency` fields are from memory: after deploy, `twilioBalance` in the tick's response should not say `failed`.
   Twilio's Usage Trigger page does not say in so many words that its callback is signed; a throwaway trigger with a low `TriggerValue` should bring the email to support@, and if none comes the first thing to suspect is this route refusing it with a 403.

### Decisions made

- **A failed read changes nothing.** The read comes first and throws, so no email goes, no fall opens or closes, the tick still answers 200 with `twilioBalance: 'failed'` and logs the error, and the next pass reads again.
  A status, shape or currency it does not recognise counts as a failed read, never as a number.
  The alternative was to email support@ after several failed reads in a row, which would catch a rotated token or a changed answer that silences the alarm for good.
  It was left out because it is a new alarm the ticket did not ask for and needs its own memory, but as built that failure is quiet: it shows only in the tick's response and the log.
- Recorded, told, then marked told, where the capacity watch tells and then records.
  Each email is keyed on its fall's ID and written only from what the fall recorded, so a retry is word for word the same under the same key, which Resend drops rather than refuses; a second fall on the same day has a new key and is sent.
  The capacity watch's key by day would have dropped that second fall.
- A fall that recovers before support@ could be told is closed without an email, since there is nothing left to act on.
- A trigger's `once` is a SHA-256 of everything Twilio signed, not its `IdempotencyToken`, whose documented form starts with the account SID and Resend keeps its keys.
  There is no table for the spend alarm: Twilio fires at most once a day per trigger, and a retry is dropped by that key.
  The alternative was a row per firing, which would only add history nothing reads.
  If Resend is down through all of Twilio's retries, that day's spend alarm is lost.
- The route is `/sms/usage-trigger`, because `sms` is already a reserved short name, so no church can hold the address and no migration is needed.
  The alternative was `/twilio/usage-trigger`, which would need a new reserved word in the code and in `app.short_name_is_reserved`.
- Where texts are recorded, as on staging, the watch reads nothing and reports `no_account`, because there is no Twilio account there.
- A signed callback with a value missing or unreadable still emails, saying "Twilio did not say", since the alarm matters more than its details.
