# 37 - Security headers and the extra hardening

**What to build:** Q57's list of protections beyond the required thirteen.

**Blocked by:** 03, 05

**Status:** ready-for-agent

## The list

- Security headers in `next.config.ts`: `Strict-Transport-Security`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `frame-ancestors 'none'`, and a CSP allowing `https://challenges.cloudflare.com`. This is finding F3 of `.scratch/security-hardening/spec.md`; whichever ships first, the other builds on it.
- A Vercel Firewall rule letting only Stripe's published webhook addresses reach the webhook path.
- A cap on texts and Roster size for a new church's first weeks, with an email to support@ on spikes.
- One first free month and one church-plant year per payment fingerprint.
- The reminder 7 days before a trial ends.
- Support submissions deleted after 12 months.
- Stripe keys on Production only, and Vercel Deployment Protection on Preview (Q33).

## Acceptance

- The headers are present on every page, and Turnstile still loads.
- A request to the webhook path from outside Stripe's addresses is blocked.
- A new church importing more than the cap is refused with a plain message.

## For James

1. Decided 2026-10-29 (Q81), with an email to support@ when a church hits either: 300 people on the Roster and 1,500 texts a week for the first 30 days.
