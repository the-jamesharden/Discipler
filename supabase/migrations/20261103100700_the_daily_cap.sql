-- ---------------------------------------------------------------------------
-- The daily cap (Exponential launch, ticket 07)
-- ---------------------------------------------------------------------------
--
-- Twilio limits how many texts Discipler's brand sends in a day, and answers a send
-- over it with error 30023 until midnight Pacific. What is on the queue stays on the
-- queue; this is the record that says nothing should be tried until then, and the
-- moment each check-in in an hour may leave.
--
-- Additive only. The build still serving when this is pushed neither reads nor
-- writes either of them, and sends exactly as it did.

-- ---------------------------------------------------------------------------
-- The days the limit was reached
-- ---------------------------------------------------------------------------

-- Operator-only, in the `ministry_setup` shape: the limit is the brand's, so it
-- belongs to no church, and a row holds no church and no phone. One row a Pacific
-- day, the first reach kept, so support@ hears once a day however many sends are
-- refused. Kept as history.
create table daily_cap_hold (
  -- The Pacific day it was reached in. Stored, not derived from `reached_at`, because
  -- it is the key that makes this once a day.
  day          date primary key,
  reached_at   timestamptz not null,
  -- Midnight Pacific at the end of `day`, when Twilio starts counting again.
  held_until   timestamptz not null,
  -- When support@ was told. Null while the email is still owed, so one that could
  -- not go is tried again on the next drain.
  alerted_at   timestamptz,

  constraint daily_cap_hold_ends_after_it_starts check (held_until > reached_at)
);

-- What every drain asks: the one most recently reached.
create index daily_cap_hold_by_reached_at on daily_cap_hold (reached_at desc);

alter table daily_cap_hold enable row level security;
alter table daily_cap_hold force  row level security;

revoke all on daily_cap_hold from anon, authenticated, service_role, discipler_command;

comment on table daily_cap_hold is
  'Each Pacific day Twilio answered a text with error 30023. While a row''s '
  'held_until is ahead, no church''s queue is sent. Operator-only.';

-- ---------------------------------------------------------------------------
-- When a text may leave
-- ---------------------------------------------------------------------------

-- Null on every row today, and while the send pass runs hourly: a check-in is only
-- given a moment of its own once passes are frequent enough to honour it
-- (`SEND_PASS_EVERY_MINUTES`). Unlike `scheduled_for`, which records and never gates,
-- this one gates.
alter table outbound_message
  add column not_before timestamptz;

comment on column outbound_message.not_before is
  'The moment this text may leave, or null for the next pass. Spreads the check-ins '
  'of one hour across that hour; the send pass leaves a row alone until then.';
