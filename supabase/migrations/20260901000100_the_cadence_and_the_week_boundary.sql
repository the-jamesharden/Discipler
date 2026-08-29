-- ---------------------------------------------------------------------------
-- When a Leader's check-in is due, and against which clock
-- ---------------------------------------------------------------------------
--
-- Ticket 08a built the conversation. This is what decides that a Leader is due
-- this week, at this Ministry's day and hour.
--
-- Ticket 22 builds the settings *screen* over these columns and adds the rest of
-- what a Ministry may vary. The two tickets share this criterion by design: the
-- second to land verifies the constraint rather than re-authoring it.
--
-- Implements `docs/adr/0007-the-check-in-cadence-and-the-week-boundary.md`.

-- ---------------------------------------------------------------------------
-- The Ministry timezone
-- ---------------------------------------------------------------------------

-- Load-bearing well beyond the cadence: every availability block, the ISO week
-- boundary behind the care counters, the nudge day and week windows, and the
-- *first check-in of each calendar month* rule all resolve against it. Until now
-- there was no timezone anywhere in the product and those rules resolved against
-- nothing.
--
-- `UTC` as the default because a default has to be a real zone and UTC is the one
-- zone that is never anybody's wrong local time by accident -- it is visibly not
-- set rather than plausibly set to somewhere else.
alter table ministry
  add column timezone text not null default 'UTC';

-- A zone name is checked against `pg_timezone_names`, which is the IANA zone
-- database Postgres carries -- and, crucially, the same set the application can
-- resolve.
--
-- Not `now() at time zone new.timezone`, which is the obvious way to write this
-- and is wrong. That accepts a strict superset: abbreviations like `CEST` and
-- POSIX specs like `GMT+5` satisfy Postgres and are rejected outright by the
-- `Intl` zone database the dispatcher reads them with. A Ministry saved as
-- `CEST` by SQL would pass this trigger and then throw on every tick, for
-- everybody in it -- which is precisely the failure a check that lives in the
-- database rather than the form exists to prevent.
--
-- A trigger and not a check constraint: reading `pg_timezone_names` is STABLE,
-- not IMMUTABLE -- the zone database changes under a running server -- and a
-- check constraint holding a stable expression is one that a dump and restore
-- can silently fail to reproduce.
create function app.reject_unknown_timezone()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from pg_catalog.pg_timezone_names where name = new.timezone
  ) then
    raise exception '% is not a known timezone', new.timezone
      using errcode = 'check_violation',
            constraint = 'ministry_timezone_is_known';
  end if;
  return new;
end;
$$;

create trigger ministry_timezone_is_known
  before insert or update of timezone on ministry
  for each row execute function app.reject_unknown_timezone();

-- ---------------------------------------------------------------------------
-- The cadence
-- ---------------------------------------------------------------------------

-- `checkin_day` is 0-6 with **0 meaning Sunday** -- the convention Postgres's own
-- `extract(dow)` uses, and the one JavaScript's `getDay` uses, so the number
-- crosses the boundary without being translated by anybody.
--
-- `checkin_hour` is a whole hour. Minutes buy nothing an hour does not and widen
-- the surface the quiet-hours clamp has to police.
--
-- Monday 9am as the default: it is the ADR's own worked example, and a Monday
-- morning prompt about the week just gone is the shape both pilot ministries
-- read as natural. A Ministry that wants Thursday evening says so.
alter table ministry
  add column checkin_day  smallint not null default 1,
  add column checkin_hour smallint not null default 9,

  add constraint ministry_checkin_day_is_a_day_of_the_week
    check (checkin_day between 0 and 6),

  -- The clamp, in the database and not only in the form. Pilot settings will be
  -- written by SQL, so a form-only rule is not a rule -- and a coordinator who
  -- innocently sets 6:30am creates a compliance problem Discipler carries rather
  -- than the ministry. 21 is the last hour that starts before 10pm.
  add constraint ministry_checkin_hour_is_within_quiet_hours
    check (checkin_hour between 8 and 21);

comment on column ministry.checkin_day is
  'Day of the week the check-in sequence is sent, 0-6 with 0 meaning Sunday -- '
  'the same convention as extract(dow). Resolved against ministry.timezone.';

comment on column ministry.checkin_hour is
  'Whole hour, local to ministry.timezone, clamped to 8am-9pm by constraint '
  'rather than by the form: pilot settings are written by SQL.';

-- ---------------------------------------------------------------------------
-- The per-relationship override that nothing surfaces yet
-- ---------------------------------------------------------------------------

-- Nullable, and null on every row. The dispatcher reads
-- `coalesce(r.checkin_day, ms.checkin_day)` from its first line, so behavior is
-- identical to ministry-only until something surfaces these -- and the query
-- never has to be rewritten on the day it does.
--
-- The columns are added now because the schema is the expensive thing to redo:
-- migrating a table carrying live relationships and live history costs more than
-- two nullable columns nothing reads. This will come up -- a Leader holding a
-- Tuesday one-to-one and a Saturday group will want different prompts for each.
alter table relationship
  add column checkin_day  smallint,
  add column checkin_hour smallint,

  add constraint relationship_checkin_day_is_a_day_of_the_week
    check (checkin_day is null or checkin_day between 0 and 6),

  -- The same clamp. An override is a cadence, and a cadence set here at 6:30am
  -- would be exactly the compliance problem the Ministry-level constraint exists
  -- to refuse.
  add constraint relationship_checkin_hour_is_within_quiet_hours
    check (checkin_hour is null or checkin_hour between 8 and 21);

-- ---------------------------------------------------------------------------
-- The cadence, stamped on the message it produced
-- ---------------------------------------------------------------------------

-- The cadence is read at enqueue time and written here. It is a record of which
-- cadence produced this message, not a gate on when it goes out: the dispatcher
-- enqueues *because* the instant has arrived.
--
-- That is what makes an edit affect future periods only. Nothing rewrites this
-- column, so a coordinator moving Monday 8pm to Wednesday 7pm on a Tuesday
-- changes next week and leaves this week's row exactly as it was sent -- which
-- keeps the dispatcher idempotent and the behavior explainable in one sentence.
--
-- Null on every message no cadence scheduled, which is most of them: a reply
-- travels back in seconds and a Welcome Message answers a form.
alter table outbound_message
  add column scheduled_for timestamptz;

comment on column outbound_message.scheduled_for is
  'The cadence instant that made this message due, stamped at enqueue time and '
  'never rewritten. Null when nothing scheduled it. An edit to the cadence '
  'affects future periods only and neither cancels nor reschedules this row.';
