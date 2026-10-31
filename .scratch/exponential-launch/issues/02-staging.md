# 02 - Staging

**What to build:** A staging copy of Discipler with its own database, Stripe in test mode and no real texting, where every billing and sign-up change is tried first (Q56).

**Blocked by:** nothing

**Status:** ready-for-agent

## Why

Vercel Preview shares the production database, Supabase and Twilio today.
Without staging, the first full test of Checkout, the Portal and Stripe's webhooks would run against real churches' data.

## What it is

- A Vercel custom environment for the `discipler` project, deployed from a named branch.
- Its own Supabase project, migrated with `supabase db push`, with seeded demo data.
- Stripe test-mode keys and its own test-mode webhook secret.
- No Twilio sending: the message transport records texts instead of sending them, and the inbound route accepts only signed test requests.
- Turnstile test keys and a Resend key limited to a test address.

## Acceptance

- A sign-up on staging runs through Checkout with a Stripe test card, the webhook marks the church trialing, and nothing reaches production.
- Production's `DATABASE_URL`, Stripe live keys and Twilio credentials are not set on staging.
- `docs/agents/test-environment.md` says how to deploy to staging and how to replay Stripe test events against it.

## For James

1. A second Supabase project adds a monthly cost; approve it before it is created.

## Comments

### Built (2026-10-31)

Everything staging needs in the repo; nothing outside it was created, since the second Supabase project's cost is not yet approved.

- `src/platform/deployment.ts` says which deployment a process is (`staging` when `DISCIPLER_ENVIRONMENT=staging` or Vercel's `VERCEL_TARGET_ENV=staging`; `production` from Vercel; otherwise neither) and lists what it refuses to run with.
- A staging deployment refuses: production's Supabase project under any variable (its ref in a URL, a database host or pooler user, or inside a key's JWT payload), any non-empty `TWILIO_*`, a Stripe live key (`sk_live_`, `rk_live_`, `pk_live_`) under any name, production's `NEXT_PUBLIC_APP_URL`, a `MESSAGE_TRANSPORT` other than `record`, and being deployed as production.
- A production deployment refuses `MESSAGE_TRANSPORT=record`, and every deployment refuses an unknown `DISCIPLER_ENVIRONMENT` or `MESSAGE_TRANSPORT`.
- The refusals are checked at build in `next.config.ts`, so a wrong staging build fails and the one before it goes on serving, and again at start in `instrumentation.ts`; each refusal names the variable and never prints its value.
- `src/platform/recording-transport.ts` writes each text to the log as one line, `Text recorded, not sent: {"from","to","body"}`, and sends nothing; the composition root chooses it when `MESSAGE_TRANSPORT=record`, and always on staging.
- `/sms/inbound` checks the signature against `inboundSigningSecret`: `STAGING_SMS_SIGNING_SECRET` on staging only, `TWILIO_AUTH_TOKEN` everywhere else, and an unset secret still refuses everybody.
- `npm run staging:text -- "<from>" "<body>" ["<to>"]` posts a test text to staging signed with Twilio's scheme under staging's secret, with the Vercel bypass header.
- `npm run seed` reaches staging when its four Supabase values are exported, and refuses any that points at production.
- `docs/agents/test-environment.md` has a Staging section: deploying, seeding, the tick by hand, reading and sending texts, and replaying Stripe test events.
- No migration, no new table, no operator-only table.

Checked by hand on a local build under the test lock: started as staging with `.env.local`'s `TWILIO_AUTH_TOKEN` and no `MESSAGE_TRANSPORT`, `next start` refused with both reasons; started as staging properly, a `HELP` from a consented Person signed with staging's secret got `200`, its reply was logged as `Text recorded, not sent` and its `outbound_message` row marked sent, while the same request signed with the Twilio token and an unsigned one both got `403`.
A `next build` given production's database ref, a Twilio token and a `sk_live_` key as staging failed at `next.config.ts` with all three refusals.

### Decisions made on gaps

- **One variable names the deployment, a second chooses the transport.** `DISCIPLER_ENVIRONMENT=staging` (or the custom environment's own name) makes it staging; `MESSAGE_TRANSPORT=record` chooses recording, and staging must say it explicitly. Alternative: staging alone implies recording. Explicit reads plainly in the dashboard, and the code records on staging whatever the variable says, as a second line.
- **Staging carries no Twilio variable at all,** and its inbound route reads its own `STAGING_SMS_SIGNING_SECRET`. Alternative: a staging-only value in `TWILIO_AUTH_TOKEN`. A separate name lets the guard refuse every `TWILIO_*` without knowing production's values, which the repo must not hold.
- **Production's Supabase project is recognised by its ref, `vmdiddtxvmaflmrrqwmo`,** written in the code. It is not a secret (it is in production's public Supabase URL), and it appears in every way of reaching that project.
- **Recorded texts go to the deployment's log, not a table.** The outbound queue already keeps each text's row, marked sent, and a table would have added a migration and an always-empty table to production. The log line holds a phone number and a body, which production's logs must not; production refuses `record`, so only staging and a developer's machine write it.
- **The Turnstile keys for staging are a real Turnstile widget for the staging hostname,** not Cloudflare's always-pass dummy keys. Cloudflare's docs show the dummy secret answering with hostname `localhost` and action `test`, which ticket 11's hostname and action checks would refuse. The dummy keys (`1x00000000000000000000AA`, `1x0000000000000000000000000000000AA`) stay for local development.
- **A Resend key cannot be limited to one recipient,** so staging's Resend key is its own sending-only key for `notify.trydiscipler.com`, and ticket 10's sender must deliver every staging email to `STAGING_EMAIL_RECIPIENT` instead of the real recipient (below).
- **Staging is deployed by pushing to a `staging` branch** that the custom environment tracks, and migrations reach it with `supabase db push --db-url`, never `supabase link`, so the checkout stays linked to production.
- **Vercel Cron runs only on production,** so staging's tick is called by hand; no staging cron was added.

### What the other tickets must honour on staging

- **03 (the webhook):** read `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`; derive the deployment's Stripe mode from the key's prefix (`sk_test_`/`rk_test_` is test), so staging accepts test events and production refuses them, with no separate mode variable to get wrong.
- **04 (prices and payment):** read `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`; find prices and coupons by lookup key or from the environment, never by a live-mode ID written in the code, and make the catalog creatable in the staging sandbox (a script or written steps).
- **06 (shared numbers):** `npm run staging:text` takes the Discipler number a text was sent to as its third argument, as `To`.
- **08 (balance alarm) and 09 (Verify):** staging has no Twilio account. Neither may call Twilio when `messageTransportKind(process.env)` is `record`; Verify needs a stand-in there that records the code the way texts are recorded.
- **10 (email):** read `RESEND_API_KEY`; when `deploymentOf(process.env)` is `staging`, send every email to `STAGING_EMAIL_RECIPIENT` and refuse to send when it is unset.
- **11 (codes and the human check):** read `TURNSTILE_SECRET_KEY` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; take the expected hostname from `NEXT_PUBLIC_APP_URL`, so staging's widget verifies on staging's host; any server secret it adds (the code HMAC key) gets a fresh staging value, never production's.
- **Q33:** Stripe keys live on Production and, in test mode only, on staging; Preview holds none.

### Provisioning checklist for James

Do these in order once the second Supabase project's cost is approved.
Every value below goes on the `staging` environment only, never on Production or Preview, and every secret is a fresh value, never one copied from production.

**1. GitHub: the branch staging deploys from**

1. Create the branch from `main`: `git push origin origin/main:refs/heads/staging`.

**2. Supabase: the staging project**

1. In the "Discipler" organisation, create a project named `discipler-staging` in `ca-central-1`, as production is, and keep its database password in your password manager.
2. Authentication, Sign In / Providers: turn off "Allow new users to sign up", as production has it.
3. Same page, Phone: turn it on with Twilio as the SMS provider and placeholder values (Account SID `AC00000000000000000000000000000000`, Message Service SID `MG00000000000000000000000000000000`, any auth token), and phone confirmations off.
   Phone and password sign-in needs the provider on, but Discipler never asks Supabase to send a text, so nothing reaches Twilio.
   If the dashboard refuses the placeholders, use the Twilio account's test credentials (Twilio Console, Account, API keys and tokens, Test credentials), which cannot send.
4. Copy the rest of production's Authentication settings across by eye (password length, sessions, email).
5. Authentication, URL Configuration: the Site URL is staging's address (step 3.2), and add `https://<staging host>/**` to the redirect URLs.
6. Note the Project URL, the anon key, the service_role key, and two connection strings from Connect: the kind production's `DATABASE_URL` uses, and a session pooler or direct one (port 5432) for migrations.
7. From a checkout at the commit to test: `supabase db push --db-url "<session or direct connection string>"`.
   Do not `supabase link` to staging.
8. Seed demo churches: `NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... DATABASE_URL=... npm run seed`, and keep the Admin phones and password it prints.

**3. Vercel: the custom environment**

1. Project `discipler`, Settings, Environments: create an environment named exactly `staging`, with branch tracking on the branch `staging`.
2. Settings, Domains (recommended): add `staging.trydiscipler.com` to the `staging` environment, and add the CNAME Vercel shows at GoDaddy.
   Without it, use the environment's generated URL, and use that wherever this list says the staging host.
3. Settings, Deployment Protection: keep Vercel Authentication on, so staging needs a Vercel sign-in, and under Protection Bypass for Automation generate a secret named "staging automation" and save it.
4. Settings, Environment Variables: filter to `staging` and confirm none of production's variables apply there; they are all "Production, Preview" today, which a custom environment does not inherit.
   If the Stripe or Resend Marketplace integration offers to connect to `staging`, decline it and set the values by hand below.
5. Add these to `staging` only, the secrets as Sensitive:

| Variable | Value |
| --- | --- |
| `DISCIPLER_ENVIRONMENT` | `staging` |
| `MESSAGE_TRANSPORT` | `record` |
| `NEXT_PUBLIC_APP_URL` | `https://staging.trydiscipler.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | the staging project's URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the staging anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | the staging service_role key |
| `DATABASE_URL` | the staging connection string, the kind production uses |
| `CRON_SECRET` | a fresh `openssl rand -hex 32` |
| `STAGING_SMS_SIGNING_SECRET` | a fresh `openssl rand -hex 32` |
| `STRIPE_SECRET_KEY` | the sandbox's restricted key, `rk_test_...` (step 4.3) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | the sandbox's `pk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | the staging endpoint's `whsec_...` (step 4.4) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | the staging widget's site key (step 5) |
| `TURNSTILE_SECRET_KEY` | the staging widget's secret key |
| `RESEND_API_KEY` | the staging Resend key (step 6) |
| `STAGING_EMAIL_RECIPIENT` | the one address every staging email goes to, yours |

   No `TWILIO_*` variable at all: staging refuses to build with one.
   Any secret a later ticket adds (the email-code key, for one) gets its own fresh staging value.
6. Deploy: `git push --force-with-lease origin <sha>:staging`, and check the build log has no "Discipler refuses to run as staging" line.

**4. Stripe: a sandbox for staging**

1. Stripe Dashboard, Sandboxes: create one named "Discipler staging", so staging's test data is apart from live mode and from any other test.
2. In the sandbox, create the catalog as ticket 04 sets it out, and set up the payment methods (card, Link, Apple Pay with the staging domain registered, US bank account by instant verification only) and the customer portal as production will have them.
3. Developers, API keys: create a restricted key with the permissions tickets 03 and 04 name, for `STRIPE_SECRET_KEY`, and copy the publishable key.
4. Developers, Webhooks, Add endpoint: `https://staging.trydiscipler.com/stripe/webhook?x-vercel-protection-bypass=<bypass secret>`, subscribed to the twelve events ticket 03 lists; copy its signing secret for `STRIPE_WEBHOOK_SECRET`.

**5. Cloudflare Turnstile: a staging widget**

1. Cloudflare dashboard, Turnstile, Add widget: named "Discipler staging", hostname `staging.trydiscipler.com`, mode Managed.
2. Copy its site key and secret key into the two Turnstile variables.

**6. Resend: a staging key**

1. Resend, API Keys, Create: named "staging", Sending access, restricted to `notify.trydiscipler.com`.
2. Put it in `RESEND_API_KEY` on staging only, and your own address in `STAGING_EMAIL_RECIPIENT`.

**7. Check it**

1. Sign in on staging as a seeded Admin, with the phone and password `npm run seed` printed.
2. Send a test text in, `STAGING_URL=https://staging.trydiscipler.com STAGING_SMS_SIGNING_SECRET=... VERCEL_AUTOMATION_BYPASS_SECRET=... npm run staging:text -- "<phone>" "HELP"`, where the phone is one on a staging Roster that has completed Intake, expect `200`, and find `Text recorded, not sent` with the reply in the staging logs.
   A number staging does not hold also gets `200`, and no reply, as on production.
3. Once tickets 15 to 18 are merged and deployed to staging: sign up, pay with `4242 4242 4242 4242`, see the church trialing, and see nothing new in production's Stripe live mode or database.

### Verify's stand-in (2026-10-31, after the merge with ticket 09)

- `src/platform/recording-verifier.ts` writes a Verify code to the log instead of texting it, and the container picks it wherever `messageTransportKind` is `record`, so staging and a developer's `MESSAGE_TRANSPORT=record` never put a real code on a real phone.
- The code it accepts is always `000000`: the instance that checks a code is not the one that sent it, so it cannot remember one it made up.
  Production cannot reach it, because `deploymentRefusals` refuses a production deployment set to record.
