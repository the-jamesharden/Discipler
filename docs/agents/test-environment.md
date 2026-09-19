# The local test environment

What every agent needs to know before it believes a test run on this machine, red or green.
These were each learned by losing a session to them.
Read this before running anything under `tests/integration` or `tests/platform`.

## What is shared, and what is not

| Tests | Touch | Concurrent? |
| --- | --- | --- |
| `tests/domain`, `tests/app` | nothing outside the process | Yes, from any number of worktrees. `npx vitest run tests/domain tests/app` |
| `tests/integration`, `tests/platform` | the one local Supabase stack (ports 54321 to 54329), and for `*-over-http` a built Next server | **No.** Only through `scripts/agents/locked-tests.sh` |

There is one Supabase stack per machine.
Its schema is whatever the last `supabase db reset` applied, from whichever checkout ran it.
The over-HTTP suites drive a real server at `APP_URL`, which defaults to `http://127.0.0.1:3000`; a server built from another checkout answers just as happily and fails, or passes, against code you do not have.

So `scripts/agents/locked-tests.sh` holds one lock around the whole of: reset the database if this checkout's migrations are not the ones applied, build this checkout, serve it on this checkout's own port, run the tests against that port, stop the server.
Never run `npm test`, `npm start`, `supabase db reset` or anything on port 3000 from a ticket worktree.

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
- **`fetch failed` or `EADDRNOTAVAIL` across many suites is the host, not the code.**
  Past about fifty days of uptime macOS stops expiring sockets in TIME_WAIT and the ephemeral ports run out.
  `netstat -an -p tcp | awk 'NR>2{print $6}' | sort | uniq -c | sort -rn | head`; if the counts are in the tens of thousands, stop running tests and tell the person. Only a reboot fixes it.
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
  A change is green when the whole suite passes several times back to back with no reset between: `scripts/agents/locked-tests.sh --times 3`.
  This is why the script resets only when migrations differ, and why the integrator runs three.
  When a test asserts on more than one row, the query needs an `order by` that actually distinguishes them.
- **A stale server hides deletions.**
  An old build can keep passing a test for behaviour the current code removed.
  The per-checkout port and the build inside the lock exist to make this impossible; do not route around them.

## Stopping a server

The listening process renames itself to `next-server`, so `pkill -f "next start"` matches nothing useful, and unbracketed it matches the shell that ran it and kills that instead.
Stop a server by the pid that owns your port: `lsof -tnP -iTCP:<your port> -sTCP:LISTEN`.
Never stop a server on a port that is not yours.

## Other facts

- There is no `psql` on this machine. Query the local database with a `node` one-liner using `pg` and `DATABASE_URL` from `.env.local`.
- A server page that reads a constant exported from a `'use client'` module renders a throwing stub. Keep shared constants in a module both sides can import.
- Test `:target` and anything that depends on the address with a fresh page load, not after client navigation.
