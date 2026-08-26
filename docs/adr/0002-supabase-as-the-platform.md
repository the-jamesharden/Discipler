# Supabase as the Platform

## Status

accepted

## Context

Discipler is a greenfield repository. The core operating loop spec requires a relational store for append-only ministry history, authentication for two access tiers, a webhook endpoint for inbound SMS, and a scheduled tick. Nothing has been built, so the platform choice is unconstrained and every ticket in the implementation sequence depends on it.

Two properties of the product make this choice consequential rather than routine. First, no ministry's history may ever be combined with another's — Ministry isolation is a data contract, not a preference. Second, the Week-by-Week History cannot be reconstructed after the fact, so the store holding it has to be correct from the first week of the pilot.

## Decision

Supabase — Postgres, Supabase Auth, and Edge Functions.

Ministry isolation is enforced in the database with row-level security rather than only in application code. Every table carrying ministry data is scoped by ministry and policed by policy, so a missing `WHERE` clause in a query cannot leak across ministries.

Supabase Auth carries both access tiers: Admin, who sees everything in their ministry, and Leader, who sees only their own relationships. Password authentication at launch, matching the settled rule that one-time codes are post-launch.

Edge Functions host the inbound SMS webhook and the scheduled tick.

## Considered options

**A conventional application server with an ORM over Postgres.** Rejected for now, not on merit. It puts isolation entirely in application code, where the guarantee is only as good as the last query anyone wrote — and the isolation rule here is one the product cannot afford to get wrong once.

**Row-level security declined in favour of application-layer scoping alone.** Rejected. The failure mode is silent and the blast radius is every ministry in the system.

## Consequences

The domain must not become coupled to Supabase. The spec's single command boundary stands: commands enter through one application-service boundary and return effects, and the two pure functions — suggestion ranking and relationship state derivation — take data and return data. Supabase sits behind that boundary, in the same position Twilio occupies behind the outbound queue. If it has to be replaced, the domain and its tests should not move.

Row-level security has a real cost in test setup and in debugging, and policies are easy to write permissively by accident. The multi-ministry isolation scenario in the spec's test suite is therefore not an optional extra: it is the check that the policies do what they claim.

Scheduled work runs on Supabase's scheduler, which means the injected clock the spec requires is doing double duty — it is what makes the care rules testable, and it is what keeps the domain from reading time from the platform.
