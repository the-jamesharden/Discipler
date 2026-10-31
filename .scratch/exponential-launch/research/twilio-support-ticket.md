Subject: Secondary vetting for Discipler LLC brand, and questions on how our traffic should be registered

Account SID: [the Account SID, from the Twilio Console]
Brand SID: BN6c29327e1df62b9aab87f926f0a99e2e (Low Volume Standard, approved 2026-07-15)
Campaign: Low Volume Mixed, on Messaging Service MGa42ffb2e85f4dcf704083fad06f171ef

How Discipler works today:
- Discipler LLC runs a mentorship check-in service used by US churches and campus ministries.
- Each church using Discipler has its own 10DLC number. All of those numbers sit in the one Messaging Service above, on one campaign.
- Every message is a fixed template written by Discipler. Churches cannot write or send their own text. Messages contain no links or phone numbers.
- Recipients are people enrolled in a church's mentorship program. They opt in themselves on a Discipler-hosted form for that church's program (sample: https://trydiscipler.com/sms-opt-in). A church's administrator also opts in on Discipler's sign-up page to receive test check-ins.
- Volume is about 3-5 messages per participant per week.
- We expect many new churches after a conference on 2026-11-08.

We are considering sending for all churches from a shared set of Discipler-owned numbers instead of one number per church, with each text naming Discipler and the church.

Questions:
1. Please apply secondary vetting to brand BN6c29327e1df62b9aab87f926f0a99e2e so it can register a Standard campaign. We understand the fee is $41.50. Should we retire our older Sole Proprietor brand, BN7b4efae2d2af168561da65b247c275de?
2. Based on the facts above, should Discipler be registered as a direct customer or as an ISV with a brand for each church? Does the answer change with the shared-number setup? If you classify us as an ISV, can we keep sending on our current registration for a transition period while we re-register, and for how long?
3. How does Twilio handle T-Mobile's limit of 49 numbers per campaign? If we need more, what is Twilio's number pool process, its fee and timeline, and does it require a vetted brand?
4. Your docs allow up to five campaigns per brand unless a clear and valid business reason is given. What reason would you accept? Please also confirm that each Messaging Service links to only one campaign, and that our numbers must sit in that campaign's Messaging Service even though our app sends with a From number rather than a Messaging Service SID.
5. After vetting, should we register a new Standard campaign (we plan the Mixed use case) on a new Messaging Service and move our numbers to it, or can the existing Low Volume Mixed campaign be upgraded? How long are campaign reviews taking right now?

Thank you,
James Harden
Founder and CEO, Discipler LLC
