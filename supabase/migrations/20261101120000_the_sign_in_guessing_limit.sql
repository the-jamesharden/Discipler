-- Exponential launch, ticket 13 -- the sign-in guessing limit
--
-- Ten failed sign-ins per account and per network in fifteen minutes, and the
-- eleventh is refused before Supabase Auth is asked (Q34). Discipler's own,
-- because Supabase's per-address limit sees the Vercel function's address rather
-- than the person's: sign-in runs on the server. The numbers live in
-- `src/domain/sign-in-limit.ts` and are passed in; nothing here restates them.
--
-- One row per try at a password, written before Supabase Auth is asked and
-- deleted again if the try turns out not to be a failure -- the password was right,
-- or Supabase never answered. What stays is the failures, plus whatever is in
-- flight at this instant, and counting the in-flight ones is the point: a burst of
-- a thousand simultaneous guesses sees each other's rows and only ten go through.
-- ---------------------------------------------------------------------------

create table sign_in_attempt (
  id             uuid primary key default gen_random_uuid(),
  -- Digests, never the number or the address. Counting needs only that two tries
  -- named the same account or came from the same network; holding a list of who
  -- tried to sign in from where is not something this table is for. SHA-256 of a
  -- namespaced key (`phone:+1...`, `user:<uuid>`, `network:203.0.113.7`), made
  -- in `src/platform/supabase/sign-in-limit.ts`.
  account_digest text not null check (account_digest ~ '^[0-9a-f]{64}$'),
  -- Null when the request carried no readable address, which on Vercel does not
  -- happen. Such a try still counts against its account.
  network_digest text check (network_digest ~ '^[0-9a-f]{64}$'),
  attempted_at   timestamptz not null
);

-- The two counts, each a range scan over one key's recent rows.
create index sign_in_attempt_by_account on sign_in_attempt (account_digest, attempted_at);
create index sign_in_attempt_by_network on sign_in_attempt (network_digest, attempted_at)
  where network_digest is not null;
-- And the sweep of rows nothing will count again.
create index sign_in_attempt_by_age on sign_in_attempt (attempted_at);

-- ---------------------------------------------------------------------------
-- Who may touch it: nobody but the trusted connection
-- ---------------------------------------------------------------------------

-- The `ministry_setup` shape. A sign-in has no Ministry yet -- finding out whose
-- account this is, is what it is for -- so there is no policy to scope it with
-- and no policy at all. The trusted connection is the only reader and writer, and
-- every API role is refused outright: a browser that could read this could watch
-- the count it is trying to stay under.
alter table sign_in_attempt enable row level security;
alter table sign_in_attempt force  row level security;

revoke all on sign_in_attempt from anon, authenticated, service_role, discipler_command;
