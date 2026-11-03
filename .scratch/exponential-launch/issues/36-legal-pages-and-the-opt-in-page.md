# 36 - Legal pages and the opt-in page

**What to build:** Updated Terms of Service and Privacy Policy drafts in `docs/legal/`, and the second section of `trydiscipler.com/sms-opt-in` (Q30, Q61).

**Blocked by:** nothing

**Status:** shipped

## What changes

- The provider list adds Stripe, Resend, Cloudflare Turnstile, and the Vercel AI Gateway with Anthropic.
- The cookie line covers anything new, or stays true because referral codes travel in the address.
- "We never give one ministry's information to another" is reworded for the referral tracker's status rows and the opt-in name.
- Sign-in by email or phone.
- Support submissions kept 12 months, AI chats 90 days.
- The terms' fees section is rewritten for self-serve monthly billing, the trial, the offers, and cancellation.
- The privacy policy says mobile numbers are never shared, states message frequency, and says "Msg & data rates may apply", as the campaign review requires.
- The opt-in page gains the sign-up consent wording and a screenshot of it.

## Acceptance

- Every new provider and retention period appears in the policy.
- Sign-up stays off in production until James has published both pages.

## For James

1. Review the drafts or have a lawyer review them, then publish them on trydiscipler.com before 2026-11-04.

## Comments

### Built (2026-10-31)

- `docs/legal/privacy-policy.md` and `docs/legal/terms-of-service.md` committed first exactly as drafted on 2026-10-25 for the security-hardening work, then changed in a second commit, so the diff between the two commits is this ticket.
- Both drafts keep the "[square brackets] to fill in" convention, say at the top that they are drafts for James and a lawyer and not legal advice, and say sign-up stays off in production until they are published.
- The privacy policy now covers: what a church gives at sign-up, including the church-plant application and the terms agreement with its version and time; payment information held only by Stripe, with Discipler keeping Stripe's IDs, the card brand and last four or the bank's name; sign-in by email or phone and the emailed reset link; the phone confirmation code; the help assistant; the contact, bug and feature form; the account emails; Stripe, Resend, Cloudflare Turnstile, the Vercel AI Gateway and Anthropic in the provider table; both opt-in paths, the "{ministry} via Discipler" start, the shared numbers, the frequency for Admins, "Msg & data rates may apply" and the sentence that mobile numbers are never shared; the referral exception to "we never give one ministry's information to another"; support kept 12 months and AI chats 90 days; and what happens to an ended subscription's information.
- The terms' fees section is rewritten for self-serve monthly and yearly billing, the 30-day trial with a card or bank account up front, the three offers, failed payments, cancellation at the end of the paid period, restarting, and price changes; sign-in, sign-up, texting, acceptable use, third parties and the AI disclaimer are updated to match.
- `docs/legal/sms-opt-in-sign-up-section.md` is the new section for trydiscipler.com/sms-opt-in, with the sign-up consent wording word for word from the spec and the mock-up (`.lavish/signup-checkout/s2-email-phone.html`), where the screenshot goes and what it must show, sample messages, and the other lines on the live page this launch makes untrue.
- `docs/consent-language.md` points at that draft.

### Decisions made on gaps

- **The cookie line.**
  Referral codes travel in the address, so they need no cookie; the line now says Discipler's own cookies are only those that keep a person signed in and carry them through sign-up, and names Stripe's payment form and Cloudflare Turnstile as running their own technology in the browser, with a bracketed note for the lawyer.
  Alternative: keep "only the cookies needed to keep you signed in", which would be untrue if sign-up keeps its step in a cookie, and silent about Stripe.js.
- **The referral exception follows the mock-up 5 decisions, not the ticket's "status rows and the opt-in name".**
  There is no tracker and no name any more, so the only thing one church learns about another is an applied credit on Billing, and the policy says exactly that.
- **Prices are not written into the terms**, which point to the price shown at sign-up and on the Billing page; the 200-person boundary, the 20% yearly saving and every offer's terms are.
  Alternative: list $97 and $147 in the terms, which then need re-publishing for any price change.
- **A church set up by us with no subscription and no agreement keeps the old "free until 30 days' notice of fees" clause**, so Example Ministry and any comped church are covered.
- **Retention periods nobody has decided are left in brackets**: an abandoned sign-up, billing records, terms agreements after an account closes, and an ended subscription's information.
- **No refund on cancellation** is how the terms read as drafted, with a bracket asking James or the lawyer to confirm.

### For James

1. Review both drafts and the opt-in section, or have a lawyer review them, fill in every bracket, and publish all three on trydiscipler.com before 2026-11-04; sign-up stays off in production until they are live.
2. The opt-in draft's "For James" section raises one question for Twilio or a lawyer: the sign-up consent is given by continuing, with no checkbox, on a page where a phone number is required.
3. The live opt-in page's sample messages are out of date apart from this launch (three ratings, the old prefix); the draft lists the lines to change.

### Closed out (2026-11-02)

Merged in PR #35 (49d4bb2).
The drafts are in `docs/legal/`, unpublished; sign-up does not exist yet, and ticket 15 holds its gate.
What is left for James moved to `docs/open-questions.md`: *publishing the legal drafts* and *the live opt-in page's sample messages*.
James reviewed the sign-up consent on 2026-11-02 and kept it as drafted, with no checkbox.
James approved the retention periods on 2026-11-03: an abandoned sign-up 30 days, billing records 7 years, agreements 7 years after the account ends, and an ended or never-paid church's information 12 months with an email to its Admins 30 days before.
Nothing deletes any of it yet; see *nothing deletes what the privacy policy says is deleted* in `docs/open-questions.md`.
On 2026-11-03 James also set the effective date to November 3, 2026, chose Carroll County, kept no refund on cancellation, and took the plain tax line and the cookie disclosures without an accountant's or lawyer's confirmation.
He gave 116 Beaver St., Carrollton, GA as the address and named himself copyright agent, and said the opt-in page's form sample should match the real intake form word for word.
The privacy policy and the terms now have no brackets and no draft box.
Production has sent no Verify code (`phone_check` is empty), so the sample code text is still unconfirmed.
