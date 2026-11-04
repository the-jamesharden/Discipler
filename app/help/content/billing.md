# Billing and your free trial

Discipler is one simple plan, billed monthly or yearly, with a free trial to start.
Any Admin of your church can manage billing.

## Your free trial

Every church starts with {{trialDays}} free.
You add a card or bank account when you sign up, but nothing is charged then.
Your first charge comes when the free days end.
We email you {{trialEndingEmail}} before your trial ends, and Stripe sends its own reminder too.

## Prices

- {{priceUpToTheLimit}} a month for up to {{peopleOnTheFirstPrice}} people in active relationships, counting Disciplers and Disciples together.
- {{priceAboveTheLimit}} a month above {{peopleOnTheFirstPrice}}.

Every church starts on {{priceUpToTheLimit}}.
If your church stays above {{peopleOnTheFirstPrice}} for a whole month, we will be in touch.
Your price never changes by itself.

Paying yearly is {{yearlyDiscount}} off: {{yearlyPriceUpToTheLimit}} a year for up to {{peopleOnTheFirstPrice}} people, or {{yearlyPriceAboveTheLimit}} a year above.
You choose monthly or yearly when you sign up.

## Offers

- **The Exponential special offer.** Sign up with the code {{exponentialCode}} for {{exponentialTrialDays}} free instead of {{trialDays}}, then {{exponentialDiscount}} off {{exponentialDiscountSpan}}.
  The code works until the end of {{exponentialLastDay}}, Pacific time.
  After that your free trial still applies.
- **Invited by another church.** Sign up through another church's link and your first paid month is free.
  If you also have the Exponential special offer, you get that instead, since it saves you more.
- **Church plants.** A church that launched in the last {{plantLaunchedWithin}}, or is launching in the next {{plantLaunchingWithin}}, can apply for {{churchPlantFree}} free after its trial.
  Answer Yes to "Is your church a church plant?" when you sign up.
  Your trial starts straight away, and we email you when the team approves your plant.

A church plant with the Exponential special offer gets both, one after the other: the longer trial, then the free months, then the discount.
A church plant that was invited by another church gets the church plant offer.
Every offer ends if your subscription ends.

## Billing in Settings

The Billing card in [Settings](/help/settings) shows your plan, your trial or next payment, and your card or bank.
**Open billing** shows the full picture: any offer or credit in force, and your past invoices.
To update your payment method or cancel, Discipler opens Stripe's own billing page at the right step.

Card and bank details are only ever typed on Stripe's forms.
Discipler keeps only the card's brand and last four digits, and Stripe's fingerprint of the card or bank account.
The fingerprint does not show the number, and is how Discipler checks that one card or bank account does not claim the same offer twice.
A bank account is added by signing in to your bank through Stripe.
To change to a different bank account, write to [support@trydiscipler.com](mailto:support@trydiscipler.com).

## If a payment doesn't go through

Everything keeps running while Stripe tries again.
A banner on every page asks you to update your payment method until the payment goes through.

## Cancelling

You can cancel from Billing at any time.
Discipler keeps running until the end of the time you have already paid for.

When a subscription ends, check-ins stop, your pages turn read-only, and everything you have is kept.
Links people were already sent, such as Intake forms and materials, keep working, but nothing is texted.
Your people are never texted about billing.

Press **Restart Discipler** on the banner to come back.
A restarted church pays the normal price from that day, with no second trial.
