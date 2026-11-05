# 37 - Security headers and the extra hardening

**What to build:** Q57's list of protections beyond the required thirteen.

**Blocked by:** 03, 05

**Status:** ready-for-human

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

## Comments

### What was built

**Headers.**
`src/platform/security-headers.ts` holds the policy and the plain headers, with no imports, and says in its header how a page adds to the policy.
`next.config.ts` puts HSTS, `Referrer-Policy`, `X-Content-Type-Options` and `X-Frame-Options` on every response, and `middleware.ts` puts a Content-Security-Policy with a fresh nonce on every response it handles.
The root layout is `force-dynamic`, because a nonce only reaches Next's scripts on a page rendered per request.
The build lists 120 routes as dynamic, `/_not-found` included, the two icons as static, and `/help/[slug]` as `●` because of its `generateStaticParams`.
The three inline scripts of Discipler's own are gone: Settings' preview is the client component `app/settings/live-preview.tsx`, which now also works after a client navigation, where the inline script never ran, and the two drags are `public/scripts/goal-drag.js` and `form-editor-drag.js`.

**The webhook.**
Only the Vercel Firewall rule turns other addresses away, and the route's signature check is what proves an event is Stripe's.
`docs/stripe-webhook-addresses.md` holds the rule, the list, and what a wrong list looks like.

**The limits on a new church.**
`NEW_CHURCH_LIMITS` in `src/domain/launch-terms.ts` is 300 people, 1,500 texts a week and 30 days (Q81).
Whether a church is new, its Roster and its week are read off history each time, so a church leaves its first weeks without anything having to happen.
An import past the limit is refused whole with a plain sentence, and texts past the limit stay on the queue.
The tick's `watchNewChurchLimits` emails support@ once per church per limit, recorded in the operator-only table `new_church_limit_hit`.
`npm run new-church-limit -- list` shows who is held, and `lift <church id>` writes the event `ministry.new_church_limits_lifted`.

**Preview.**
`src/platform/deployment.ts` now refuses a Preview that holds any variable with STRIPE in its name, or a live Stripe key under any name.

**Already built, checked and not rebuilt.**
One first free month and one church-plant year per payment fingerprint: tickets 04 and 19, `tests/integration/opening-a-trial.test.ts` and `tests/integration/approving-a-church-plant.test.ts`.
Support submissions deleted after twelve months: ticket 25, `tests/integration/the-support-form.test.ts`.
The reminder 7 days before a trial ends is ticket 33's, whose worktree holds `src/service/trial-ending-watch.ts`, so it is not built here and this line is met only when 33 lands.

### Decisions on gaps

1. **An enforced nonce policy in middleware**, where the ticket said `next.config.ts` and finding F3.2 said Report-Only first.
   A static header in `next.config.ts` would have had to allow `'unsafe-inline'` scripts, which takes away most of what a policy is for.
   Report-Only first needs production traffic to read, and the sign-up pages it matters most for have none yet, so the browser check below and staging stand in for it.
   The cost is that every page is now dynamic, and they nearly all were.
   If production shows something missed, changing the header's name to `Content-Security-Policy-Report-Only` in `middleware.ts` is the one-line way back.
2. **`style-src` allows `'unsafe-inline'`.**
   React's `style` attributes and the captured pages' need it, and an injected style is far less than an injected script.
3. **`form-action` is on, and it includes `https://billing.stripe.com` ahead of ticket 33**, whose Portal is a POST that redirects there.
   It is the one directive that bit (see below), and dropping it is the alternative, which leaves an injected form free to post anywhere.
4. **`frame-src` includes `https://www.youtube-nocookie.com` and `https://www.loom.com` ahead of ticket 27**, whose onboarding plays James's video in a frame.
   That video's address is empty until it is recorded, so leaving this to the merge would have broken it silently, long after anybody was looking.
5. **The Firewall rule alone, with no webhook gate in the app (James, 2026-11-05, replacing the first build's gate).**
   A second copy of the list in the code would have gone live before the Log-first check, and a Stripe address it missed would have stopped billing with no error on any page.
   The signature check already refuses everybody else, so the rule only saves the function's work.
   The cost is that the suite proves nothing about the address check; the Log-then-Deny step on the real project is its only proof.
6. **The limits hold every church in its first 30 days from `ministry.opened`, however it was opened.**
   The alternative is only self-signed-up churches, which would let a church opened by hand past with no reason to.
   I did not read production, so I do not know whether any church there opened inside the last 30 days.
   Run `npm run new-church-limit -- list` against production after the migration is pushed, and lift any real church it names.
7. **An import is refused whole, and exactly 300 is allowed.**
   The check is on the server only, so the dialog's review does not warn first; a warning there is the alternative, at the cost of one more read on a page kept to few.
8. **Someone filling in an Intake form past 300 is still added**, and support@ is told.
   Resolving a held import row is also not refused.
   Refusing a congregant for their church's size is the alternative, and I took it to be worse than a Roster at 301.
9. **A week of texts is the last seven days**, so a burst cannot straddle two calendar weeks.
   If reading the limit fails, the church has no limit for that drain, because a broken read must not silence a church.
   A backlog goes as soon as there is room, with no check of the hour (in `docs/open-questions.md`).
10. **The lift command exists because the refusal's sentence promises help.**
    The alternative was raw SQL against production.

### What the browser check looked at

A production build in headless Chrome at 390 and 1280 pixels, with a real session and the local database, with sign-up open, under the real policy.
At the end of each page the check read Chrome's log and a `securitypolicyviolation` listener installed before the page's own scripts.
Every page below had **no violations and no sideways scroll**.

To show the check can see a violation at all, `/login` was given an inline script, an outside script, an outside frame and an outside `fetch`: all four were stopped and reported.
A page at another address framing `/login` got Chrome's error frame.

- `/login`: hydrated.
- `/login/forgot`: the widget's script loaded from `challenges.cloudflare.com`, its token reached the server, and the page said "Email sent."
- `/r/SOMECODE`: redirected to `/signup?ref=SOMECODE`, Cloudflare's frame appeared and was looked at, its token went on, and it landed on `/signup/email?ref=SOMECODE`.
- `/help/contact` signed out: Cloudflare's frame appeared, and the form reached "Thank you".
- `/help/getting-started`, `/overview` and `/materials`, for violations; `/overview` was looked at too.
- `/settings`: typing changed the preview's word, on a full load and after a client navigation, and the page was looked at.
- `/intake-forms`: both drag scripts ran, and the page with its QR code was looked at.
- `/materials/new`: a PDF went from the browser to local Storage and showed as uploaded.
- `/roster`: the import dialog hydrated, and 301 people pasted into People only landed on `?error=new_church_limit` with the sentence, looked at in both widths.
- `/signup/payment`, with the stand-in below.

The middleware's two exits were read on the wire by `tests/integration/the-security-headers-over-http.test.ts` as well, for the pages listed there.

**What it found.**
A plain form POST from a page on `127.0.0.1` stopped with a `form-action` error, because `next start` builds `request.url` on `localhost`, so the redirect went to what the browser counts as another origin.
I checked every `NextResponse.redirect` and `location` header in `app/`: the only two that leave the origin are the signed file addresses, and those are GET links, which `form-action` does not touch.
The rest are built from `request.url` or `request.nextUrl`, so this depends on Vercel giving a route the address it was asked at.
Production's sessions already depend on that, because a redirect to any other host would lose the cookie, but it is reasoned and not observed.
**The first plain form on staging, such as an import, is the proof.**
The trap is written down in `docs/agents/test-environment.md`.

**Outside services.**
Cloudflare's widget was real, with its public always-pass test key, as in tickets 17 and 22: the browser loaded its script and frame, and siteverify went to a stand-in in the server process, so no secret reached Cloudflare.
Google Fonts were real.
Resend and siteverify were stand-ins.
Chrome could resolve nothing else.
The account step's widget, on `/signup/account`, was not driven: it uses the same `loadTurnstile` under the same policy.

### What is checked only by reading the policy

**Stripe was never touched, and nothing inside its frames has been seen.**
`js.stripe.com` and the other Stripe and Link addresses were answered by a stand-in I wrote, at their real URLs, so Chrome applied the real policy to those URLs.
The page's real `@stripe/react-stripe-js` components mounted through it, and under `/signup/payment` it loaded a script from `js.stripe.com` and `b.js.stripe.com`, framed `js.stripe.com`, `b.js.stripe.com`, `hooks.stripe.com`, `link.com` and `checkout.link.com`, posted to `api.stripe.com`, fetched the Google Fonts stylesheet and drew an image from `*.link.com`, with no violation.
**That proves the policy allows what Stripe's guide lists, not that the guide's list is all that today's Stripe.js asks for.**
The real Payment Element, Express Checkout, Apple Pay, Google Pay, Link and 3D Secure are checked only by reading `docs.stripe.com/security/guide`.
The first thing to look at on staging, with a sandbox key, is `/signup/payment`'s console, then a 3D Secure test card.

Also unobserved: the Firewall rule itself, which James adds by hand, and any real Stripe event through it.

### For James

1. **Add the Firewall rule by hand**, as `docs/stripe-webhook-addresses.md` says: Log first, watch one real event, then Deny.
   Subscribe an address you read to Stripe's API announce list, which gives seven days' notice of a change.
2. **Q33 already holds, read from Vercel on 2026-11-04.**
   The `discipler` project has no `STRIPE_` variable on Preview or Production, only on Development, and Deployment Protection is on (`all_except_custom_domains`).
   So production's Stripe keys are still to be added, on Production only, and I did not touch or decrypt anything.
   The second project, `discipler-grill-baseline-v2`, listed no variables when read the same way, without naming a team.
3. **Link and the referral free month**, still open from ticket 18.
   Link gives a null fingerprint, so a referral free month passes unclaimed.
   Dropping `link` from `ACCEPTED_PAYMENT_METHODS` closes it, and this ticket's fingerprint line is not fully true until you choose.
4. **HSTS is two years with `includeSubDomains`, and no `preload`.**
   `includeSubDomains` is on `app.trydiscipler.com` and what is under it, so it does not bind `trydiscipler.com`, and it is hard to take back for a browser that has seen it.
5. The drafts and two choices about the limits are in `docs/open-questions.md`, under *sign-up's numbers and wording*.

### What later tickets must build on

Any page, in any of tickets 27, 31, 32 and 33: anything same-origin needs nothing.
An outside host goes in a list in `src/platform/security-headers.ts`, with a line in `tests/platform/the-security-headers.test.ts`.
An inline `<script>` or `next/script` with children does not run: use a client component, or `public/scripts/` with `src`.
A native form whose POST redirects off the origin needs the destination in `FORM_LEADS_TO`.
No page can be framed, not even by another of Discipler's, because of `frame-ancestors 'none'` and `X-Frame-Options`.

- **27:** the YouTube no-cookie and Loom frames are allowed here.
  A welcome video that is a file on another host needs that host in a new `media-src`.
  The tour is its own page and not a frame, which is right.
  Its captured pages, as they stood in its worktree on 2026-11-04, hold no `<script>`, `on...=` attribute or outside address, and a later capture must not either, because none would work.
- **31:** nothing to add as its worktree stands, because the bubble posts to Discipler's own routes and the model is called from the server.
  Only a browser calling the Gateway directly would need `connect-src https://ai-gateway.vercel.sh`, and it should not, because that would put the credential in the browser.
  Its `dangerouslySetInnerHTML` holds markdown with raw HTML off and images removed, so the policy has nothing to refuse there.
- **32:** nothing to add as its worktree stands.
- **33:** the Portal's POST is covered, a Payment Element on a restart page is covered, and a link to a Stripe invoice is a navigation, which needs nothing.
- **Anybody merging:** the root layout's `force-dynamic` and `middleware.ts` both have to survive, because either one alone leaves every page's scripts dead or unprotected.
- **Whoever adds a table of limits or a new first-weeks number:** `NEW_CHURCH_LIMITS` is the only place the numbers live, and `app/help/facts.ts` reads them.

### Test numbers

The type check is clean.
The full locked suite passed: 343 files with none skipped, and 5672 tests passed with 1 skipped, the older `it.skip` in `tests/integration/invitation-over-http.test.ts`.

The suite found two things on its way there.
`standings` counted no texts, because its count's alias shadowed the outer `m`, so the texts limit never told support@; the alias is fixed, and `tests/integration/the-new-church-limits.test.ts` is what caught it.
`tests/integration/forgot-password-over-http.test.ts` was already red on `launch/wave-4` since `4c3e412` hid the sign-in page's link while sign-up is shut; it no longer asks that of a shut server, and `tests/app/the-forgot-password-pages.test.ts` holds both states.
