# 10 - Email from notify.trydiscipler.com

**What to build:** Discipler can send email, from `notify.trydiscipler.com` through Resend, with replies going to support@trydiscipler.com.

**Blocked by:** nothing

**Status:** ready-for-agent

## The rule

- Resend comes through the Vercel Marketplace (slug `resend/resend-email`), with a sending-only key restricted to the domain, set on Production only.
- The apex SPF `-all` and DMARC `p=quarantine` are left untouched.
- One sender module is the only way email leaves Discipler, sending plain text with every field escaped.
- No email carries congregation names, phone numbers, Concerns or a referred church's name.
- Where email goes: support@ for new sign-ups, support, bugs, features, capacity, balance, cap and over-200 alerts; james@ and lerone@ for church-plant applications; the church's Admin for codes, resets, trial reminders and the next-day Checkout reminder.

## Acceptance

- A test email from production arrives at support@ with SPF, DKIM and DMARC passing.
- The sender refuses a message carrying a field it was not given as an escaped value.

## For James

1. Add three records at GoDaddy once Resend shows them: MX and SPF TXT on `send.notify`, and DKIM TXT on `resend._domainkey.notify`.
