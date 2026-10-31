# The local test environment

What every agent needs to know before it believes a test run on this machine, red or green.
These were each learned by losing a session to them.
Read this before running anything under `tests/integration` or `tests/platform`.

## What is shared, and what is not

| Tests | Touch | Concurrent? |
| --- | --- | --- |
| `tests/domain`, `tests/app` | nothing outside the process | Yes, any number at once. `npx vitest run tests/domain tests/app` |
| `tests/integration`, `tests/platform` | the one local Supabase stack (ports 54321 to 54329), and for `*-over-http` a built Next server | **No.** Only through `scripts/locked-tests.sh` |

There is one Supabase stack per machine.
Its schema is whatever the last `supabase db reset` applied, from whichever checkout ran it.
The over-HTTP suites drive a real server at `APP_URL`, which defaults to `http://127.0.0.1:3000`; a server built from another checkout answers just as happily and fails, or passes, against code you do not have.

So `scripts/locked-tests.sh` holds one lock around the whole of: reset the database if this checkout's migrations are not the ones applied, build this checkout, serve it on this checkout's own port, run the tests against that port, stop the server.
The port is 3100 unless `LOCKED_TESTS_PORT` says otherwise, and never 3000.
The reset, build and server logs are in `.git/locked-tests/logs/`.
An agent does not run `npm test`, `npm start`, `supabase db reset` or anything on port 3000 to find out whether a change is green.

The script can wait a long time for the lock and then run for minutes.
The whole suite with a server is about four minutes a run.
Start it in the background and read its log; a shell call that blocks on it will time out.

## Before you believe a red run

- **Hook timeouts across unrelated files mean contention, not a regression.**
  `Hook timed out in 10000ms` in a dozen files at once is the Supabase stack being saturated, usually by a second test run.
  Check `pgrep -f "[v]itest"` and `docker ps`, then run again with nothing else in flight.
- **A reset that failed looks like a broken migration.**
  `supabase db reset` intermittently fails with `container is not ready: unhealthy`, and the CLI then rolls the stack back, so no migration applied.
  `Applying migration ...` in the output is not proof of success; the rollback comes after.
  `locked-tests.sh` checks for the success line and refuses to go on without it.
  The cure is usually `supabase stop --no-backup`, then `supabase start`, then run again.
  The CLI is a global install on this machine, not a project dependency: call `supabase`, never `npx supabase`, which goes to the registry and can stop on a prompt.
- **`AuthRetryableFetchError` in every `beforeAll`, and a whole suite that is over in under eighty seconds, is Auth not being back yet.**
  A reset restarts Auth, and Kong cannot reach it for about fifty seconds afterwards; two checkouts with different migrations reset on every handover of the lock.
  `locked-tests.sh` waits up to two minutes for `/auth/v1/health` to answer through Kong before it runs anything, and says so if it never does.
  A run from a checkout that does not have that wait yet shows about 82 failed files and 692 skipped tests, and none of it is the code.
- **`fetch failed` or `EADDRNOTAVAIL` across many suites is the host, not the code.**
  Past about fifty days of uptime macOS stops expiring sockets in TIME_WAIT and the ephemeral ports run out.
  `netstat -an -p tcp | awk 'NR>2{print $6}' | sort | uniq -c | sort -rn | head`; if the counts are in the tens of thousands, stop running tests and tell the person. Only a reboot fixes it.
- **`relationship_member_ends_after_it_starts` in a fixture is two clocks, not the code.**
  The fixtures stamp `started_at` with this process's clock, and SQL `now()` is the database container's.
  After a heavy build the container can sit a few milliseconds behind, so a membership ended with `now()` a moment after it was added ends before it started, and a whole `beforeAll` goes with it.
  End things in a test with a time from the process (`new Date()` as a parameter), or through the product's own route or command, never with `now()`.
  Under heavy load the gap has been more than a minute (2026-09-25), so a test that compares a time the database stamped with the process's clock reads the stamp back from its row rather than assuming the two agree.
- **A test with a clock pinned to a near-future date fails on every branch once that date passes.**
  If a failure is about a date and has nothing to do with your change, check the calendar before the code.

## Before you believe a green run

- **Green may mean skipped.**
  The over-HTTP suites skip themselves when nothing answers `APP_URL`.
  `locked-tests.sh` sets `CI=1` whenever it serves, which turns a skip into a failure; with `--no-server` they do skip, and that run covers none of them.
  Read the summary line for skipped files as well as failed ones.
- **The first run after a reset is the one most likely to pass.**
  Tests isolate by creating a fresh Ministry each, never by truncating, so the tables grow with every run and the planner changes its plans.
  A query whose order a test depends on can flip on the second or third run.
  A change is green when the whole suite passes several times back to back with no reset between: `scripts/locked-tests.sh --times 3`.
  This is why the script resets only when migrations differ.
  The three back-to-back runs are for a branch about to go to `main`; one run is enough while working.
  When a test asserts on more than one row, the query needs an `order by` that actually distinguishes them.
- **A stale server hides deletions.**
  An old build can keep passing a test for behaviour the current code removed.
  The per-checkout port and the build inside the lock exist to make this impossible; do not route around them.

## Stopping a server

The listening process renames itself to `next-server`, so `pkill -f "next start"` matches nothing useful, and unbracketed it matches the shell that ran it and kills that instead.
Stop a server by the pid that owns your port: `lsof -tnP -iTCP:<your port> -sTCP:LISTEN`.
Never stop a server on a port that is not yours.

## Staging

Staging is a copy of Discipler with its own Supabase project, Stripe in test mode and no real texting, where every billing and sign-up change is tried before production (Exponential launch, ticket 02).
It is the Vercel custom environment `staging` of the `discipler` project, built from the `staging` branch.
Preview deployments are not staging: they share production's database, Supabase keys and Twilio, and must never be used as a stand-in.

What makes it safe is in the code, not in anyone's memory:

- `src/platform/deployment.ts` refuses a staging environment, at build in `next.config.ts` and at start in `instrumentation.ts`, that carries production's Supabase project under any variable, any `TWILIO_*` value, a Stripe live key (`sk_live_`, `rk_live_`, `pk_live_`) under any name, production's `NEXT_PUBLIC_APP_URL`, or a `MESSAGE_TRANSPORT` other than `record`.
  A refused build fails, so the staging deployment before it goes on serving; the build log lists every refusal by variable name.
- With `MESSAGE_TRANSPORT=record` every text is written to the log as `Text recorded, not sent: {...}` and sent nowhere, and the queue marks it sent as Twilio's acceptance would.
- `/sms/inbound` on staging accepts only requests signed with `STAGING_SMS_SIGNING_SECRET`, and ignores `TWILIO_AUTH_TOKEN` there.

### Deploying to staging

1. Push the migrations first, as for production, to staging's database by its URL: `supabase db push --db-url "<staging session or direct connection string>"`.
   Do not `supabase link` to staging: the main checkout is linked to production, and a link left pointing the other way sends the next push to the wrong project.
   The transaction pooler (port 6543) cannot run migrations; use the session pooler or the direct connection (port 5432).
2. Deploy the commit by pushing it to the `staging` branch, `git push --force-with-lease origin <sha>:staging`; Vercel builds it into the staging environment.
   From a checkout linked to `discipler` (`vercel link --project discipler`, never a bare `vercel link`), `vercel deploy --target=staging` does the same for uncommitted work.
3. If the build fails with `Discipler refuses to run as staging on this environment`, fix the variables it names in Vercel's staging environment and redeploy.
4. Seed demo churches once after the first push, or after the database is recreated, by exporting staging's four values for the one command: `NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... DATABASE_URL=... npm run seed`.
   It prints the demo Admins' phones and password, and refuses a value that points at production.
5. Vercel Cron runs only on production, so on staging the hourly tick runs when it is called: `curl -H "Authorization: Bearer <staging CRON_SECRET>" -H "x-vercel-protection-bypass: <bypass secret>" https://<staging host>/cron/tick`.

Staging sits behind Vercel's sign-in, like every non-production deployment.
A browser signed in to Vercel reaches it; a script, Stripe and anything else automated passes the Protection Bypass for Automation secret, as the `x-vercel-protection-bypass` header or, where only a URL can be given, the query parameter of the same name.

### Texts on staging

- What staging would have texted is in the staging deployment's runtime logs in Vercel (search `Text recorded`), and in `outbound_message` in staging's database.
- A reply, a `STOP` or a `PAUSE` is sent in with `STAGING_URL=https://<staging host> STAGING_SMS_SIGNING_SECRET=... VERCEL_AUTOMATION_BYPASS_SECRET=... npm run staging:text -- "<from phone>" "<body>"`.
  `200` means it was taken; `403` means the signature was not staging's.

### Stripe test events against staging

Staging's Stripe is a Stripe sandbox (test mode), whose webhook endpoint is staging's webhook route with the bypass secret in its query string, for example `https://<staging host>/stripe/webhook?x-vercel-protection-bypass=<bypass secret>`, signed with the endpoint's own `whsec_` held in staging's `STRIPE_WEBHOOK_SECRET`.

- A real event: sign up on staging and pay with Stripe's test card `4242 4242 4242 4242`, any future expiry and any CVC.
- A replay of one already sent, to prove it is processed once: in the sandbox's Dashboard open Workbench, then Events, pick the event and resend it to the staging endpoint; or with the Stripe CLI, `stripe events resend <evt_...> --webhook-endpoint <we_...> --api-key <sandbox secret key>`.
- A late or out-of-order event: resend an older `customer.subscription.updated` after a newer one; the webhook re-reads the subscription, so the church's state must not move.
- Time passing (a trial ending, a renewal, a failed payment): create the customer on a Stripe test clock in the sandbox and advance the clock; the events it produces arrive at staging like any other.
- `stripe trigger <event>` makes objects that belong to no church on staging, so the webhook should refuse them; it is a test of the refusal, not of a sign-up.
- `stripe listen --forward-to` is for a server on this machine only: it signs with a secret of its own that staging does not hold, so its events are refused there.

## Other facts

- There is no `psql` on this machine. Query the local database with a `node` one-liner using `pg` and `DATABASE_URL` from `.env.local`.
- A server page that reads a constant exported from a `'use client'` module renders a throwing stub. Keep shared constants in a module both sides can import.
- Test `:target` and anything that depends on the address with a fresh page load, not after client navigation.
