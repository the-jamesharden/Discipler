-- ---------------------------------------------------------------------------
-- Billing records (Exponential launch, ticket 03)
-- ---------------------------------------------------------------------------
--
-- What Discipler keeps about a church's billing. The Stripe webhook is the only
-- writer of billing state, and it writes three things:
--
-- * `stripe_event`: the inbox, keyed by Stripe's event ID, so an event replayed is
--   an event recorded once. It belongs to no church until it has been read, so it
--   is operator-only.
-- * `billing_event`: the append-only history of what each processed event
--   established. A church's billing state is derived from it, never overwritten.
-- * `ministry_billing`: the church's Stripe IDs, so one can be looked up, and the
--   operator's flag. It carries no status: a status here would be a second answer
--   to a question the history already answers.
--
-- Nothing here stops a text or locks a page. The texting gate (ticket 05) and the
-- read-only pages (ticket 33) read `app.billing_state_of` below.

-- ---------------------------------------------------------------------------
-- The church's Stripe IDs, and the operator's flag
-- ---------------------------------------------------------------------------

-- One row per church, written when it opens. The IDs are Stripe's and nothing else
-- about a payment is kept (the spec's first required protection).
create table ministry_billing (
  ministry_id              uuid primary key references ministry (id) on delete cascade,
  stripe_customer_id       text unique
    constraint ministry_billing_customer_is_stripes check (stripe_customer_id ~ '^cus_'),
  stripe_subscription_id   text,
  stripe_latest_invoice_id text,
  stripe_price_id          text,
  -- Which of Stripe's two worlds the IDs above are from.
  livemode                 boolean,
  -- A church that keeps working with no subscription, settled by hand. Set by the
  -- operator on the trusted connection: no grant below reaches this column, so no
  -- command and no event can turn it on or off.
  billed_outside_stripe    boolean not null default false,

  constraint ministry_billing_customer_has_a_mode
    check (stripe_customer_id is null or livemode is not null)
);

alter table ministry_billing enable row level security;
alter table ministry_billing force  row level security;

-- No grant to a browser at all, for reading either: a page gets the church's
-- standing from its page function and never a Stripe ID.
revoke all on ministry_billing from anon, authenticated, service_role, discipler_command;

grant select on ministry_billing to discipler_command;
grant insert (ministry_id, stripe_customer_id, stripe_subscription_id,
              stripe_latest_invoice_id, stripe_price_id, livemode)
  on ministry_billing to discipler_command;
grant update (stripe_customer_id, stripe_subscription_id,
              stripe_latest_invoice_id, stripe_price_id, livemode)
  on ministry_billing to discipler_command;

create policy ministry_billing_command_read on ministry_billing
  for select to discipler_command
  using (ministry_id = app.command_ministry_id());
create policy ministry_billing_command_add on ministry_billing
  for insert to discipler_command
  with check (ministry_id = app.command_ministry_id());
create policy ministry_billing_command_change on ministry_billing
  for update to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

comment on table ministry_billing is
  'A church''s Stripe IDs and the operator''s billed-outside-Stripe flag. Written as '
  '`discipler_command` by the webhook; its status lives in `billing_event`.';

-- ---------------------------------------------------------------------------
-- What each processed event established: append-only
-- ---------------------------------------------------------------------------

create table billing_event (
  id                        uuid primary key default gen_random_uuid(),
  -- The order they were recorded in. Recording takes a lock per church and re-reads
  -- Stripe inside it, so for one church this is also the order Stripe was read in:
  -- the last row is the last thing Stripe said, whatever order the events came in.
  position                  bigint generated always as identity,
  ministry_id               uuid not null references ministry (id) on delete cascade,
  -- One row per event, so an event processed twice is recorded once.
  stripe_event_id           text not null unique,
  stripe_event_type         text not null,
  -- When Stripe says the event happened, and when it landed here.
  stripe_event_at           timestamptz not null,
  recorded_at               timestamptz not null,
  livemode                  boolean not null,
  stripe_customer_id        text not null,
  -- What the event itself was about, where that was an invoice or a charge.
  stripe_invoice_id         text,
  stripe_charge_id          text,
  -- The customer's current Subscription as re-read from Stripe for this event, and
  -- not as the event described it. Null where the customer holds none.
  stripe_subscription_id    text,
  subscription_status       text
    constraint billing_event_status_is_stripes check (subscription_status in (
      'incomplete', 'incomplete_expired', 'trialing', 'active',
      'past_due', 'canceled', 'unpaid', 'paused'
    )),
  stripe_price_id           text,
  stripe_latest_invoice_id  text,
  trial_ends_at             timestamptz,
  current_period_ends_at    timestamptz,
  cancels_at                timestamptz,

  constraint billing_event_status_comes_with_its_subscription
    check ((stripe_subscription_id is null) = (subscription_status is null))
);

create index billing_event_latest_per_church on billing_event (ministry_id, position desc);

create function app.reject_billing_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception
    'billing_event is append-only: % is not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;

-- Triggers as well as grants, as on `ministry_event`: a privileged connection passes
-- row-level security but not these, and truncating is stopped by neither of the
-- others. A church deleted by hand has to step past them, as it does for its events.
create trigger billing_event_no_update
  before update on billing_event
  for each row execute function app.reject_billing_history_mutation();
create trigger billing_event_no_delete
  before delete on billing_event
  for each row execute function app.reject_billing_history_mutation();
create trigger billing_event_no_truncate
  before truncate on billing_event
  for each statement execute function app.reject_billing_history_mutation();

alter table billing_event enable row level security;
alter table billing_event force  row level security;

revoke all on billing_event from anon, authenticated, service_role, discipler_command;

grant select, insert on billing_event to discipler_command;

create policy billing_event_command_read on billing_event
  for select to discipler_command
  using (ministry_id = app.command_ministry_id());
create policy billing_event_command_append on billing_event
  for insert to discipler_command
  with check (ministry_id = app.command_ministry_id());

comment on table billing_event is
  'What each processed Stripe event established, append-only. A church''s billing '
  'state is its last row with a status, through `app.billing_state_of`.';

-- ---------------------------------------------------------------------------
-- The inbox
-- ---------------------------------------------------------------------------

-- Operator-only, in the `ministry_setup` shape, and named in
-- `src/platform/supabase/operator-only-tables.ts`. An event arrives before anybody
-- knows whose it is, so there is no church to scope a policy to.
--
-- Stripe's IDs only: the event itself carries the payer's name, email address and
-- card details, and is not kept.
create table stripe_event (
  -- Stripe's event ID. `on conflict do nothing` on this is what makes a replay safe.
  id                      text primary key,
  type                    text not null,
  livemode                boolean not null,
  occurred_at             timestamptz not null,
  received_at             timestamptz not null,
  stripe_customer_id      text,
  stripe_subscription_id  text,
  stripe_invoice_id       text,
  stripe_charge_id        text,
  -- Every church the event's own metadata names, for the cross-check. Text and not
  -- a reference: it is a claim, and a wrong one is exactly what it is kept to catch.
  named_churches          text[] not null default '{}',
  -- The church its stored customer resolved to, once that is known.
  resolved_church         uuid references ministry (id) on delete set null,
  -- How many times processing has begun, and until when the last one holds it. A
  -- lease and not a held lock, because a function that dies mid-event must not
  -- leave it locked, and the next sweep picks it up once the lease has run out.
  attempts                integer not null default 0,
  claimed_until           timestamptz,
  processed_at            timestamptz,
  outcome                 text
    constraint stripe_event_outcome_is_known
      check (outcome in ('recorded', 'refused', 'ignored')),
  refusal                 text
    constraint stripe_event_refusal_is_known
      check (refusal in ('customer_unknown', 'church_mismatch')),

  constraint stripe_event_processed_with_an_outcome
    check ((processed_at is null) = (outcome is null)),
  constraint stripe_event_refusal_says_why
    check ((outcome = 'refused') = (refusal is not null))
);

-- What the sweep reads: the least tried first, so one event that keeps failing
-- cannot hold back the ones behind it.
create index stripe_event_unprocessed
  on stripe_event (attempts, received_at)
  where processed_at is null;

alter table stripe_event enable row level security;
alter table stripe_event force  row level security;

revoke all on stripe_event from anon, authenticated, service_role, discipler_command;

comment on table stripe_event is
  'The Stripe webhook''s inbox, one row per event ID, holding Stripe''s IDs only. '
  'Operator-only; the sweep on the scheduled tick processes what the response missed.';

-- ---------------------------------------------------------------------------
-- Which church a stored customer belongs to
-- ---------------------------------------------------------------------------

-- The one read that cannot name its church up front, as `app.sender_of_inbound` is
-- for a text: it answers which church the connection should scope itself to. One
-- customer in, one church out, and nothing about anybody else's row.
create function app.ministry_of_stripe_customer(customer text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.ministry_id from public.ministry_billing b where b.stripe_customer_id = customer;
$$;

revoke execute on function app.ministry_of_stripe_customer(text)
  from public, anon, authenticated, service_role;
grant execute on function app.ministry_of_stripe_customer(text) to discipler_command;

-- ---------------------------------------------------------------------------
-- A church's billing state, derived
-- ---------------------------------------------------------------------------

-- The one statement of who has access, for the texting gate and the pages alike:
--
-- * trialing and active have it, and so does `billed_outside_stripe`;
-- * past due keeps it, because everything keeps running during Stripe's retries;
-- * canceled, unpaid, incomplete_expired and paused have ended;
-- * no subscription, or one whose first payment has not gone through, has none.
--
-- Security definer because neither table is readable from a session. It answers
-- for the church a command is acting for, or for a church the signed-in session
-- administers, and with no row for any other. No Stripe ID leaves it.
create function app.billing_state_of(target uuid)
returns table (
  standing                text,
  has_access              boolean,
  trial_ends_at           timestamptz,
  current_period_ends_at  timestamptz,
  cancels_at              timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select read.standing,
         read.standing in ('outside_stripe', 'trialing', 'active', 'past_due'),
         read.trial_ends_at,
         read.current_period_ends_at,
         read.cancels_at
    from (
      select case
               when coalesce(b.billed_outside_stripe, false) then 'outside_stripe'
               when e.subscription_status is null then 'no_subscription'
               when e.subscription_status in ('incomplete', 'trialing', 'active', 'past_due')
                 then e.subscription_status
               else 'ended'
             end as standing,
             e.trial_ends_at,
             e.current_period_ends_at,
             e.cancels_at
        from (select 1) one
        left join public.ministry_billing b on b.ministry_id = target
        left join lateral (
          select h.subscription_status, h.trial_ends_at, h.current_period_ends_at, h.cancels_at
            from public.billing_event h
           where h.ministry_id = target
             and h.subscription_status is not null
           order by h.position desc
           limit 1
        ) e on true
       where target = app.command_ministry_id() or app.is_admin_of(target)
    ) read;
$$;

revoke execute on function app.billing_state_of(uuid) from public, anon, service_role;
grant execute on function app.billing_state_of(uuid) to authenticated, discipler_command;

comment on function app.billing_state_of(uuid) is
  'A church''s billing state, derived from `billing_event` and the operator''s flag, '
  'for the church a command acts for or a church the session administers.';

-- What the texting gate asks (ticket 05). False for a church this caller may not ask about.
create function app.billing_has_access(target uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select s.has_access from app.billing_state_of(target) s), false);
$$;

revoke execute on function app.billing_has_access(uuid) from public, anon, service_role;
grant execute on function app.billing_has_access(uuid) to authenticated, discipler_command;

-- ---------------------------------------------------------------------------
-- Every page's document carries it
-- ---------------------------------------------------------------------------

-- As `20260926000100_a_page_is_one_read.sql` left it, with `billing` beside `admin`,
-- so the banners on every Admin page (ticket 33) come in the one read that page
-- already makes. Only an Admin's document carries it.
create or replace function app.page_session()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  membership record;
  own uuid;
begin
  if uid is null or not public.session_is_live() then
    return jsonb_build_object('session', 'signed-out');
  end if;

  select mm.ministry_id, m.name
    into membership
    from public.ministry_member mm
    left join public.ministry m on m.id = mm.ministry_id
   where mm.user_id = uid
     and mm.tier = 'admin'
   order by mm.created_at
   limit 1;

  if not found then
    return jsonb_build_object('session', 'not-an-admin', 'user_id', uid);
  end if;

  select p.id
    into own
    from public.person p
   where p.ministry_id = membership.ministry_id
     and p.user_id = uid
   limit 1;

  return jsonb_build_object(
    'session', 'admin',
    'user_id', uid,
    'admin', jsonb_build_object(
      'ministry_id', membership.ministry_id,
      'ministry_name', membership.name,
      'person_id', own
    ),
    'billing', (select to_jsonb(s) from app.billing_state_of(membership.ministry_id) s)
  );
end;
$$;
