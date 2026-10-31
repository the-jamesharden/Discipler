# Discipler SMS scaling findings (researched 2026-10-29)

Research only.
Nothing in the repo or in any Twilio account was changed.
Twilio Help Center articles were read through the Help Center's public article API, so the "updated" dates below are Twilio's own.
Every claim carries a source URL.
Anything marked **UNVERIFIED** could not be confirmed from a primary source.

## 0. The two findings that matter most

1. **The binding constraint at the conference is not number count, it is the Low volume standard brand's daily cap.**
   A Low-Volume Standard brand that is not in the Russell 3000 gets 2,000 SMS segments plus MMS per day to T-Mobile, counted per EIN across every brand, campaign and provider, reset at midnight Pacific.
   Source: https://support.twilio.com/hc/en-us/articles/1260804800549 (updated 2026-10-27), https://support.twilio.com/hc/en-us/articles/4403988619163 (updated 2026-09-30).
   Twilio puts the overall equivalent at about 6,000 per day to all US carriers.
   Source: https://support.twilio.com/hc/en-us/articles/4407882914971.
   Messages over the cap fail with error 30023 until the next Pacific day.
   Source: https://www.twilio.com/docs/api/errors/30023.
   Adding campaigns or numbers does not raise this cap, because it is per EIN.
2. **Discipler's own product rules match Twilio's published signs of an ISV, not a direct brand.**
   Twilio's February 2026 rearchitecture guide lists "You want the messages you send to look like they came from your customer directly instead of from the ISV" and "You set up A2P campaigns and use toll-free numbers on a per-customer basis instead of a per-use case basis" as indicators that a direct customer is really an ISV.
   Source: https://www.twilio.com/en-us/blog/developers/best-practices/direct-customer-to-isv-rearchitecture-guide.
   `docs/product-rules.md` says "A participant should feel they are interacting with their church, not with a software vendor" and "Each ministry sends from its own number", and `src/domain/outbound-copy.ts` says Discipler "does not name itself in copy" outside four compliance occasions.
   Against that, Twilio also says template-only messaging "with little to no customization or control by your clients" may still be Direct.
   Source: https://support.twilio.com/hc/en-us/articles/4402930862747.
   Twilio, not Discipler, makes this call, and the answer decides whether options (a) and (b) are available at all.
   Get it in writing from Twilio Support before the conference.

## 1. Number and campaign limits, verified now

### Numbers per campaign (the "T-Mobile 49")

- **Confirmed as a carrier and registry rule.**
  The Campaign Registry's CSP User Guide (July 2026) describes the campaign attribute "NUMBER POOLING: Select this if you intend on using 50+ numbers as this will require a different provisioning process on T-Mobile."
  Source: https://www.campaignregistry.com/wp-content/uploads/CSP-User-Guide_Jul_2026_v2.pdf (section 03, Campaign Registration).
- Bandwidth, another CSP, enforces it: "The number of TNs that can be associated with a single 10DLC Campaign is now limited to 49, unless the customer has been approved for a Sub ID ... consistent with T-Mobile's policy", and returns an error at 50 or more.
  Source: https://www.bandwidth.com/release-notes/capping-tns-for-10dlc-campaigns/.
  Bandwidth's T-Mobile article adds that a T-Mobile Number Pool is the route past 49, is T-Mobile only, can only be requested for an already approved campaign, and that "Brands supported by an ISV must each register on their own campaign instead of using a Number Pool."
  Source: https://www.bandwidth.com/support/en/articles/12823101-t-mobile-10dlc.
  These are a CSP's pages, not T-Mobile's; the T-Mobile Code of Conduct itself was not found online.
- **UNVERIFIED for Twilio.**
  No Twilio doc or Help Center article states a 49-number cap, a Number Pool request process, or what Twilio does at number 50.
  Twilio's UsAppToPerson create API has no number-pooling field.
  Source: https://www.twilio.com/docs/messaging/api/usapptoperson-resource.
  Twilio says any number added to the campaign's Messaging Service is automatically associated with the campaign.
  Source: https://support.twilio.com/hc/en-us/articles/4402888763803.
  So at Twilio the 50th number may be accepted and then fail T-Mobile registration, or be refused; ask Support.
  Third-party CSP pages quote a $2,000 T-Mobile Number Pool fee and up to two weeks of processing (UNVERIFIED, not primary).
- Exception that does not fit Discipler: the Agents, Franchises and Local Branches special use case allows up to 5,000 numbers per campaign, needs carrier post-approval and a brand score of at least 25, costs $30/month, but "Franchises/businesses with a separate EIN should register as a separate brand."
  Source: https://support.twilio.com/hc/en-us/articles/4402972441243.
  Churches are separate organizations with their own EINs, so this use case is not for them.

### Campaigns per brand

- Twilio: "A Brand can have up to five Campaigns associated with it."
  Source: https://support.twilio.com/hc/en-us/articles/52182476727195 (updated 2026-10-27).
  The API guide adds "unless a clear and valid business reason is provided for exceeding this limit."
  Source: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv-api.
  The process to raise it is not documented beyond that sentence (UNVERIFIED).
- TCR's own default is 50 campaigns per brand, raised by emailing support@campaignregistry.com.
  Source: https://www.campaignregistry.com/wp-content/uploads/CSP-User-Guide_Jul_2026_v2.pdf.
- Twilio error 30930 says TCR enforces a maximum of 100 campaigns per brand.
  Source: https://www.twilio.com/docs/api/errors/30930.
  The TCR figure (50) and Twilio's error page (100) conflict; both are above Twilio's own 5.
- Twilio also lists a "maximum Campaigns per Use Case" of 200 for private and public profit brands.
  Source: https://support.twilio.com/hc/en-us/articles/1260801844470.
- Each Tax ID can register up to five Standard or Low-Volume Standard brands.
  Source: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc.
  A Direct profile "can only register their own Brand"; more than one needs Support.
  Source: https://support.twilio.com/hc/en-us/articles/1260804728069.

### Numbers per Messaging Service

- 400 long codes by default; adding a 401st returns error 21714; Support can raise it on request with Account SID, Messaging Service SID, requested count and use case.
  Sources: https://support.twilio.com/hc/en-us/articles/4402434663195, https://www.twilio.com/docs/api/errors/21714.
- For US traffic, error 21714's own advice is a toll-free number or short code rather than more local numbers.
  Source: https://www.twilio.com/docs/api/errors/21714.
- A Messaging Service can be linked to only one campaign at a time.
  Source: https://support.twilio.com/hc/en-us/articles/52182476727195.
  So in practice the T-Mobile 49 binds long before Twilio's 400.

### Throughput is per campaign, not per number

- "A set maximum MPS is granted for each of your registered campaigns ... This MPS is shared across all US/Canada long code numbers allocated to your campaign."
  Source: https://support.twilio.com/hc/en-us/articles/1260803225669.
- Low Volume Mixed campaign: 3.75 SMS MPS total, 1.25 each to AT&T, T-Mobile and Verizon, regardless of Trust Score.
  Same source.
- Twilio queues up to 10 hours of segments at the campaign's MPS.
  Source: https://support.twilio.com/hc/en-us/articles/115002943027.
- Adding numbers purely for throughput is "snowshoeing", which Twilio and carriers discourage or penalize.
  Sources: https://support.twilio.com/hc/en-us/articles/115002943027, https://support.twilio.com/hc/en-us/articles/4410588996123, CTIA 5.5.2 at https://api.ctia.org/wp-content/uploads/2023/05/230523-CTIA-Messaging-Principles-and-Best-Practices-FINAL.pdf.
  Twilio says many numbers are not snowshoeing when there is a real reason such as "numerous business locations."
  Source: https://support.twilio.com/hc/en-us/articles/1260803966670.

### Rough volume check (assumptions, not sourced)

Assume 25 participants per church, 4 texts per participant per week, about 3 of them on check-in day, and about one third of recipients on T-Mobile (all UNVERIFIED assumptions).
That is about 75 segments per church on its check-in day, or about 25 to T-Mobile.
The 2,000 T-Mobile cap is then reached at about 80 churches sharing a check-in day, and sooner if texts run to two segments.
Discipler's rates line and stacked prefixes already push some texts to two segments (`docs/product-rules.md`, Starter Message note), and a curly quote or emoji switches a segment to 70 characters.
At 1.25 MPS to T-Mobile, 2,000 segments take about 27 minutes to drain, so check-in "hour" stretches out.

## 2. Architectures compared

Prices used: local number $1.15/month, toll-free $2.15/month, $0.0083 per SMS segment each way, plus carrier fees (T-Mobile $0.0045 out and $0.0025 in, AT&T $0.0035, Verizon $0.005 out; the Verizon row alignment on the page is unclear).
Sources: https://www.twilio.com/en-us/sms/pricing/us, https://support.twilio.com/hc/en-us/articles/44609260499995.
10DLC campaign fees: $15 one-time vetting, then $1.50/month Low Volume Mixed or $10/month Standard.
Source: https://support.twilio.com/hc/en-us/articles/1260803965530.

| | (a) Number per church, several campaigns | (b) Shared pool with Sticky Sender | (c) Toll-free | (d) Short code |
|---|---|---|---|---|
| Fixed monthly at 300 churches | ~$345 numbers + $10 per campaign (7 campaigns = $70) | a few numbers, $10 campaign | one per church: ~$645; one shared: $2.15 | ~$917 ($11,000/year) + $1,000 setup |
| Throughput | per campaign; 7 campaigns each get their own MPS | one campaign's MPS, extra numbers add none | 3 MPS per number by default | 100 MPS by default |
| Daily cap | T-Mobile per-EIN cap shared by all campaigns | same | no T-Mobile per-EIN 10DLC cap (daily caps on toll-free UNVERIFIED) | not documented here (UNVERIFIED) |
| Compliance | needs Direct classification plus a way past 49 | needs Direct classification; impossible as ISV | shared number across churches is a named rejection reason | shared short codes not permitted |
| Setup time | days per campaign; Number Pool timing UNVERIFIED | days | 3-5 business days per number | few weeks + 4-8 weeks carrier |

### (a) One number per church (status quo) across several campaigns

- Needs one campaign per 49 numbers, so 300 churches means 7 campaigns, above Twilio's default 5 (see section 1).
- Several campaigns with the same use case and content risk being seen as duplicates; Twilio says "Creating multiple brands with the same EIN or duplicate campaigns can slow down your approval."
  Source: https://support.twilio.com/hc/en-us/articles/11847054539547.
  Whether TCR or Twilio vetting accept split-for-capacity campaigns is UNVERIFIED; the T-Mobile Number Pool is the carrier-sanctioned alternative.
- It is also Twilio's third ISV indicator (per-customer numbers), see section 0.
- Deliverability is best of the long-code options: each church has a stable local number, and STOP to that number only blocks that church's sender (Twilio records opt-outs per number, and per Messaging Service only when sending by Messaging Service SID).
  Source: https://support.twilio.com/hc/en-us/articles/223134027.
- Code changes: provisioning must pick a Messaging Service with room under 49 and track counts; each new Messaging Service needs the inbound webhook, because "the phone number configuration will be overwritten by the Messaging Service configuration settings."
  Source: https://support.twilio.com/hc/en-us/articles/4402888763803.
  Sending is unchanged (`message-transport.ts` already posts an explicit `From`).
  Per-church numbers also make the `.scratch/shared-numbers` problem solvable, because `To` then names the Ministry.

### (b) Shared pool with Sticky Sender

- Sticky Sender maps each recipient to one `From` number per Messaging Service, only when sending by `MessagingServiceSid`.
  Sources: https://support.twilio.com/hc/en-us/articles/223181288, https://www.twilio.com/docs/messaging/services#sticky-sender.
  The mapping is per recipient, not per (Ministry, recipient), so a person in two churches gets both churches' texts from the same number, which keeps the shared-numbers ambiguity and removes `To` as a fix.
- STOP becomes cross-church: a STOP to a shared number blocks that number for that person for every church, and also blocks the Messaging Service when sending by SID.
  Source: https://support.twilio.com/hc/en-us/articles/223134027.
  That breaks the product rule that `STOP` "opts a congregant out of their Ministry" (`app/sms/inbound/route.ts`).
- Compliance: possible only if Discipler is the single Direct brand.
  Under 10DLC a number belongs to one Messaging Service, one campaign, one brand, so if Twilio classifies Discipler as an ISV, numbers cannot be shared across church brands.
  Sources: https://support.twilio.com/hc/en-us/articles/52182476727195, https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv.
  CTIA 5.5.1: shared numbers "among multiple persons, businesses, entities, or organizations may require special arrangements" with providers.
  Source: https://api.ctia.org/wp-content/uploads/2023/05/230523-CTIA-Messaging-Principles-and-Best-Practices-FINAL.pdf.
  Naming the church as the sender while the registered brand is Discipler is the mismatch Twilio reviewers flag: "If you register as 'Acme Inc' but your messages say 'Contoso,' reviewers will flag that mismatch."
  Source: https://support.twilio.com/hc/en-us/articles/11847054539547.
- No throughput gain: MPS is per campaign (section 1).
- Code changes: Ministry sending identity becomes a pool; switch to `MessagingServiceSid` sending; rework opt-out to be cross-ministry; inbound is unchanged because it already routes by `From`.
- Not recommended.

### (c) Toll-free

- Business Registration Number: optional from 2025-09-30, mandatory for all new verifications from 2026-02-17; for US entities the EIN must match the IRS CP 575 or 147C legal name exactly, no DBA unless legally primary.
  Source: https://support.twilio.com/hc/en-us/articles/38266268244507.
  API fields: `BusinessRegistrationNumber`, `BusinessRegistrationAuthority`, `BusinessRegistrationCountry` are "Required for all business types except SOLE_PROPRIETOR."
  Source: https://www.twilio.com/docs/messaging/compliance/toll-free/api-onboarding.
- Verification: about 3-5 business days; unverified and pending numbers are blocked (error 30032).
  Source: https://support.twilio.com/hc/en-us/articles/5377174717595.
  Monthly volume must be declared from fixed increments; more than 5 numbers for one business needs justification.
  Source: https://support.twilio.com/hc/en-us/articles/13264118705051.
- Throughput: 3 MPS per number by default, raisable via Sales; using several toll-free numbers for the same use case just for MPS is not acceptable.
  Source: https://support.twilio.com/hc/en-us/articles/4411046744987.
- **Why one Discipler toll-free for all churches would be rejected**: error 30478 "Toll-Free Number Cannot Be Shared Across Multiple Businesses", and 30474 "ISVs must register each client through an individual submission with a dedicated Toll-Free number (no shared numbers)."
  Source: https://support.twilio.com/hc/en-us/articles/9321443984155 (updated 2026-09-10).
  The ISV exception applies only when "the ISV is the sole content creator, sending messages on their own behalf, or the content is branded with the ISV's name."
  Source: https://support.twilio.com/hc/en-us/articles/13264118705051.
  Discipler's texts are branded with the church name, so the exception likely fails.
  Other common rejection reasons: BRN missing or mismatched (30472), business name not matching records (30484), inaccessible website (30473), and consent or CTA gaps (30568-30570, 30547).
  Same source as 30478.
- Toll-free per church is viable as an ISV-shaped path: each church's own legal name, EIN, website and contact, one number each, about $2.15/month plus 3-5 business days.
  Carriers also handle STOP on toll-free, so opt-out is outside Twilio too.
  Source: https://support.twilio.com/hc/en-us/articles/360038173654.
- Code changes: provisioning buys a toll-free number per church and submits a TollfreeVerification by API; church onboarding must collect EIN and legal name; sending and inbound are otherwise unchanged.

### (d) Short code

- US: $1,000 setup, $3,000 per quarter or $11,000 per year for a random code, $4,500 per quarter vanity, $500 MMS enablement.
  Source: https://support.twilio.com/hc/en-us/articles/226460288.
- Timing: Twilio review "a few weeks", then "about 4-8 weeks" carrier approval after payment.
  Source: https://support.twilio.com/hc/en-us/articles/30888460607003.
- 100 SMS per second by default.
  Source: https://support.twilio.com/hc/en-us/articles/360038173654.
- "Twilio does not offer shared short codes ... Shared short codes are not permitted in the US and Canada"; the only exception is template OTP.
  Source: https://support.twilio.com/hc/en-us/articles/223134607.
  A Discipler short code for all churches would therefore have to be a Discipler program, which contradicts the church-voice rule.
- Not available for the conference and not a fit for the product.

### Direct brand vs ISV: when each church must be its own secondary brand

- Twilio's tests: who recipients think the message is from, and how much the client controls content.
  Source: https://support.twilio.com/hc/en-us/articles/4402930862747.
  Discipler: content is Discipler templates (Direct signal); consent is collected by Discipler's own intake form (Direct signal); the consent text says "from {{ministry_name}} through Discipler" and copy speaks as the church (ISV signal); one number per church (ISV signal).
- If ISV, each church needs its own Secondary Customer Profile, Brand and campaigns, using the church's details, never Discipler's.
  Sources: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv, https://support.twilio.com/hc/en-us/articles/11847054539547.
  Twilio's preferred layout is a subaccount per customer; Discipler's current layout (no subaccounts, one Messaging Service not mapped to customers) is ISV architecture #5, which Twilio calls "incompatible with A2P 10DLC."
  Source: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv.
  A church verified as 501(c)(3) is limited to the Charity use case ($3/month, T-Mobile fees waived, 120 MPS).
  Sources: https://support.twilio.com/hc/en-us/articles/4402972441243, https://support.twilio.com/hc/en-us/articles/1260803225669.
  Conflict: the Help Center says "Any organization registered as 501(c)(3) is eligible" including religious ones, while the Twilio docs say Charity "Does not include religious organizations."
  Sources: https://support.twilio.com/hc/en-us/articles/4402972441243, https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/collect-business-info.
  Whether churches that never filed for an IRS determination pass TCR's automated 501(c)(3) check is UNVERIFIED.
- ISV code changes: per-church subaccount credentials in `message-transport.ts`; inbound signature check must use the subaccount's own auth token instead of the single `TWILIO_AUTH_TOKEN`; an onboarding flow that collects each church's EIN, legal name, address, website and authorized representative and drives the Trust Hub and A2P APIs.
- Twilio warns that registering as Direct when you are an ISV "can lead to problems with compliance and billing."
  Source: https://www.twilio.com/en-us/blog/developers/best-practices/direct-customer-to-isv-rearchitecture-guide.

## 3. Upgrading Low volume standard to Standard

### Caps

| | Low Volume Standard brand | Standard brand (after secondary vetting) |
|---|---|---|
| T-Mobile per day, per EIN | 2,000 (200,000 if Russell 3000) | score 1-24: 2,000; 25-49: 10,000; 50-74: 40,000; 75-100: 200,000 |
| Overall US per day | about 6,000 | not stated by Twilio (UNVERIFIED) |
| MPS, Low Volume Mixed campaign | 3.75 total | 3.75 total, regardless of score |
| MPS, standard use case | 12 total (4 per carrier) | 12 / 120 / 225 total by score |

Sources: https://support.twilio.com/hc/en-us/articles/1260804800549, https://support.twilio.com/hc/en-us/articles/4407882914971, https://support.twilio.com/hc/en-us/articles/1260803225669, https://support.twilio.com/hc/en-us/articles/4403988619163.
Above 200,000 needs T-Mobile Special Business Review.
Source: https://support.twilio.com/hc/en-us/articles/4403550579739.
AT&T and Verizon daily caps were not found in Twilio's docs (UNVERIFIED).
Trust Score drivers: data matching the EIN record exactly, and "a small brand footprint" scores lower; appeals usually need the IRS EIN letter.
Source: https://support.twilio.com/hc/en-us/articles/1260803225669.

### In-place upgrade

- **Exists, through Support, not a button.**
  "If I opt-out of Secondary Vetting for a client now, can I have that client vetted in the future? Yes, simply contact Twilio Support and let us know the Account SID, Brand SID, and name ... Secondary Vetting will be applied manually and you will be assessed the standard vetting fee."
  It "is a manual process" and "may take time to process."
  Source: https://support.twilio.com/hc/en-us/articles/4403988619163.
  No console button or documented self-serve API was found (UNVERIFIED).
  The Vettings API lists `aegis` ("Secondary Vetting") as a provider, but is documented only for Campaign Verify tokens; whether it can trigger vetting on an existing brand is UNVERIFIED.
  Source: https://www.twilio.com/docs/messaging/api/brand-vetting-resource.
- A new Standard brand is the alternative, but a Direct profile needs Support for a second brand.
  Source: https://support.twilio.com/hc/en-us/articles/1260804728069.
- Cost: $41.50 vetting (total Standard brand $46).
  Source: https://support.twilio.com/hc/en-us/articles/1260803965530.

### Existing campaign and numbers

- The Low Volume Mixed campaign stays at the lowest tier "regardless of your Trust Score."
  Source: https://support.twilio.com/hc/en-us/articles/1260803225669.
  A campaign's use case cannot change after creation, and a vet applies only to campaigns registered after it unless resubmitted.
  Source: https://www.campaignregistry.com/wp-content/uploads/CSP-User-Guide_Jul_2026_v2.pdf.
  Approved campaigns cannot be edited; a new one must be submitted.
  Source: https://support.twilio.com/hc/en-us/articles/4402888955163.
- So a **new campaign must be registered** with a standard use case.
  Twilio's guidance: "You can keep using the Low-Volume campaigns until the new Standard campaigns are approved," then move the numbers.
  Source: https://www.twilio.com/en-us/blog/developers/best-practices/direct-customer-to-isv-rearchitecture-guide.
  Register it on a new Messaging Service, because a Messaging Service holds one campaign and reusing one "pose[s] a risk of service interruption for up to several weeks."
  Source: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/transition-sole-proprietor-to-standard-brand.
  Moving a number between Messaging Services deregisters and re-registers it.
  Source: https://support.twilio.com/hc/en-us/articles/223181288.
  Conflict: that blog says Low-Volume Standard brands "can only register Low Volume Mixed campaigns", while the MPS article lists standard use cases for LVS brands at 12 MPS.

### Review times

Customer Profile 72 hours or more; brand at TCR usually minutes, manual review 7 business days or more; campaign up to 5 business days, Support after 10.
Source: https://support.twilio.com/hc/en-us/articles/52182476727195.
The rearchitecture blog says campaigns are "typically about 7 business days."
Source: https://www.twilio.com/en-us/blog/developers/best-practices/direct-customer-to-isv-rearchitecture-guide.
The Support-applied secondary vet has no published time (UNVERIFIED).

### Use case

- `ACCOUNT_NOTIFICATION` is "Notifications about the status of an account or related to being a part of an account"; `MIXED` needs 2 to 5 sub use cases and is "likely to have lower throughput and a higher cost per message"; `LOW_VOLUME` is fixed at the lowest tier.
  Sources: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/collect-business-info, https://www.campaignregistry.com/wp-content/uploads/CSP-User-Guide_Jul_2026_v2.pdf.
- Judgment: check-ins, welcome, invitation and keyword replies are all about a person's participation in their church's program, so `ACCOUNT_NOTIFICATION` is the closest single declared use case, and the Admin test check-in is the same message to an Admin, so it belongs in the same campaign.
  If vetting says the conversational replies make it mixed, fall back to `MIXED` with `ACCOUNT_NOTIFICATION` + `CUSTOMER_CARE`.
  Both cost $10/month.
  Whether a reviewer accepts `ACCOUNT_NOTIFICATION` for this content is UNVERIFIED.

## 4. Standard brand and campaign registration, step by step

Console access needs the Owner or Admin role.
Source: https://support.twilio.com/hc/en-us/articles/52182476727195.

1. **Primary Customer Profile** (exists already).
   Console only: "You can only create Primary Customer Profiles in the Console."
   Source: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv.
2. **Secondary vetting on the existing brand.**
   Support ticket with Account SID, Brand SID and name; $41.50.
   Source: https://support.twilio.com/hc/en-us/articles/4403988619163.
   Or, if Support says a new brand is required, the fields are below.
3. **Brand fields** (Trust Hub EndUser `customer_profile_business_information`, `authorized_representative_1`, Address, SupportingDocument, TrustProduct with `us_a2p_messaging_profile_information`, then BrandRegistration).
   Source: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/collect-business-info.
   - Business: `business_name` exactly as on the CP 575/147C; `business_type` (LLC is "Limited Liability Corporation"); `business_industry`; `business_registration_identifier` = EIN; `business_registration_number` in `00-0000000` form; `website_url` (must load, not login-gated, not redirect to another brand); `social_media_profile_urls` (optional); `business_identity` (`direct_customer` or `isv_reseller_or_partner`); `business_regions_of_operation`.
   - Authorized representative: `first_name`, `last_name`, `business_title`, `job_position`, `phone_number`, `email` (non-disposable; one email at most 10 brands).
   - Address: `customer_name`, `street`, `street_secondary`, `city`, `region`, `postal_code`, `iso_country` (one street at most 10 brands).
   - Messaging profile: `company_type` (`private`), `stock_exchange` and `stock_ticker` only if public, `brand_contact_email` (2FA for public for-profit only).
   - `skip_automatic_sec_vet` = false for Standard.
   API: all of these exist as Trust Hub and Messaging APIs, documented for ISV secondary profiles; Twilio steers direct customers to the Console, so direct-brand API use is UNVERIFIED.
   Sources: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv-api, https://www.twilio.com/docs/messaging/api/brand-registration-resource.
   Fees: $4.50 brand + $41.50 vetting; $11 per appeal; $12.50 Authentication+ retry for public brands only.
   Source: https://support.twilio.com/hc/en-us/articles/1260803965530.
4. **New Messaging Service** with the inbound webhook set to `/sms/inbound`.
   API or Console.
   Source: https://www.twilio.com/docs/messaging/services.
5. **Campaign** (UsAppToPerson on that Messaging Service, API or Console, only after brand `APPROVED`).
   Required: `BrandRegistrationSid`, `Description` (40-4096 chars: who sends, who receives, why), `MessageFlow` (40-2048 chars, every opt-in path, consent language naming the brand), `MessageSamples` (2-5, 20-1024 chars, brand named in each, bracketed variables), `UsAppToPersonUsecase`, `HasEmbeddedLinks`, `HasEmbeddedPhone`.
   Optional or conditional: `OptInMessage`, `OptOutMessage`, `HelpMessage`, `OptInKeywords`, `OptOutKeywords`, `HelpKeywords`, `SubscriberOptIn`, `AgeGated`, `DirectLending`, `PrivacyPolicyUrl`, `TermsAndConditionsUrl`.
   The privacy policy must say mobile numbers are not shared, state frequency and "Message and data rates may apply"; terms must be on the same domain.
   Sources: https://www.twilio.com/docs/messaging/api/usapptoperson-resource, https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/collect-business-info.
   Fees: $15 vetting (non-refundable) + $10/month.
   Source: https://support.twilio.com/hc/en-us/articles/11587910480155.
6. **Move numbers** into the new Messaging Service after approval (PhoneNumber resource API), then delete the old Low Volume campaign (API or Console).
   Sources: https://support.twilio.com/hc/en-us/articles/4402888763803, https://support.twilio.com/hc/en-us/articles/4402888955163.

Who must act: no source was found that legally requires the business owner personally to type the EIN or press submit (UNVERIFIED).
What is documented: the submitter needs Owner or Admin role, the authorized representative must be a real person holding an official role in the business, and identity data must match IRS records.
Sources: https://support.twilio.com/hc/en-us/articles/52182476727195, https://support.twilio.com/hc/en-us/articles/9321443984155 (30483).
The exact attestation text shown at Console submit was not visible without signing in (UNVERIFIED).
James, as owner of Discipler LLC, should be the authorized representative and submit.

## 5. Recommendation

### Before the conference (now to about 2026-11-10)

1. **Open one Twilio Support ticket today** asking four things: apply secondary vetting to the existing brand; confirm in writing whether Discipler's model is Direct or ISV; state whether Twilio enforces 49 numbers per campaign and how to request a T-Mobile Number Pool; and whether more than 5 campaigns would be allowed.
   Reason: all four decide the architecture, and the vet has no published turnaround.
2. **As soon as the vet returns, register a Standard campaign** (`ACCOUNT_NOTIFICATION`, fallback `MIXED`) on a new Messaging Service, keep the Low Volume campaign live until approval, then move numbers.
   Reason: it lifts the T-Mobile cap from 2,000 to between 2,000 and 200,000 depending on score, and MPS from 3.75 to 12-225.
   Budget at least 5 business days for the campaign on top of the vet.
3. **Cap conference sign-ups at what the current setup can carry and say so**: no more numbers than the campaign's 49, and a waitlist past that.
   Reason: the T-Mobile 49 is confirmed at the registry, and its Twilio behaviour is unknown.
4. **Stagger check-in hours across ministries and handle error 30023** as a distinct, retry-next-day refusal.
   Reason: the cap is per EIN per Pacific day, so one shared check-in hour is the worst case.
   (Code change; not made.)

### Growing past it

- If Twilio confirms **Direct**: keep one number per church, grow by T-Mobile Number Pool on a single Standard campaign rather than cloned campaigns, and start using `To` to resolve the shared-phone case.
- If Twilio says **ISV**: move to per-church secondary brands, ideally a subaccount per church, registered by API from a church onboarding step that collects EIN and legal details.
  It costs more per church ($4.50 brand, $15 campaign vetting, plus $41.50 if standard-vetted, then $3-$10/month) and takes days per church, but each church gets its own daily cap and throughput, and 501(c)(3) churches may get T-Mobile fee waivers.
  Toll-free per church is the fallback if 10DLC secondary brands stall.
- Do not use a shared pool or one shared toll-free number: both break per-church STOP, both clash with the church-voice rule under carrier review, and toll-free sharing is an explicit rejection code.
- A short code does not fit: too slow to launch (months), priced for high volume, and it cannot be shared across churches.
