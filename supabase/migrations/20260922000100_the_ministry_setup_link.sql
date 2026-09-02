-- ---------------------------------------------------------------------------
-- The Ministry Setup Link
-- ---------------------------------------------------------------------------
--
-- How a Ministry comes into existence. Whoever runs Discipler mints a link that
-- names the church, the number it will send from, and the phone its first Admin
-- signs in with; the Admin opens it, types their name and a password, and that
-- one submit opens the Ministry. There is still no sign-up surface -- a Ministry
-- exists because an operator said so -- but the password is typed by the person
-- who owns it rather than read off a terminal by somebody else.
--
-- It is the shape of the Invitation Link, pointed at a pastor instead of a
-- Leader: possession of the link is the whole authentication, the phone is fixed
-- on the token and never typed, it expires after a fixed window, and it is spent
-- by account creation rather than by being opened.

-- The one table in Discipler that belongs to no Ministry. The row exists before
-- the Ministry it describes does -- that is its whole purpose -- so it cannot be
-- scoped to one, and the Ministry it became is filled in only when the link is
-- spent.
create table ministry_setup (
  id              uuid primary key default gen_random_uuid(),
  -- The whole credential, so unique across everything.
  token           text not null unique check (length(btrim(token)) > 0),
  ministry_name   text not null check (length(btrim(ministry_name)) > 0),
  -- Both numbers as the Ministry and the account will store them. Read through
  -- the product's own reading before they are written, so a link is never minted
  -- for a number the Ministry would refuse a fortnight later.
  sending_number  text not null
    constraint ministry_setup_sending_number_is_e164
      check (sending_number ~ '^\+[1-9][0-9]{1,14}$'),
  admin_phone     text not null
    constraint ministry_setup_admin_phone_is_e164
      check (admin_phone ~ '^\+[1-9][0-9]{1,14}$'),
  created_at      timestamptz not null,
  expires_at      timestamptz not null,
  -- Spent on account creation, not on resolution, like an Invitation Link. A
  -- pastor who opens it and is called away returns to the same page.
  consumed_at     timestamptz,
  -- The Ministry this link opened. Set in the same transaction that creates it,
  -- so a spent link always says which Ministry it became. Not `ministry_id`: that
  -- name means *the Ministry that owns this row* everywhere else, and
  -- `tests/integration/rls-coverage.test.ts` reads it as a promise that a policy
  -- scopes the table to one. Nothing owns this row.
  opened_ministry_id uuid references ministry (id) on delete set null,

  constraint ministry_setup_expires_after_it_is_issued check (expires_at > created_at),
  constraint ministry_setup_consumed_after_it_is_issued
    check (consumed_at is null or consumed_at >= created_at),
  -- A link is consumed by opening a Ministry and by nothing else, so a Ministry
  -- on a live link is a state that cannot have happened. (A spent link with no
  -- Ministry can: `on delete set null` above, after a Ministry is deleted.)
  constraint ministry_setup_consumed_with_its_ministry
    check (consumed_at is not null or opened_ministry_id is null)
);

-- One live link per phone. Minting again for the same number replaces the link
-- rather than leaving two that both open a Ministry -- the same rule an
-- Invitation Link follows (`docs/adr/0012-re-issuing-a-link-replaces-it.md`),
-- for the same reason: a link that reached the wrong hands is taken back by
-- being superseded, because possession is the only credential and there is
-- nothing else to revoke.
create unique index ministry_setup_one_live_per_phone
  on ministry_setup (admin_phone)
  where consumed_at is null;

-- ---------------------------------------------------------------------------
-- Who may touch it: nobody but the trusted connection
-- ---------------------------------------------------------------------------

-- No Ministry to scope a policy to, so no policy at all. The trusted connection
-- provisioning already runs on -- the one that creates `ministry` rows, which no
-- command role may -- is the only thing that reads or writes here. Every API
-- role is refused outright: a signed-in Admin has no business seeing which
-- churches are being set up, and the command role acts for one Ministry, which
-- this table by definition is not part of.
alter table ministry_setup enable row level security;
alter table ministry_setup force  row level security;

revoke all on ministry_setup from anon, authenticated, service_role, discipler_command;
