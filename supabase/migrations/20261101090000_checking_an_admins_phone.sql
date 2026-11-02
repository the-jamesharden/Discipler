-- ---------------------------------------------------------------------------
-- Checking an Admin's own phone (Exponential launch, ticket 09)
-- ---------------------------------------------------------------------------
--
-- The first time an Admin asks for a test check-in, Twilio Verify texts a
-- 6-digit code to the phone on their Roster row and the Admin types it back.
-- Twilio makes and judges the code; these two tables keep what Discipler needs
-- around it: which phones each Admin has verified, how many tries an attempt
-- has spent, and how many codes have been asked for, by whom and to where, so
-- the code limits are counted here and not in a process that forgets.
--
-- Both are operator-only. A phone check belongs to an Admin's account, which is
-- not a Ministry's row, and an account's checks would mean nothing to the
-- Ministry's own session; only the trusted connection reads or writes them, the
-- way `ministry_setup` is kept.

create type phone_check_ending as enum ('verified', 'wrong_codes', 'expired');

-- One attempt at checking one phone for one Admin: the codes sent to it, a
-- resend included, until it is verified, tried five times, or left to expire.
-- Never reopened; a new code after it ended is a new attempt. A verified phone
-- is an attempt that ended `verified`, so the record of it is the history of
-- how it was checked, not a flag beside it.
create table phone_check (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  phone            text not null
    constraint phone_check_phone_is_e164 check (phone ~ '^\+[1-9][0-9]{1,14}$'),
  started_at       timestamptz not null,
  -- Twilio's name for the verification, once it has accepted a code for sending.
  verification_sid text,
  -- Counted before Twilio is asked, so the fifth is the last there can be.
  codes_tried      smallint not null default 0
    constraint phone_check_at_most_five_tries check (codes_tried between 0 and 5),
  ended_at         timestamptz,
  ended_by         phone_check_ending,

  constraint phone_check_ends_with_its_reason check ((ended_at is null) = (ended_by is null)),
  constraint phone_check_ends_after_it_starts check (ended_at is null or ended_at >= started_at)
);

-- One open attempt per Admin and phone, so a double click resends into the same
-- attempt rather than opening a second with tries of its own.
create unique index phone_check_one_open_per_admin_and_phone
  on phone_check (user_id, phone)
  where ended_at is null;

create index phone_check_by_admin_and_phone on phone_check (user_id, phone, started_at);
create index phone_check_by_phone on phone_check (phone);

-- Every code asked for, a resend and one Twilio then failed to send included:
-- each is a request to a vendor that charges for it. The limits per Admin and
-- per phone are counted over these rows.
create table phone_check_code (
  id             uuid primary key default gen_random_uuid(),
  phone_check_id uuid not null references phone_check (id) on delete cascade,
  requested_at   timestamptz not null
);

create index phone_check_code_by_attempt on phone_check_code (phone_check_id, requested_at);

-- ---------------------------------------------------------------------------
-- Who may touch them: nobody but the trusted connection
-- ---------------------------------------------------------------------------

alter table phone_check enable row level security;
alter table phone_check force  row level security;
alter table phone_check_code enable row level security;
alter table phone_check_code force  row level security;

revoke all on phone_check from anon, authenticated, service_role, discipler_command;
revoke all on phone_check_code from anon, authenticated, service_role, discipler_command;
