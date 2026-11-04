-- ---------------------------------------------------------------------------
-- Each church's referral code, and who invited whom (Exponential launch, ticket 20)
-- ---------------------------------------------------------------------------

-- `/r/<code>` answers the sign-up pages at a new top-level address, so `r` joins the short
-- names a Ministry may not take. The same list is `RESERVED_SHORT_NAMES` in
-- `src/domain/short-name.ts`. A check is evaluated on every update of the row, so a
-- Ministry already holding it could save nothing once it is reserved: the migration
-- refuses to run rather than leave one in that state.
do $$
begin
  if exists (select 1 from public.ministry where short_name = 'r') then
    raise exception 'A Ministry holds the short name r. Give it another before reserving r for referral links.';
  end if;
end;
$$;

create or replace function app.short_name_is_reserved(candidate text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select candidate = any (array[
    'account', 'api', 'auth', 'check-ins', 'cron', 'follow-up', 'groups', 'help',
    'intake', 'intake-forms', 'invitation', 'join', 'login', 'material', 'materials',
    'overview', 'r', 'relationships', 'roster', 'search', 'settings', 'setup', 'signup', 'sms',
    'stripe', 'suggested-pairs'
  ]);
$$;

revoke execute on function app.short_name_is_reserved(text) from public, anon, authenticated;
grant execute on function app.short_name_is_reserved(text) to discipler_command, service_role;

-- A code belongs to one church, so it is church-scoped in the shape of `trial_opening`.
-- Which church a code names is only ever asked on the trusted connection, by somebody
-- signing up, who has no session and no Ministry. A retired code stays a row and is never
-- live again: "Get a new link" (ticket 32) sets `retired_at` and issues another.
create table referral_code (
  id          uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references ministry (id) on delete cascade,
  -- Crockford's base32, in lower case, as `readReferralCode` in
  -- `src/domain/referrals.ts` reads it.
  code        text not null
    constraint referral_code_is_readable check (code ~ '^[0-9a-hjkmnp-tv-z]{10}$'),
  created_at  timestamptz not null default now(),
  retired_at  timestamptz,

  constraint referral_code_is_unique unique (code)
);

create unique index referral_code_one_live_per_church
  on referral_code (ministry_id)
  where retired_at is null;

alter table referral_code enable row level security;
alter table referral_code force  row level security;

revoke all on referral_code from anon, authenticated, service_role, discipler_command;

grant select on referral_code to discipler_command;

create policy referral_code_command_read on referral_code
  for select to discipler_command
  using (ministry_id = app.command_ministry_id());

comment on table referral_code is
  'Each church''s referral codes: at most one live, and every retired one kept, which is '
  'what keeps it from ever being live again. Made by `app.issue_referral_code`.';

-- A code, from the operating system's strong random source. `gen_random_uuid` is in
-- core, where `gen_random_bytes` needs pgcrypto, and these are the ten bytes of a
-- version 4 UUID with no fixed bits in them. A byte's low five bits index 32 letters, so
-- no letter is likelier than another, and ten letters are 50 bits.
create function app.a_referral_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  letters constant text := '0123456789abcdefghjkmnpqrstvwxyz';
  random  constant bytea := pg_catalog.uuid_send(pg_catalog.gen_random_uuid());
  at_byte integer;
  made    text := '';
begin
  foreach at_byte in array array[0, 1, 2, 3, 4, 5, 9, 10, 11, 12] loop
    made := made || substr(letters, (pg_catalog.get_byte(random, at_byte) & 31) + 1, 1);
  end loop;
  return made;
end;
$$;

-- A church's new live code. As its owner, because nobody opening a church or asking for a
-- new link may read which codes other churches hold. Fifty bits rarely meet, and the loop
-- is what makes that never rather than rarely. A church that still has a live code is
-- refused by the index: retire the old one first.
create function app.issue_referral_code(church uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  issued text;
begin
  loop
    insert into public.referral_code (ministry_id, code)
      values (church, app.a_referral_code())
      on conflict (code) do nothing
      returning code into issued;
    exit when issued is not null;
  end loop;
  return issued;
end;
$$;

revoke execute on function app.a_referral_code() from public, anon, authenticated, service_role;
revoke execute on function app.issue_referral_code(uuid) from public, anon, authenticated, service_role;

-- In the database, as the short name is, so every way a church opens gives it one: self
-- sign-up, a Setup Link, the seed and a test's fixture.
create function app.give_a_new_church_its_referral_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.issue_referral_code(new.id);
  return null;
end;
$$;

revoke execute on function app.give_a_new_church_its_referral_code() from public, anon, authenticated, service_role;

create trigger ministry_gets_a_referral_code
  after insert on ministry
  for each row execute function app.give_a_new_church_its_referral_code();

-- begin: every church that already exists
select app.issue_referral_code(existing.id)
  from public.ministry existing
 where not exists (
   select 1 from public.referral_code held
    where held.ministry_id = existing.id and held.retired_at is null
 );
-- end: every church that already exists

-- "Ministry A invited Ministry B". Operator-only, in the `ministry_setup` shape and named
-- in `src/platform/supabase/operator-only-tables.ts`, because a row spans two churches and
-- neither may read it: an invited church is never named to the church that invited it, or
-- the other way round. So neither column is called `ministry_id`.
--
-- Written in the transaction that opens the invited church, and read by `wasInvited`.
-- Deleting the inviting church leaves the row, because the invited church's free month
-- does not depend on it.
create table referral (
  invited_church  uuid primary key references ministry (id) on delete cascade,
  inviting_church uuid references ministry (id) on delete set null,
  referral_code   uuid references referral_code (id) on delete set null,
  invited_at      timestamptz not null,

  constraint referral_is_of_another_church check (invited_church <> inviting_church)
);

create index referral_by_inviting_church on referral (inviting_church);

alter table referral enable row level security;
alter table referral force  row level security;

revoke all on referral from anon, authenticated, service_role, discipler_command;

comment on table referral is
  'Which church invited which, one row per invited church, written when the invited church '
  'opens. A retired or unknown code writes none.';

-- The button was renamed by this ticket (James, mock-up 6), and the column's meaning is
-- unchanged.
comment on column pending_signup.agreed_at is
  'When "Continue" was pressed for the phone on this attempt: the time of the '
  'Admin''s consent, written to `consent_record` when the church opens.';
