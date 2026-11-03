# 10 - Email from notify.trydiscipler.com

**What to build:** Discipler can send email, from `notify.trydiscipler.com` through Resend, with replies going to support@trydiscipler.com.

**Blocked by:** nothing

**Status:** ready-for-human

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

## Comments

### Built (2026-10-31)

- `src/domain/email.ts` decides what an email may say and where it may go.
  `EmailField` is the only way a value enters an email: `line` (one line, line breaks and controls folded, cut at 200), `quoted` (somebody's typing, every line quoted with `> ` so nothing typed passes for Discipler's own words, cut at 5000), `link` (only `trydiscipler.com` and its subdomains over https, or localhost) and `code` (six digits).
  Every field drops control, direction-override and zero-width characters and has any phone number replaced with "[phone number removed]".
  `emailSubject` and `emailBody` are template tags that take only fields, so a raw string is a compile error, and anything cast past the compiler is refused at run time with `UnescapedEmailField`.
  A field throws if read into an untagged template.
- `EMAIL_KINDS` is the routing, one line per kind: support@ for new sign-ups, the support, bug and feature form, the shared numbers near capacity, the daily cap, the Twilio balance and spend alarms, the over-200 follow-up and the deliverability check; james@ and lerone@ for a church-plant application; the Admin's address for the email code, the "someone tried to sign up" notice, the reset link, the Checkout reminder, the trial-ending email and the church-plant decision.
  The `Email` type requires an address for an Admin's kind and forbids one for the others, and `openEnvelope` refuses the same at run time.
  Every reply goes to support@.
- `src/service/email-sender.ts` is the one sender: it opens the envelope in the domain, then hands it to the `EmailTransport` port.
  `getEmailSender()` in the container is the only thing that builds one.
- `src/platform/resend/email-transport.ts` posts plain text (no HTML part) to Resend's REST API with `fetch`, from `Discipler <hello@$RESEND_EMAIL_DOMAIN>`, with `reply_to` support@ and an `Idempotency-Key` of `<kind>/<once>`.
  It refuses anything `openEnvelope` did not make, and its refusals carry Resend's status and error name.
- `scripts/send-test-email.ts` (`npm run email:check`) sends the deliverability check to support@ for the Acceptance's SPF, DKIM and DMARC check.

### Adding a kind of email

1. Add one line to `EMAIL_KINDS` in `src/domain/email.ts`: its name and `'support'`, `'founders'` or `'admin'`.
2. Where the sending ticket lives, compose its subject and body with the `emailSubject` and `emailBody` tags, every value in them made by an `EmailField` method, and send it with `getEmailSender().send({ kind, to, subject, body, once })` (`to` only for an Admin's kind).
A value that is not a line, typed words, a Discipler link or a code gets a new `EmailField` method beside the others.

### Decisions made

- The From address is `Discipler <hello@notify.trydiscipler.com>`.
  The alternative was a per-kind display name, such as "James Harden" for the Checkout reminder signed by James; ticket 18 can add one if James wants it.
- A phone number found in a field is replaced, not refused, so a support message whose sender typed their own number still arrives.
  The alternative was refusing the whole email, which would lose that message.
  This also means ticket 06's capacity alert cannot list Discipler's own numbers; it should give a count.
- The types refuse what the domain brands as congregation data (`PhoneNumber`, `OtherGoal`, `PersonId`, `ConcernId`).
  A Person's name is a plain string in the domain, so nothing can tell it from a church's name; the rule for a name is a review rule, written in the module's comment.
- `once` holds IDs only (letters, digits, `.`, `_`, `:`, `/`, `-`), with no address or phone number, because Resend keeps its keys.
  Resend's key lasts 24 hours; "once a month" or "once a day" is the sending ticket's to store.
- The route list includes kinds the ticket did not name but other tickets send: `signUpAttemptNotice` (ticket 11), `twilioSpendPassed` (ticket 08) and `churchPlantDecision` (ticket 19), each to the inbox its ticket says.
- Nothing retries inside the transport, as with Twilio; the tick's alerts send again on the next pass.
- There is no local stand-in transport: without `RESEND_API_KEY` a send throws, on Preview and on a developer's machine alike.
  Ticket 11's tests will need a recording transport through the `EmailTransport` port, like the one in `tests/domain/sending-an-email.test.ts`.

### Closed out (2026-11-02)

Merged in PR #35 (49d4bb2).
The DNS records are published and the domain is verified, and the test email reached support@ from `hello@notify.trydiscipler.com` (James, 2026-11-01).
One Acceptance check is left, so this is not `shipped`: reading SPF, DKIM and DMARC as passing in that email's headers, which only James can see.
