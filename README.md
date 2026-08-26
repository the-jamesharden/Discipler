# Discipler

Discipler is a discipleship operating system for churches that helps pastors create, support, and understand healthy discipleship relationships without adding unnecessary administrative burden. Churches can operate both one-to-one mentorships and discipleship groups, onboard mentors and mentees, use availability to generate suggested pairings, manually create one-to-one or group relationships, assign discipleship materials, and use a lightweight Twilio rhythm to learn whether meetings are happening, how they are going, and where care may be needed. The same week-by-week history powers both immediate pastoral visibility and longer-term Ministry Intelligence, including trends, material performance, satisfaction, response rates, demographic response patterns, and quarterly ministry health. Discipler supports the ministry around the relationship; it does not replace pastoral judgment, participant consent, or the human work of discipleship.

## Running it

Requires Node 22, Docker, and the Supabase CLI.

```bash
npm install
npm run db:start     # local Supabase (Postgres, Auth) via Docker
npm run db:reset     # apply migrations
cp .env.example .env.local   # already holds the local keys; check them against
                             # what `npm run db:start` printed
npm run seed         # creates two Ministries and an Admin for each, and prints
                     # their sign-in details -- accounts are never self-registered
npm run dev
```

Tests need the local stack running. The suite that drives the Roster over HTTP
also needs the app itself running, and skips itself when it is not:

```bash
npm test             # domain + integration
npm run typecheck
npm run build && npm start   # then `npm test` covers the sign-in flow too
```

## How the code is arranged

```
src/domain/      Pure. The command boundary, the clock, history and effect types.
                 Depends on nothing -- no platform SDK, no Node built-ins, no I/O.
src/service/     The application service. Turns a command's effects into writes.
src/platform/    Adapters. The only place Supabase or Postgres is named.
app/             The web surface (Next.js).
supabase/        Migrations, including the row-level security policies.
```

Three rules hold the shape:

- **Every external trigger enters through one command boundary**, and commands
  return effects rather than performing I/O. That boundary is what the tests drive.
- **History is append-only.** Enforced by database triggers, not convention.
- **Every time-dependent rule reads an injected clock.** Tests advance it to make
  weeks pass in milliseconds.

Ministry isolation is enforced in the database with row-level security, and
`tests/integration/rls-coverage.test.ts` derives its checks from the live schema --
a new table carrying a `ministry_id` without a policy fails the suite.

It holds on both sides. Reads run as the signed-in user, so a query that forgets
its `where` clause returns nothing rather than someone else's data. Writes drop
into `discipler_command`, a role that cannot bypass row-level security, and declare
which Ministry the command is acting for -- so a command handling one Ministry
cannot write a row belonging to another even if the application asks it to.
