# 01 — Walking skeleton: command boundary, clock, history, Ministry isolation

**What to build:** An Admin signs in and sees an empty Roster for their own Ministry, and only their own Ministry.

This is the prefactor every other ticket lands on, so the seams matter more than the surface. Every external trigger enters through one application-service boundary, and each command returns effects — outbound messages to enqueue, history events to append — rather than performing I/O itself. That boundary is what the test suite drives, and it is the only way into the domain. History is append-only: new facts never overwrite old ones. Every time-dependent rule reads from an injected clock, never from system time.

Ministry isolation is enforced in the database with row-level security, not only in application code. Two Ministries operating concurrently must never see each other's data, and that is proven by a test, not by inspection.

Record the platform choice as an ADR before writing code — the decision and its reasoning are in `docs/adr/0002-supabase-as-the-platform.md`; confirm it still reflects what you build.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] An Admin can sign in and reach a Roster view scoped to their Ministry
- [ ] All state changes flow through a single command boundary that returns effects rather than performing I/O
- [ ] History is append-only; no command overwrites an existing history event
- [ ] Every time-dependent read goes through an injected clock, and tests can advance it
- [ ] Row-level security scopes every ministry-owned table
- [ ] A test creates two Ministries and proves neither can read the other's data
- [ ] The domain has no dependency on the hosting platform's SDK
