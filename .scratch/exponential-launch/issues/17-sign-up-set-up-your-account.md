# 17 - Sign-up: set up your account

**What to build:** The "Set up your account" page, and opening the church from it through `provisionMinistry`.

**Blocked by:** 12, 16

**Status:** needs-info

## The page

Headed "Set up your account", with "* indicates required information" under it, asking in this order:

1. Church or organization name*.
2. Full name*.
3. Where did you hear about us? Optional: Instagram, Online (Google), A friend, Another ministry, Conferences, Other media. A referral link preselects Another ministry.
4. Login email, filled in, greyed out and locked.
5. Choose a password (minimum 8 characters)*.
6. Timezone, labelled optional, common zones with US zones first, preselected from the browser and never stored empty; validated against `Intl.supportedValuesOf('timeZone')`.
7. A checkbox agreeing to the Terms of Service and the Privacy Policy, each hyperlinked*.

There is no "Let {inviting church} know we joined" box; an invited church is never named to the church that invited it (James, mock-up 5).

**Start free trial** turns on only when every required field holds a real entry.

## Opening the church

- Turnstile is checked again with a fresh token.
- `provisionMinistry` in `src/platform/supabase/provisioning.ts` is reused: the account first, through the admin API, then one transaction for the church, the Person with the verified phone, the Admin membership, `ministry.opened`, the terms acceptance as an event carrying the terms version and time, the `ministry_setup` consent, the referral link if any, and spending the `pending_signup` row; on failure the account is discarded.
- The account carries the verified email, so the Admin can sign in with email or phone (ticket 21).
- The Admin is signed in at once.
- support@ is emailed about the new sign-up.
- The browser only ever sees refusal codes, never `MinistryNotProvisioned.reason`.

## Acceptance

- A double click opens one church.
- The button stays off while any required field is empty or the password is short.
- The timezone is never stored empty, and an invalid zone is refused.
- The new church has no subscription yet and cannot text until Checkout completes (ticket 05).

## For James

1. Approve the page in mock-up 1.
2. Decided 2026-10-29 (Q82): a church that abandons Checkout is kept with no subscription, and the Admin is sent to Checkout at the next sign-in.
   James added: the next day an automated reminder email goes to that lead, and none once Checkout completes.
   Its wording and send time are in mock-up 1.
