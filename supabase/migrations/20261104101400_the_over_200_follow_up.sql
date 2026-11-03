-- Exponential launch, ticket 14 -- the over-200 follow-up
--
-- A church on the first price that stays above its limit for a whole calendar month
-- causes one email to support@. Whether it did is read off the church's history every
-- time and never stored. What is stored is only what a tick cannot remember for itself:
-- that a month was found, and whether support@ has been told. One row per church per
-- month, and none for a month that called for nothing. The limit and the rule are in
-- `src/domain/over-200.ts`; nothing here restates them.
-- ---------------------------------------------------------------------------

create table over_200_follow_up (
  -- Not `ministry_id`, which is the promise of a policy that scopes the row. The watch
  -- looks across every church, and support@'s record of them belongs to none of them.
  church             uuid not null references ministry (id) on delete cascade,
  -- The calendar month in the church's own zone, as `2026-10`.
  month              text not null
    constraint over_200_follow_up_month_is_a_month check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  -- What the email says, as it was when the month was found. It is written from these
  -- and never from a later read, so a retry of an email that did not go is the same
  -- message.
  church_name        text not null,
  stripe_customer_id text not null
    constraint over_200_follow_up_customer_is_stripes check (stripe_customer_id ~ '^cus_'),
  fewest_people      integer not null,
  recorded_at        timestamptz not null,
  -- Null until support@ has been told; every pass tries again until then.
  told_at            timestamptz,

  primary key (church, month)
);

create index over_200_follow_up_untold
  on over_200_follow_up (recorded_at)
  where told_at is null;

-- ---------------------------------------------------------------------------
-- Who may touch it: nobody but the trusted connection
-- ---------------------------------------------------------------------------

-- The `ministry_setup` shape (`OPERATOR_ONLY_TABLES`), with no policy at all.
alter table over_200_follow_up enable row level security;
alter table over_200_follow_up force  row level security;

revoke all on over_200_follow_up from anon, authenticated, service_role, discipler_command;

comment on table over_200_follow_up is
  'Each month a church on the first price was found to have stayed above its limit, and '
  'when support@ was told. Whether it did is derived from history, not from this.';

-- ---------------------------------------------------------------------------
-- The history it is read from
-- ---------------------------------------------------------------------------

-- The history the growth chart counts from, so the two cannot disagree about what
-- happened. Security invoker, so as `discipler_command` it reads only the church the
-- command names. No other grant changes.
grant execute on function app.growth_inputs(uuid) to discipler_command;
