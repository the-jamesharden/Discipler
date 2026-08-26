# 01 — Walking skeleton: command boundary, clock, history, Ministry isolation

**What to build:** An Admin signs in and sees an empty Roster for their own Ministry, and only their own Ministry.

This is the prefactor every other ticket lands on, so the seams matter more than the surface. Every external trigger enters through one application-service boundary, and each command returns effects — outbound messages to enqueue, history events to append — rather than performing I/O itself. That boundary is what the test suite drives, and it is the only way into the domain. History is append-only: new facts never overwrite old ones. Every time-dependent rule reads from an injected clock, never from system time.

Ministry isolation is enforced in the database with row-level security, not only in application code. Two Ministries operating concurrently must never see each other's data, and that is proven by a test, not by inspection.

Record the platform choice as an ADR before writing code — the decision and its reasoning are in `docs/adr/0002-supabase-as-the-platform.md`; confirm it still reflects what you build.

**Blocked by:** None — can start immediately.

**Status:** ready-for-human

- [x] An Admin can sign in and reach a Roster view scoped to their Ministry
- [x] All state changes flow through a single command boundary that returns effects rather than performing I/O
- [x] History is append-only; no command overwrites an existing history event
- [x] Every time-dependent read goes through an injected clock, and tests can advance it
- [x] Row-level security scopes every ministry-owned table
- [x] A test creates two Ministries and proves neither can read the other's data
- [x] The domain has no dependency on the hosting platform's SDK

## Comments

### Implemented — walking skeleton

Stack is Supabase (Postgres + Auth) per `docs/adr/0002-supabase-as-the-platform.md`,
with Next.js carrying the web surface. The ADR was re-read against what was built
and still reflects it; Edge Functions remain the intended host for the inbound
webhook and the tick, neither of which exists yet.

**The seams.** `src/domain/` is pure and imports nothing outside itself — no
platform SDK, no Node built-ins — and that is enforced mechanically by
`tests/domain/domain-independence.test.ts` rather than by convention.
`handleCommand` returns effects; `src/service/` applies them; `src/platform/` is
the only place Supabase or Postgres is named. `src/service/container.ts` is the
composition root.

**Isolation holds on both sides.** Reads run as the signed-in user under RLS.
Writes drop into `discipler_command`, a role without `BYPASSRLS`, and declare which
Ministry the command acts for — closing the gap where a trusted write connection
would have left isolation resting on the application passing the right
`ministry_id`, which is the failure mode ADR-0002 rejects.

**Two holes found and closed while building:** the platform's default privileges
grant `anon` TRUNCATE on every new table in `public`, and TRUNCATE is filtered by
neither row-level security nor a delete trigger — a signed-out visitor could have
erased a Ministry's history. Privileges are now granted explicitly from a revoked
baseline, and a TRUNCATE trigger guards `ministry_event`. Self-registration was
also open (`enable_signup`), and is now off: an Admin is provisioned, a Leader
creates their account through the Invitation Link.

59 tests pass against a local Supabase stack.

### Deliberately left for later tickets

- **Participation Status is not on the Roster.** `CONTEXT.md` defines the Roster as
  people *and their current participation status*. Deriving it needs Intake, which
  is ticket 03; showing `No Intake Submitted` today would hard-code a fact that
  stops being true the moment Intake ships. The Roster renders names only.
- **No trigger is wired to the tick.** `scheduled.tick` returns no effects because
  no time-dependent rule exists yet, and a scheduler endpoint would force decisions
  about scheduling scope that belong with ticket 07. The wiring itself is real and
  covered by `tests/integration/composition-root.test.ts`.
- **Sign-in is by email.** `CONTEXT.md` says the Leader Dashboard is entered by
  phone number and password. That surface arrives with tickets 06 and 15; this is
  the Admin's sign-in.

### For a human to confirm

`docs/adr/0002-supabase-as-the-platform.md` uses the phrase *tenant isolation*,
while `CONTEXT.md` lists **Tenant** as a term to avoid in favour of **Ministry**.
The code uses Ministry throughout. The ADR wording was left alone rather than
edited after acceptance.

