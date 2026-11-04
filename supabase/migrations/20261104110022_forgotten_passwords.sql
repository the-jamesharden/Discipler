-- Exponential launch, ticket 22 -- "Forgot your password?"
--
-- An Admin with a verified email asks for a link, is emailed one, and chooses a new
-- password with it. Discipler's own link and not Supabase's recovery link, because
-- Supabase's expiry is one setting for the whole project and its link signs the
-- person in. How long a link lasts and how many may be asked for live in
-- `src/domain/launch-terms.ts` and are passed in; nothing here restates them.
-- ---------------------------------------------------------------------------

-- One row per link. The token is only ever in the email and in the address it
-- opens, and only its SHA-256 is here, so a copy of this table opens nothing.
create table password_reset_link (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  token_digest text not null unique
    constraint password_reset_link_token_digest_is_sha256 check (token_digest ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz not null,
  expires_at   timestamptz not null,
  -- Spent by pressing the button on the page and never by opening it, so an email
  -- scanner following the link cannot use it up.
  spent_at     timestamptz,

  constraint password_reset_link_expires_after_it_is_issued check (expires_at > created_at),
  constraint password_reset_link_spent_after_it_is_issued check (spent_at is null or spent_at >= created_at)
);

-- One live link per account: a newer link replaces an older one, as
-- `docs/adr/0012-re-issuing-a-link-replaces-it.md` has it for every link Discipler makes.
create unique index password_reset_link_one_live_per_account
  on password_reset_link (user_id)
  where spent_at is null;

-- The sweep of rows nothing will read again.
create index password_reset_link_by_age on password_reset_link (expires_at);

-- One row per request the caps let through, whether or not anybody holds the address,
-- so the caps are reached the same way for both and are counted here and not in a
-- process that forgets. Apart from `pending_signup_send`, so a stranger typing an
-- address into sign-up cannot use up its owner's way back in. Digests, because
-- counting needs only that two requests named the same address or came from the same
-- network: SHA-256 of a namespaced key (`email:...`, `network:...`), made in
-- `src/platform/supabase/password-reset-links.ts`.
create table password_reset_request (
  id             uuid primary key default gen_random_uuid(),
  email_digest   text not null check (email_digest ~ '^[0-9a-f]{64}$'),
  -- Null when the request carried no readable address, which on Vercel does not
  -- happen. Such a request still counts against its email.
  network_digest text check (network_digest ~ '^[0-9a-f]{64}$'),
  requested_at   timestamptz not null
);

create index password_reset_request_by_email on password_reset_request (email_digest, requested_at);
create index password_reset_request_by_network on password_reset_request (network_digest, requested_at)
  where network_digest is not null;
create index password_reset_request_by_age on password_reset_request (requested_at);

-- ---------------------------------------------------------------------------
-- Who may touch them: nobody but the trusted connection
-- ---------------------------------------------------------------------------

-- The `ministry_setup` shape: somebody who has lost their password has no session,
-- and an account is not a Ministry, so there is no policy to scope these with and no
-- policy at all. Every API role is refused outright.
alter table password_reset_link enable row level security;
alter table password_reset_link force  row level security;
alter table password_reset_request enable row level security;
alter table password_reset_request force  row level security;

revoke all on password_reset_link from anon, authenticated, service_role, discipler_command;
revoke all on password_reset_request from anon, authenticated, service_role, discipler_command;
