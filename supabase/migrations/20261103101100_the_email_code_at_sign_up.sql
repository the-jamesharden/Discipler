-- ---------------------------------------------------------------------------
-- The human check and the email code at sign-up (Exponential launch, ticket 11)
-- ---------------------------------------------------------------------------
--
-- A sign-up has no account and no Ministry until the church is opened, so what it
-- needs before then is kept here for as long as it is needed: an attempt starts
-- when somebody passes the human check, is sent a 6-digit code, proves the address
-- with it, and is spent when the church opens. Nothing here is permanent; a row
-- is swept a day after it began. The numbers live in `src/domain/launch-terms.ts`
-- and are passed in; nothing here restates them.
--
-- **The password is never here, and neither is a code.** A code exists only as an
-- HMAC-SHA256 under a server secret, keyed to the attempt, so six digits' worth of
-- possibilities cannot be walked from a copy of this table. The attempt's random
-- ID lives in the visitor's cookie and only its digest here, so nor can a copy of
-- the table be played back as somebody's attempt.

create table pending_signup (
  id              uuid primary key default gen_random_uuid(),
  -- SHA-256 of the attempt's ID, the value in the httpOnly cookie.
  attempt_digest  text not null unique
    constraint pending_signup_attempt_digest_is_sha256 check (attempt_digest ~ '^[0-9a-f]{64}$'),
  human_passed_at timestamptz not null,
  -- As typed, for the code page and the locked Login email. Both arrive together
  -- when a code is first asked for, and the address never changes after that: a
  -- different address is a new attempt, with a new human check.
  email           text
    constraint pending_signup_email_is_short check (char_length(email) <= 254),
  phone           text
    constraint pending_signup_phone_is_e164 check (phone ~ '^\+[1-9][0-9]{1,14}$'),
  -- Null before a code, after one is used, and for an address that already has an
  -- account: that owner is sent a notice, so there is no code a guess could match.
  code_digest     text
    constraint pending_signup_code_digest_is_hmac check (code_digest ~ '^[0-9a-f]{64}$'),
  code_sent_at    timestamptz,
  code_sends      smallint not null default 0,
  -- Wrong tries at the current code; a new code starts again from none.
  code_tries      smallint not null default 0,
  verified_at     timestamptz,
  spent_at        timestamptz,

  constraint pending_signup_email_and_phone_together check ((email is null) = (phone is null)),
  constraint pending_signup_code_has_a_time check (code_digest is null or code_sent_at is not null),
  constraint pending_signup_only_an_address_is_verified check (verified_at is null or email is not null),
  constraint pending_signup_only_a_verified_attempt_is_spent check (spent_at is null or verified_at is not null)
);

-- The sweep of rows nothing will read again.
create index pending_signup_by_age on pending_signup (human_passed_at);

-- One row per email Discipler sent or tried to send for a sign-up, a code or a
-- notice alike, so the hourly caps are counted here and not in a process that
-- forgets. Not tied to an attempt, because a cap has to outlast the attempt that
-- used it, and it holds digests because counting needs only that two sends named
-- the same address or came from the same network. SHA-256 of a namespaced key
-- (`email:...`, `network:...`), made in `src/platform/supabase/pending-signups.ts`.
create table pending_signup_send (
  id             uuid primary key default gen_random_uuid(),
  email_digest   text not null check (email_digest ~ '^[0-9a-f]{64}$'),
  -- Null when the request carried no readable address, which on Vercel does not
  -- happen. Such a send still counts against its email.
  network_digest text check (network_digest ~ '^[0-9a-f]{64}$'),
  sent_at        timestamptz not null
);

create index pending_signup_send_by_email on pending_signup_send (email_digest, sent_at);
create index pending_signup_send_by_network on pending_signup_send (network_digest, sent_at)
  where network_digest is not null;
create index pending_signup_send_by_age on pending_signup_send (sent_at);

-- ---------------------------------------------------------------------------
-- Who may touch them: nobody but the trusted connection
-- ---------------------------------------------------------------------------

-- The `ministry_setup` shape: a sign-up belongs to no Ministry yet, so there is no
-- policy to scope it with and no policy at all, and every API role is refused.
alter table pending_signup enable row level security;
alter table pending_signup force  row level security;
alter table pending_signup_send enable row level security;
alter table pending_signup_send force  row level security;

revoke all on pending_signup from anon, authenticated, service_role, discipler_command;
revoke all on pending_signup_send from anon, authenticated, service_role, discipler_command;
