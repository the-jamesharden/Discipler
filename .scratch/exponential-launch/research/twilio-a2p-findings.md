# Twilio A2P findings (2026-10-28)

## Part A
console.twilio.com redirected to the twilio.com/login email page. Not signed in. Stopped, no login attempted.

## Part B sources
- ISV architecture: https://www.twilio.com/docs/sms/a2p-10dlc/isv-api-registration-overview (brand per customer; Type 5 "No subaccounts, Messaging Services not mapped to customers" incompatible)
- ISV guide scope: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/onboarding-isv ("only for ISVs who send messages on behalf of their customers")
- Direct vs ISV test: https://www.twilio.com/en-us/blog/a2p-10dlc-registration (recipient awareness; template-based platform may be direct)
- Number registration timing: https://www.twilio.com/docs/api/errors/30035 (up to 24h; only REGISTERED sends)
- Auto-association: https://support.twilio.com/hc/en-us/articles/4402888763803
- 400 numbers per Messaging Service: https://www.twilio.com/docs/messaging/api/phonenumber-resource
- 49 TN per campaign (T-Mobile): https://www.bandwidth.com/release-notes/capping-tns-for-10dlc-campaigns/
- Fees and LVS/Standard caps: https://www.twilio.com/docs/trust-hub/registrations/a2p-10dlc-brand
- T-Mobile caps by trust score: https://support.twilio.com/hc/en-us/articles/1260804800549
- Vetting times: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc/quickstart (10-15 days), https://support.twilio.com/hc/en-us/articles/11847054539547 (5 business days), brand manual review 7+ business days (troubleshooting page)
- Toll-free pending blocked: https://www.twilio.com/docs/api/errors/30032 ; BRN required from 2026-02-17: https://www.twilio.com/en-us/changelog/business-registration-numbers-required-for-toll-free-messaging-p
- Verify alternative: https://www.twilio.com/docs/messaging/compliance/a2p-10dlc.md
- Inbound webhook precedence: https://www.twilio.com/docs/messaging/api/service-resource (use_inbound_webhook_on_number)
