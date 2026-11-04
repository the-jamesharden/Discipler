# 32 - Refer and the referral credit

> **Triaged 2026-10-31 against the spec's "Referrals", its mock-up 5 decisions and its triage decisions.**
> The screen is `.lavish/refer-billing/refer.html`, built by `build.mjs`.
> **Changed by the triage of ticket 20 (2026-11-04):** each church's code and the `referral` table are built in ticket 20, because an invited church has to be recorded the moment it opens.
> This ticket keeps the page, "Get a new link", the events and the credit.
> **The link it shows is `app.trydiscipler.com/r/<code>`** (James, 2026-11-04), not the `trydiscipler.com/r/<code>` drawn in mock-up 5.

**What to build:** The Refer page, "Get a new link", and the automatic credit.

**Blocked by:** 04, 20

**Status:** ready-for-agent

## The page

As drawn, in order:

- The title, with "Know a church that would love Discipler? Share your link."
- The green offer: "Give a month free. Get a month free." over "Their first paid month is free, and when they pay their first bill, you get a month free too."
- The three steps: "Send your link to another church, by text or email.", "They sign up, get 30 days free, then their first paid month free." and "30 days after they pay their first bill, a month free is taken off your next bill."
- The Your link card: the link, one Copy button and "Copy puts a short note and your link on your clipboard, ready to paste into a text or email."
  Copy copies the note and the link together and reads "Copied" for a moment, without changing size.
  The note: "Hi! At {church} we use Discipler to keep our discipleship relationships meeting week to week, and I think your church would love it. Sign up with our link and your first paid month is free: {link}"
- "Get a new link", a small plain text link under the help line, replaces the link at once with no question.
- "Your month free waits 30 days after their first payment, and is taken back if that payment is refunded. It shows on Billing when it is applied."
- There is no text box, no email draft and no list of invited churches; Discipler sends no invitations.
- The header's "Refer a church" (ticket 23) opens it.

## The rule

- The code and how it is made are ticket 20's.
- "Get a new link" retires the old code: the old link opens sign-up at the normal price, with no free month and no credit (James, triage 2026-10-31).
- "Ministry A invited Ministry B" is ticket 20's `referral` table, which this ticket reads.
- Referral events (Signed up, Paying, Credit applied) are recorded on the inviting church's own history with an opaque referral ID; no page lists them, and an applied credit shows on Billing.
- The credit is earned on the invited church's first invoice with `amount_paid > 0`, held 30 days, and cancelled on a refund or dispute in that window.
- It is one month of the inviting church's own price, $97 or $147 (Q79), applied as a negative customer balance transaction described as "Referral credit", made idempotent in Discipler's own table before Stripe is called.
- A shared payment fingerprint, a shared email domain, or the same Stripe customer sends the credit to James for review instead.
- A church billed outside Stripe (SAU BCM, Anthem) sees the page like any church; its earned credit is sent to James for review, to settle by hand (James, triage 2026-10-31).

## Acceptance

- A trial's $0 invoice earns no credit.
- A refund within 30 days cancels the credit.
- A retry after a day creates no second credit.
- After "Get a new link", the old link signs a church up with no free month and earns no credit.
- An invited church's first payment earns SAU BCM a credit that goes to James, not to Stripe.
- No page shows a church anything about the churches it invited, beyond a credit on Billing.
