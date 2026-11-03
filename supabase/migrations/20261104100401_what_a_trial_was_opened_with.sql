-- ---------------------------------------------------------------------------
-- What a trial was opened with (Exponential launch, ticket 04)
-- ---------------------------------------------------------------------------

-- One row per Subscription opened for a church: which cycle and offer, and whether
-- what comes after its setup intent is confirmed has been done. The offer's bills are
-- scheduled then and not at opening, because whether a free month may be given depends
-- on a card that is not known until then. Stripe's ID and nothing about the payer.
create table trial_opening (
  stripe_subscription_id  text primary key,
  ministry_id             uuid not null references ministry (id) on delete cascade,
  billing_cycle           text not null
    constraint trial_opening_cycle_is_known check (billing_cycle in ('month', 'year')),
  offer                   text not null
    constraint trial_opening_offer_is_known check (offer in ('none', 'exponential', 'referral')),
  opened_at               timestamptz not null,
  settled_at              timestamptz,
  -- `free_month_refused`: it came with a first free month that its card or bank account
  -- had already had, so its bills run as if it had come with none.
  settled_as              text
    constraint trial_opening_settled_as_is_known
      check (settled_as in ('as_opened', 'free_month_refused')),

  constraint trial_opening_settled_says_how
    check ((settled_at is null) = (settled_as is null))
);

create index trial_opening_per_church on trial_opening (ministry_id);

alter table trial_opening enable row level security;
alter table trial_opening force  row level security;

revoke all on trial_opening from anon, authenticated, service_role, discipler_command;

grant select on trial_opening to discipler_command;
grant insert (stripe_subscription_id, ministry_id, billing_cycle, offer, opened_at)
  on trial_opening to discipler_command;
grant update (settled_at, settled_as) on trial_opening to discipler_command;

create policy trial_opening_command_read on trial_opening
  for select to discipler_command
  using (ministry_id = app.command_ministry_id());
create policy trial_opening_command_add on trial_opening
  for insert to discipler_command
  with check (ministry_id = app.command_ministry_id());
create policy trial_opening_command_settle on trial_opening
  for update to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

comment on table trial_opening is
  'What each Subscription was opened with, and whether what follows its confirmed setup '
  'intent has been done. Written as `discipler_command`.';

-- ---------------------------------------------------------------------------
-- One first free month and one plant year per card or bank account
-- ---------------------------------------------------------------------------

-- Operator-only, in the `ministry_setup` shape, and named in
-- `src/platform/supabase/operator-only-tables.ts`, because the whole point of a row is
-- that it spans churches: no church may read which card another church used.
create table payment_fingerprint_grant (
  -- Stripe's fingerprint of the card or bank account, unique to this Stripe account.
  fingerprint text not null,
  grant_kind  text not null
    constraint payment_fingerprint_grant_kind_is_known
      check (grant_kind in ('first_free_month', 'plant_year')),
  -- The church that had it. Not `ministry_id`: that name promises a policy scoping it.
  church      uuid not null references ministry (id) on delete cascade,
  granted_at  timestamptz not null,

  primary key (fingerprint, grant_kind)
);

alter table payment_fingerprint_grant enable row level security;
alter table payment_fingerprint_grant force  row level security;

revoke all on payment_fingerprint_grant from anon, authenticated, service_role, discipler_command;

comment on table payment_fingerprint_grant is
  'Who has had each thing a card or bank account may have only one of. Operator-only; '
  'reached only through `app.claim_payment_fingerprint`.';

-- The one way in, as `app.ministry_of_stripe_customer` is for the customer: a command
-- acting for one church asks for one grant and hears yes or no, and learns nothing about
-- who holds it. Asking again for what this church already holds is yes, so a retried
-- event is not refused its own free month.
create function app.claim_payment_fingerprint(print text, kind text, at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claiming uuid := app.command_ministry_id();
begin
  if claiming is null then
    raise exception 'A payment fingerprint is claimed only for the church a command acts for'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.payment_fingerprint_grant (fingerprint, grant_kind, church, granted_at)
  values (print, kind, claiming, at)
  on conflict (fingerprint, grant_kind) do nothing;

  return exists (
    select 1 from public.payment_fingerprint_grant g
     where g.fingerprint = print and g.grant_kind = kind and g.church = claiming
  );
end;
$$;

revoke execute on function app.claim_payment_fingerprint(text, text, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function app.claim_payment_fingerprint(text, text, timestamptz) to discipler_command;
