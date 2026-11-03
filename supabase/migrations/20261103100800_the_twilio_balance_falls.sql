-- Exponential launch, ticket 08 -- the Twilio balance alarm
--
-- Below its floor support@ is emailed once, and again only after the balance has
-- recovered and fallen again. A tick has no memory of its own, so this is what
-- remembers: one row per fall, kept as history once it closes. The floor itself is
-- `TWILIO_BALANCE_FLOOR_CENTS` in `src/domain/twilio-balance.ts`; nothing here
-- restates it.
-- ---------------------------------------------------------------------------

create table twilio_balance_fall (
  id                      uuid primary key default gen_random_uuid(),
  fell_at                 timestamptz not null,
  -- What the read said when it fell. The email is written from this and never from
  -- a later read, so a retry of an email that did not go is the same message.
  balance_cents           integer not null,
  -- Null until support@ has been told; the next pass tries again until then.
  told_at                 timestamptz,
  recovered_at            timestamptz,
  recovered_balance_cents integer,
  constraint twilio_balance_fall_recovery_is_whole
    check ((recovered_at is null) = (recovered_balance_cents is null))
);

-- At most one fall is open at a time, so two passes racing to record one cannot
-- open two.
create unique index twilio_balance_fall_one_open
  on twilio_balance_fall ((1))
  where recovered_at is null;

-- ---------------------------------------------------------------------------
-- Who may touch it: nobody but the trusted connection
-- ---------------------------------------------------------------------------

-- The `ministry_setup` shape (`OPERATOR_ONLY_TABLES`). The Twilio account belongs to
-- no church, so there is no Ministry to scope a policy to and no policy at all.
alter table twilio_balance_fall enable row level security;
alter table twilio_balance_fall force  row level security;

revoke all on twilio_balance_fall from anon, authenticated, service_role, discipler_command;

comment on table twilio_balance_fall is
  'Each time the Twilio balance fell below its floor, and when support@ was told and it recovered. Belongs to no church.';
