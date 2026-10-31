# SMS provider findings for Discipler (researched 2026-10-29)

Scope: Twilio billing automation, a five-provider comparison, cost at three sizes, and a recommendation for the conference around 2026-11-10.
Every claim cites the provider's own page.
Anything I could not confirm on a primary source is marked **unverified**.

Note on sources: Twilio's support.twilio.com articles return 403 to plain fetches.
I read them through the Help Center's own JSON API (`https://support.twilio.com/api/v2/help_center/en-us/articles/<id>.json`).
The URLs cited below are the human-readable article URLs for the same article IDs.

---

## 0. The finding that matters most for the conference: the current brand and campaign will cap out

This is not about billing, but it is the biggest launch risk I found.

- Discipler is on a **Low Volume Standard** brand with a **Low Volume Mixed** campaign.
  Twilio documents that Low Volume Standard allows "Up to 6,000 [segments per day] to US, based on a hard limit of 2,000/day to T-Mobile", at 3.75 MPS.
  Source: https://support.twilio.com/hc/en-us/articles/4407882914971-Comparison-between-Sole-Proprietor-Low-Volume-Standard-and-Standard-registration-for-A2P-10DLC
- The Low Volume Mixed campaign itself is capped too: "Low Volume Mixed use cases support up to 2,000 SMS segments and MMS per day toward T-Mobile ... regardless of Trust Score."
  Source: https://support.twilio.com/hc/en-us/articles/1260803965530-Pricing-and-Fees-for-A2P-10DLC-Service
- The T-Mobile cap is per EIN and shared across every brand and provider under that EIN. Over the cap, messages fail with error 30023, and the cap resets at midnight Pacific.
  Source: https://support.twilio.com/hc/en-us/articles/1260804800549-T-Mobile-Daily-Message-Limits-for-Long-Code-Messaging-with-A2P-10DLC
- Without secondary vetting, a non-Russell-3000 brand gets 2,000/day to T-Mobile and 4 MPS per major carrier.
  Source: https://support.twilio.com/hc/en-us/articles/4403988619163-Understanding-A2P-10DLC-Standard-Brand-Secondary-Vetting-Pricing
- What that means for Discipler, assuming T-Mobile is about 35% of recipients (my assumption, not a provider figure):
  - 100 churches x 100 people, with 4 texts a week spread evenly over 7 days, is about 5,700 segments/day to the US and about 2,000/day to T-Mobile. That is exactly at both caps.
  - If texts cluster on one day (for example 2 of the 4 weekly texts on check-in day), T-Mobile volume on that day is about 7,000, which is 3.5 times the cap.
  - Even about 30 churches of 100 people can hit 2,000/day to T-Mobile on a clustered day.
  - 4 MPS means a 10,000-text burst takes about 42 minutes to drain. Twilio queues up to 10 hours of a campaign's MPS, so it would queue, not fail.
    Source: https://support.twilio.com/hc/en-us/articles/115002943027-Understanding-Twilio-Rate-Limits-and-Message-Queues
- The fix on Twilio:
  1. Ask Twilio Support to apply secondary vetting to the existing LVS brand. Twilio says this is a manual support request "and you will be assessed the standard vetting fee" ($41.50).
     Source: https://support.twilio.com/hc/en-us/articles/4403988619163-Understanding-A2P-10DLC-Standard-Brand-Secondary-Vetting-Pricing
  2. Register a standard campaign (for example Mixed or Customer Care), because the Low Volume Mixed campaign stays at 2,000/day whatever the Trust Score.
     The fees are $15 to vet the campaign plus $10/month.
     Campaign vetting "currently takes up to 5 business days for standard use cases".
     Source: https://support.twilio.com/hc/en-us/articles/11587910480155-A2P-10DLC-Campaign-Vetting-FAQ
  3. A Messaging Service links to only one campaign at a time.
     Source: https://support.twilio.com/hc/en-us/articles/53502193289755-ISV-A2P-10DLC-Registration-Guide
- The Trust Score sets the new T-Mobile cap: 75-100 gets 200,000/day, 50-74 gets 40,000, 25-49 gets 10,000, and 1-24 gets 2,000.
  Twilio warns that "smaller organizations and those with less business presence will receive lower scores".
  A low score could leave Discipler at 2,000/day even after vetting.
  Sources: https://support.twilio.com/hc/en-us/articles/1260804800549-T-Mobile-Daily-Message-Limits-for-Long-Code-Messaging-with-A2P-10DLC and https://support.twilio.com/hc/en-us/articles/1260803225669-Message-throughput-MPS-and-Trust-Scores-for-A2P-10DLC-in-the-US
- **T-Mobile 49 numbers per campaign.** With one number per church, Discipler goes past 49 numbers on one campaign at the 50th church.
  - Telnyx: "As of September 2023, the T-Mobile Limit is 49 numbers." https://support.telnyx.com/en/articles/3679260-frequently-asked-questions-about-10dlc
  - Bandwidth: "T-Mobile has implemented a limit of 49 numbers per campaign". Going higher takes a Number Pool request, which can only be made on an approved campaign. https://www.bandwidth.com/support/en/articles/12823101-t-mobile-10dlc
  - Telnyx charges $50 one-time for a T-Mobile Number Pool request. https://support.telnyx.com/en/articles/5634625-10dlc-fees-and-charges
  - **Unverified:** I found no Twilio page that states how Twilio enforces the 49-number limit or what it charges for a pool.
  - Twilio separately caps a Messaging Service at 400 numbers by default, and support can raise it. https://support.twilio.com/hc/en-us/articles/4402434663195-How-Many-Twilio-Numbers-or-Senders-Can-I-Have-in-a-Messaging-Service
  - Twilio lists "snowshoeing" (spreading the same message across more numbers than needed to evade filtering) as a $1,000 T-Mobile fine. It says numbers used for a real purpose are not snowshoeing.
    https://support.twilio.com/hc/en-us/articles/4410588996123-U-S-Carrier-Penalties-for-Non-Compliant-Messaging
- **Possible structural compliance gap (needs a decision, not research):** Twilio's ISV guidance says that when a platform sends on behalf of customers, "A Brand represents the sender of a messaging use case, such as your customer's company". It also says the ISV should enter "that customer's details rather than your own".
  Source: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv
  If carriers see each church as the sender, one Discipler brand for all churches may be the wrong model on every provider.
  Per-church brands would also give each church its own EIN-level T-Mobile cap.
  **Unverified** whether this applies to Discipler's message content. I would put it to Twilio's 10DLC onboarding team (10dlc-onboarding@twilio.com is listed in the MPS article above).

---

## 1. Twilio billing automation

### Auto-recharge
- You set it in Console: Billing, then Settings, then Auto-recharge. It has three settings: "When balance goes below", "Bring my balance back up to", and a primary payment method.
  You can add a backup payment method "so a single declined card does not interrupt service".
  https://support.twilio.com/hc/en-us/articles/55716593773979-How-do-I-set-up-auto-recharge-for-my-Twilio-balance
- The lowest trigger is $10 ("Setting an auto recharge trigger for $10 - the lowest level we offer").
  The highest refill is "$2,000. Please, contact our Support if you need a higher value than $2,000".
  https://support.twilio.com/hc/en-us/articles/223135607-How-to-Configure-and-Remove-Auto-Recharge-Triggers-on-Twilio
- Twilio emails you if an auto-recharge fails.
  Twilio has "no maximum spend limit setting". Spend is tracked with triggers instead.
  https://support.twilio.com/hc/en-us/articles/49507358452635-About-Payment-Types
- Auto-recharge is not available on invoiced billing groups (same source as the setup article above).
- **API for auto-recharge: unverified / not found.** Every Twilio help article I read describes it as a Console setting only.
  I found no public REST endpoint for it. (Telnyx does have one, `PATCH /v2/payment/auto_recharge_prefs`, cited in section 2.)

### Postpaid / invoiced billing
- You need "a minimum committed contractual spend of at least $12k/year".
  The setup "takes between 2 to 5 weeks": a pricing conversation, a credit check that may ask for DUNS and financial statements, then a backend switch to postpaid.
  https://support.twilio.com/hc/en-us/articles/223135647-How-to-Set-Up-Billing-by-Invoice-for-Your-Twilio-Account
- Invoiced customers pay by ACH or wire.
  https://support.twilio.com/hc/en-us/articles/49507358452635-About-Payment-Types
- At the 100-church size (about $3.6k/month, section 3), Discipler would clear $12k/year easily. It is not reachable before 2026-11-10.

### Balance API
- `GET https://api.twilio.com/2010-04-01/Accounts/{AccountSid}/Balance.json` with basic auth. It returns `{"currency":"USD","balance":"12.29","account_sid":"AC..."}`.
  https://support.twilio.com/hc/en-us/articles/360025294494-How-to-Check-Your-Twilio-Account-Balance
- **Unverified:** I could not load a twilio.com/docs reference page for this resource (404). Mirrors say subaccounts do not expose a balance and that the figure can lag. I did not confirm either on a Twilio page.
- Use: the app's existing cron tick can poll this and alert (or block new Verify sends) below a floor. That is a check owned by the app, which does not depend on someone remembering to top up.

### Usage Triggers API (webhook)
- "A UsageTrigger is a webhook that notifies your application of usage thresholds."
  It fires on a usage category (for example `sms` or `totalprice`), with `TriggerBy` set to `count`, `usage` or `price`.
  `Recurring` can be `daily`, `monthly`, `yearly` or `alltime`. Twilio evaluates triggers "about once a minute", and each fires "once (at most) during its recurring interval".
  Each account can have up to 1,000 triggers. You cannot edit a trigger's value, so you delete it and create a new one.
  Twilio retries the callback three times after a 5xx, and each callback carries an idempotency token.
  https://www.twilio.com/docs/usage/api/usage-trigger
- Triggers watch **spend**, not **balance**. Use them for "daily spend passed $X" (a fraud or runaway-loop alarm) and the Balance API for "balance is low".
- Console also has low-balance email notifications. A default email fires at $5, and you can set your own threshold.
  https://support.twilio.com/hc/en-us/articles/223135607-How-to-Configure-and-Remove-Auto-Recharge-Triggers-on-Twilio

### What happens at zero
- "When your account balance reaches zero, your account will become suspended. While suspended, you will be blocked from all Twilio usage, including phone calls, video, messages and more."
  Recurring charges (numbers, campaign fees) keep billing. Numbers are "at risk of being reclaimed" after 90 days suspended.
  After you add funds, "Please allow for 5-10 minutes for the account reactivation process".
  https://support.twilio.com/hc/en-us/articles/223183248-Understanding-Account-Suspension-When-Twilio-Balance-Reaches-Zero
- Messages already queued when suspension hits fail with 30002: "Twilio accepted the message for queueing, but your account was suspended before Twilio could send it." The causes listed include "auto-recharge wasn't available".
  https://www.twilio.com/docs/api/errors/30002
- That includes Verify codes, so sign-in by phone code would also stop.

### Why a Console user cannot see Billing (new Console with organizations)
- Billing moved from accounts up to the **Organization / Billing Group** level, with new roles: Organization Owner/Admin, Organization Billing Admin, Organization Billing Viewer (these need a verified domain), Billing Group Admin and Billing Group Viewer.
  Only the Admin roles can "Add Funds", "Manage Payment Methods" and "Configure Auto-recharge". Viewers can only view.
  https://support.twilio.com/hc/en-us/articles/49919580137755-Overview-of-Billing-Roles-Permissions
- How users were moved over: on a single-account billing group, Account Owners, Admins and Billing Managers were "automatically uplifted" to Billing Group Admin.
  On a multi-account group, "Only users on the Primary Account are automatically uplifted; users on 'child' accounts must be granted access manually by an Org Admin." (same source)
- "If you cannot see certain pages, you may need to request an updated role from your Organization Owner."
  https://support.twilio.com/hc/en-us/articles/49919017748763-How-to-Navigate-Billing-in-the-Twilio-Console
- Without the permission, the auto-recharge actions are simply hidden.
  https://support.twilio.com/hc/en-us/articles/55716606268699-How-do-I-change-or-cancel-auto-recharge
- **Unverified:** the exact wording "Access is required ... contact your organization administrator". The articles above describe the cause but do not quote that message.
  Likely causes: the user is signed in to a subaccount, is on a non-primary account in a multi-account group, or holds an account-level role that was not uplifted. The Organization Owner can grant Billing Group Admin.

---

## 2. Provider comparison (US, 10DLC, list prices on 2026-10-29)

Carrier pass-through fees are set by the carriers and are nearly identical everywhere.
The real price difference is each provider's own platform fee.

| | Twilio | Telnyx | Bandwidth | Plivo | SignalWire |
|---|---|---|---|---|---|
| Platform fee, outbound SMS segment | $0.0083 [T1] | $0.004 [X1] | $0.004 [B1] | $0.0077 [P1] | $0.00415, one rate shown for both directions [S1] |
| Platform fee, inbound SMS segment | $0.0083 [T1] | $0.004 [X1] | Free [B2] | $0.0077 [P1] | $0.00415 (direction unclear) [S1] |
| Carrier fee, outbound (AT&T / T-Mobile / Verizon) | $0.0035 / $0.0045 / $0.005 [T1] | $0.0035 / $0.0045 / $0.0045 [X1] | $0.0035 / $0.0045 / $0.0045, rising to $0.005 from 10/1/2026 [B3] | $0.0035 / $0.0045 / $0.005 [P1] | $0.0035-$0.0100, not mapped per carrier [S1] |
| Carrier fee, inbound (AT&T / T-Mobile / Verizon) | $0.0035 / $0.0025 / none (my reading of the table) [T1] | $0.0035 / $0.0025 / none [X1] | $0.0035 / $0.0025 / none [B3] | $0.0035 / $0.0025 / NA [P1] | unverified |
| Local number / month | $1.15 [T1] | $1.00 + $0.10 SMS enablement [X2] | $0.35 (comparison table dated July 2021; **unverified** today) [B2] | $0.50 [P1] | $0.50 [S1] |
| Brand fee | $4.50 LVS, $46 Standard incl. $41.50 vetting [T2] | $4.50 + vetting at cost, no markup [X3] | $9; vetting $83 (marked up over TCR) [B4] | $4.50; vetting $41.50 optional [P2] | $4.50 [S1] |
| Campaign fees | $15 vetting; $1.50/mo Low Volume Mixed, $10/mo standard [T2] | $15 per review; $1.50 / $10 per month; first 3 months billed upfront [X3] | $3/mo Low Volume, $20/mo Standard; 3-month commitment [B4] | $15 vetting; $10/mo, or $1.50 Low Volume billed quarterly [P2] | $1.50 / $10 per month; DCA vetting $7.50; 3-month minimum [S1] |
| Billing | Prepaid + auto-recharge; invoicing at $12k/yr commit [T3] | "strictly pre-paid"; auto-recharge has an **API**; capped at 10 recharges in 24h [X4] | Sales-led; trial then contract; billing terms **unverified** [B2] | Prepaid + auto-recharge; committed-spend contracts exist (**unverified** terms) [P3] | Payment method required; prepaid model **unverified** [S2] |
| Support | Free plan with no guaranteed response; Production is the greater of $250 or 4% of spend [T4] | "Free 24/7 support" on every tier (vendor claim) [X5] | Sales and support via ticket [B1] | Free basic 24x7; premium has a 3h SLA (vendor claim, **unverified** terms) [P4] | unverified |
| Webhook security / Node | `X-Twilio-Signature` HMAC-SHA1; `validateRequest` in the Node library [T5] | Ed25519 signatures; Node SDK `webhooks.constructEvent` [X6] | unverified | unverified | unverified |
| OTP product | Verify: $0.05 per successful verification + $0.0083 per SMS [T6] | Verify: page conflicts, "$0.03 + SMS" vs "from $0.05" all-in [X7] | none confirmed | Verify: $0 verification fee, pay channel cost only [P5] | unverified |

Sources:
- [T1] https://www.twilio.com/en-us/sms/pricing/us (the Verizon long-code row shows two values in four columns, $0.005 and $0.007. I read these as SMS outbound and MMS outbound, consistent with the RCS row "$0.005 / $0 / $0.007 / $0". **Unverified** reading.) Also https://support.twilio.com/hc/en-us/articles/44609260499995-T-Mobile-Messaging-Carrier-Fee-Changes-January-2026
- [T2] https://support.twilio.com/hc/en-us/articles/1260803965530-Pricing-and-Fees-for-A2P-10DLC-Service and https://support.twilio.com/hc/en-us/articles/11587910480155-A2P-10DLC-Campaign-Vetting-FAQ
- [T3] https://support.twilio.com/hc/en-us/articles/49507358452635-About-Payment-Types
- [T4] https://www.twilio.com/en-us/support-plans
- [T5] https://www.twilio.com/docs/usage/webhooks/webhooks-security
- [T6] https://www.twilio.com/en-us/verify/pricing
- [X1] https://telnyx.com/pricing/messaging
- [X2] https://telnyx.com/pricing/numbers
- [X3] https://support.telnyx.com/en/articles/5634625-10dlc-fees-and-charges (its carrier-fee lines, for example T-Mobile $0.003, are older than the pricing page. I used the pricing page.)
- [X4] https://support.telnyx.com/en/articles/1130661-does-telnyx-offer-post-paid-service, https://support.telnyx.com/en/articles/4280500-billing-setup-billing-groups, https://developers.telnyx.com/api-reference/autorechargepreferences/update-auto-recharge-preferences.md
- [X5] https://telnyx.com/mission-control (marketing claim)
- [X6] https://developers.telnyx.com/docs/messaging/messages/receiving-webhooks
- [X7] https://telnyx.com/pricing/verify
- [B1] https://www.bandwidth.com/pricing/
- [B2] https://www.bandwidth.com/products/sms-messaging/
- [B3] https://www.bandwidth.com/support/en/articles/12823178-carrier-surcharges
- [B4] https://www.bandwidth.com/support/en/articles/12823086-10dlc-fees
- [P1] https://www.plivo.com/sms/pricing/us/
- [P2] https://www.plivo.com/docs/messaging/a2p-10dlc/quickstart
- [P3] https://support.plivo.com/hc/en-us/articles/360041448592-What-s-the-minimum-amount-I-can-charge-to-my-Plivo-account
- [P4] https://www.plivo.com/blog/cpaas-technology-lessons-support/ (vendor blog)
- [P5] https://www.plivo.com/verify/pricing/
- [S1] https://signalwire.com/pricing/messaging
- [S2] https://developer.signalwire.com/messaging/getting-started/campaign-registry/registration/

### Are 10DLC rules the same everywhere?
Yes for the substance, because they come from TCR and the carriers, not from the provider.
- Twilio calls campaign vetting "an industry-wide requirement ... Every messaging provider who services A2P Campaigns is required to conduct this vetting." https://support.twilio.com/hc/en-us/articles/11587910480155-A2P-10DLC-Campaign-Vetting-FAQ
- The T-Mobile daily tiers (2,000 / 10,000 / 40,000 / 200,000 by Trust Score) appear on Twilio, Telnyx and Bandwidth. All three say the cap is per brand/EIN and shared across providers. Sources are in section 0.
- The 49-numbers rule is T-Mobile's (Telnyx and Bandwidth, section 0).
- The $250 T-Mobile fee for a campaign with no use in 60 days is passed through by Bandwidth (https://www.bandwidth.com/support/en/articles/12823101-t-mobile-10dlc) and by SignalWire (https://signalwire.com/blogs/industry/t-mobiles-non-use-fee-explained). It matters if a Twilio campaign sits idle after a switch.
- What differs is markup and packaging. For example, Bandwidth charges a $9 brand fee against TCR's $4.50, and $20/month for a standard campaign against $10 elsewhere.

### Can the existing TCR brand and campaign move from Twilio?
- In practice, no, not quickly. Discipler registered through Twilio's Trust Hub, so **Twilio is the CSP of record**.
- CNP migration (moving a campaign to a new connectivity partner without re-vetting) only works for the CSP of record:
  - Bandwidth: "The migration tool only works if you are the registered Campaign Service Provider (CSP) of record." https://www.bandwidth.com/blog/cnp-migrations-for-10dlc/
  - Bandwidth's migration guide: if someone else is your CSP, "you first need to complete the CSP migration and then you'll move on to the CNP migration".
    That means registering as a CSP with TCR ($200), and "CSP applications typically take 2-3 weeks and cannot be expedited". Both CSPs then sign TCR's letter.
    https://www.bandwidth.com/support/en/articles/13047162-10dlc-campaign-migration-guide
  - Telnyx's shared-campaign import also needs your own CSP ID ("usually takes up to two business days" to link). https://support.telnyx.com/en/articles/5617538-10dlc-shared-campaigns
  - Plivo's campaign import is "currently in private beta" and needs the campaign shared from your TCR portal. https://docs.plivo.com/docs/messaging/api/10dlc/campaign/import-a-campaign
  - Twilio's CNP migration support (Dec 2024, $8 per campaign) is documented only for campaigns moving **into** Twilio. https://twilio.com/en-us/changelog/-u-s--a2p-10dlc--launching-support-for-cnp-migration-
  - **Unverified:** whether Twilio will sign a CSP-migration letter to release a Trust Hub campaign.
- The realistic path is to register a fresh brand and campaign at the new provider (cheap: $4.50 + $15, but vetting takes days), then port the numbers.
  - Telnyx says to create campaigns and wait for approval first, then port, and to have the old provider remove its campaigns before the port completes, or the ported numbers cannot be assigned. https://support.telnyx.com/en/articles/3679260-frequently-asked-questions-about-10dlc
  - Port time: Telnyx puts a simple US port at an estimated 7 business days and non-simple ports at 15+, worked Monday to Friday. https://support.telnyx.com/en/articles/1130630-porting-policy-procedure
    FastPort-eligible numbers can port the same day. https://developers.telnyx.com/docs/numbers/porting/getting-started
  - Twilio emails you to confirm each port-away, and you get the PIN from porting@twilio.com. https://support.twilio.com/hc/en-us/articles/223179588-How-Do-I-Port-My-Phone-Numbers-Away-From-Twilio

---

## 3. Monthly cost estimates

Assumptions (mine, not providers'):
- 4 outbound + 3 inbound single-segment SMS per person per week, and 52/12 = 4.33 weeks per month.
- Carrier mix: 30% AT&T, 35% T-Mobile (including US Cellular), 35% Verizon.
- One local number per church.
- List prices with no volume discount. Twilio says volume pricing exists but publishes no tiers (https://support.twilio.com/hc/en-us/articles/223134007-Does-Twilio-Provide-Volume-Pricing-for-SMS-Messages).
- Campaign fee is $1.50 at the smallest size and $10 above, assuming a standard campaign is needed per section 0.
- Excluded: one-time fees ($41.50 vetting, $15 campaign, any number-pool fee), Verify, MMS, taxes, and any Twilio support plan.

Blended cost per segment, platform fee plus carrier fee:
- Twilio: $0.01267 outbound, $0.01022 inbound.
- Telnyx: $0.00820 outbound, $0.00592 inbound.

| Size | Outbound / inbound segments per month | Twilio total | of which carrier fees | Telnyx total | Saving with Telnyx |
|---|---|---|---|---|---|
| 10 churches x 50 people | 8,700 / 6,500 | **~$189** | ~$50 | **~$122** | ~$67 (35%) |
| 100 x 100 | 173,000 / 130,000 | **~$3,650** | ~$1,010 | **~$2,310** | ~$1,340 (37%) |
| 500 x 100 | 867,000 / 650,000 | **~$18,200** | ~$5,040 | **~$11,500** | ~$6,700 (37%) |

Notes on the table:
- Breakdowns: Twilio's numbers cost $12 / $115 / $575 and Telnyx's $11 / $110 / $550. Platform message fees are Twilio $126 / $2,518 / $12,588 against Telnyx $61 / $1,213 / $6,067.
- Bandwidth's platform fee for outbound is the same as Telnyx's and inbound is free, so it would come out slightly cheaper again. But it is sales-led, has a 3-month campaign commitment, and its number price is **unverified**, so I do not count it as the cheapest *credible self-serve* option for this timeline.
- Plivo lands between the two: about $174 / $3,400 / $17,000.
- Daily cash burn at 500 x 100 on Twilio is about $600/day. Twilio's $2,000 auto-recharge maximum covers more than 3 days per refill.

---

## 4. Recommendation

**Stay on Twilio for the conference. Revisit Telnyx after the conference.**

Why not switch now:
- Switching 12 days out means a new brand and campaign (vetting "up to 5 business days" at Twilio, and comparable at others, **unverified** for Telnyx) and a port of every church number (estimated 7 business days for a simple port at Telnyx).
- The quick CNP-migration path is closed, because Twilio is the CSP; becoming your own CSP alone takes 2-3 weeks.
- It also means rewriting the send, webhook, signature and Verify code, plus a new opt-out store and new production verification on real phones.
- Any slip lands on launch day, and a failure would stop every church's texts, which is the exact outcome this is meant to prevent.
- The saving at conference scale is about $67/month (10 churches) to $1,340/month (100 churches). That is real but not worth that risk.

What to do on Twilio before 2026-11-10, in priority order:
1. **Start the brand upgrade today.** Ask Twilio Support for secondary vetting on the LVS brand ($41.50), and register a standard campaign ($15 + $10/month, up to 5 business days).
   Otherwise the 2,000/day T-Mobile cap is likely to bite at about 30 or more churches. This is the long pole, and 12 days only just covers it.
   At the same time, ask Twilio how the 49-numbers-per-campaign T-Mobile rule applies to one number per church, and whether Discipler should register churches as their own brands (ISV model).
2. **Turn on auto-recharge with a backup card.** For example, below $100 bring back to $500, raised as volume grows. It is capped at $2,000 per refill without support. This needs a user with Billing Group Admin or Organization Billing Admin; if the menu is missing, the Organization Owner grants it.
3. **Make the app guard itself, not a person.** On the existing cron tick, poll `Balance.json` and alert James (and ideally page) below a floor set well above the auto-recharge threshold. Add a daily `totalprice` Usage Trigger webhook as a runaway-spend alarm. Change the default $5 low-balance email to a higher threshold.
4. **Watch the T-Mobile cap after launch.** Track 30023 errors, which mean the T-Mobile daily cap was hit, and Twilio's Messaging Insights.

After the conference:
- If spend is heading past about $1k/month, either apply for Twilio invoicing ($12k/year commit, 2-5 weeks, which removes the prepaid risk entirely), or plan a Telnyx move.
- Telnyx is about 37% cheaper at scale, with free 24/7 support, an auto-recharge API and Ed25519 webhooks. Its catches are that it is prepaid only and capped at 10 recharges a day.
- Do a Telnyx move as a staged cutover: register the brand and campaign there first, port numbers in batches, and run both providers side by side behind the app's messaging port.
- Carrier fees (about 28% of the Twilio bill) and all 10DLC rules come with Discipler to any provider.
