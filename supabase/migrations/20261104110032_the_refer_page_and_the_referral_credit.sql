-- ---------------------------------------------------------------------------
-- The Refer page, "Get a new link" and the referral credit (Exponential launch, ticket 32)
-- ---------------------------------------------------------------------------

-- `/refer` is a new top-level address, so `refer` joins the short names a Ministry may not
-- take, with `r` and every other name kept. The same list is `RESERVED_SHORT_NAMES` in
-- `src/domain/short-name.ts`. A check is evaluated on every update of the row, so a
-- Ministry already holding it could save nothing once it is reserved: the migration
-- refuses to run rather than leave one in that state.
do $$
begin
  if exists (select 1 from public.ministry where short_name = 'refer') then
    raise exception 'A Ministry holds the short name refer. Give it another before reserving refer for the Refer page.';
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
    'overview', 'r', 'refer', 'relationships', 'roster', 'search', 'settings', 'setup',
    'signup', 'sms', 'stripe', 'suggested-pairs'
  ]);
$$;

revoke execute on function app.short_name_is_reserved(text) from public, anon, authenticated;
grant execute on function app.short_name_is_reserved(text) to discipler_command, service_role;

-- The one thing the inviting church's history may say about a referral: an ID that opens
-- nothing, because `referral` is operator-only. Never the invited church's own ID.
alter table referral add column id uuid not null default gen_random_uuid();
alter table referral add constraint referral_id_is_unique unique (id);

comment on column referral.id is
  'The opaque referral ID on the inviting church''s `referral.*` events.';

-- A church's own live code, for its own Admin's page. As its owner, because `referral_code`
-- has no browser grant, and the Admin test is what scopes it: the page function is read
-- through the Admin's session, and any other church gets nothing.
create function app.live_referral_code(target_ministry_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select held.code
    from public.referral_code held
   where held.ministry_id = target_ministry_id
     and held.retired_at is null
     and app.is_admin_of(target_ministry_id);
$$;

revoke execute on function app.live_referral_code(uuid) from public, anon, service_role;
grant execute on function app.live_referral_code(uuid) to authenticated;

-- One document, as every page is, with what the tab bar's badge reads. It holds the code
-- and nothing about anybody the code ever brought, so no page can show what it never read.
create function public.refer_page()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  doc jsonb := app.history_page();
begin
  if doc ->> 'session' <> 'admin' then return doc; end if;
  return doc || jsonb_build_object(
    'referral_code', app.live_referral_code((doc -> 'admin' ->> 'ministry_id')::uuid)
  );
end;
$$;

revoke execute on function public.refer_page() from public, anon, service_role;
grant execute on function public.refer_page() to authenticated;

-- "Get a new link": the church's live code is retired and another issued, at once and with
-- no question. The church is `discipler_command`'s own, so it cannot name another's, which
-- is why this is granted and `app.issue_referral_code(church)` is not. The lock is per
-- church, because a double click would otherwise fail on the one-live-code index.
create function app.get_a_new_referral_code(at timestamptz)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  church constant uuid := app.command_ministry_id();
begin
  if church is null then
    raise exception 'A new referral code is asked for by a church';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(church::text || ':referral_code', 0)
  );
  update public.referral_code
     set retired_at = at
   where ministry_id = church
     and retired_at is null;
  return app.issue_referral_code(church);
end;
$$;

revoke execute on function app.get_a_new_referral_code(timestamptz) from public, anon, authenticated, service_role;
grant execute on function app.get_a_new_referral_code(timestamptz) to discipler_command;

-- The month free a church earns when a church it invited pays its first real bill. One per
-- referral, which is the whole of what makes a replayed event or a second invoice earn
-- nothing. Operator-only, in the shape of `referral` and named in
-- `src/platform/supabase/operator-only-tables.ts`, because it spans the two churches and
-- neither may read it. What an inviting church sees is a credit on Billing, read from Stripe.
--
-- `applying` is committed, with its amount, before Stripe is called, and it is this row and
-- not Stripe's idempotency key that a retry trusts, because that key lasts only a day. A
-- retry first looks at the customer's balance for a transaction naming this row's ID.
create table referral_credit (
  id                  uuid primary key default gen_random_uuid(),
  referral            uuid not null references referral (id) on delete cascade,
  stripe_invoice_id   text not null,
  stripe_charge_id    text,
  paid_at             timestamptz not null,
  held_until          timestamptz not null,
  earned_at           timestamptz not null,
  state               text not null default 'held',
  -- Set when it is decided, and stored so a retry credits what was decided.
  amount_cents        integer,
  -- A lease, as `stripe_event` holds one, so two passes do not work on one credit.
  claimed_until       timestamptz,
  stripe_balance_transaction_id text,
  applied_at          timestamptz,
  cancelled_at        timestamptz,
  cancelled_because   text,
  sent_to_review_at   timestamptz,
  review_because      text,
  settled_at          timestamptz,
  settled_as          text,

  constraint referral_credit_one_per_referral unique (referral),
  constraint referral_credit_state_is_known
    check (state in ('held', 'applying', 'applied', 'cancelled', 'in_review', 'settled')),
  constraint referral_credit_amount_is_real
    check (amount_cents is null or amount_cents > 0),
  constraint referral_credit_applying_has_an_amount
    check (state not in ('applying', 'applied') or amount_cents is not null),
  constraint referral_credit_applied_says_how
    check (state <> 'applied' or (stripe_balance_transaction_id is not null and applied_at is not null)),
  constraint referral_credit_cancelled_says_why
    check (state <> 'cancelled' or (cancelled_at is not null and cancelled_because is not null)),
  constraint referral_credit_in_review_says_why
    check (state <> 'in_review' or (sent_to_review_at is not null and review_because is not null)),
  constraint referral_credit_settled_says_how
    check (
      state <> 'settled'
      or (
        sent_to_review_at is not null
        and review_because is not null
        and settled_at is not null
        and settled_as in ('credited', 'not_credited')
      )
    )
);

create index referral_credit_coming_due on referral_credit (held_until)
  where state in ('held', 'applying');
create index referral_credit_by_charge on referral_credit (stripe_charge_id)
  where stripe_charge_id is not null;

alter table referral_credit enable row level security;
alter table referral_credit force  row level security;

revoke all on referral_credit from anon, authenticated, service_role, discipler_command;

comment on table referral_credit is
  'The credit a church earned by inviting another, one per referral: held after the invited '
  'church''s first real payment, then applied at Stripe, cancelled, or sent to James to review '
  'and settle by hand.';
