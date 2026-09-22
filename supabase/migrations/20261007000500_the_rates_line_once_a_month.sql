-- ---------------------------------------------------------------------------
-- Text wording, ticket 01 -- The rates line, once a month
-- ---------------------------------------------------------------------------
--
-- *Msg & data rates may apply. Reply STOP to opt out, HELP for help.* reaches a
-- Person at most once a calendar month, on the first text of that month that would
-- carry it (James, 2026-09-21). Deciding that needs the queue to remember which
-- texts carried it, and until now it did not: the only trace was the words in
-- `body`, and a rule read back out of a message's wording is a rule that changes
-- the day somebody edits the wording.
--
-- So it is a fact on the row, stated by whoever queues it. The month it counts in
-- is the Ministry's, and that is not something a column can hold: it is decided in
-- `src/domain/rates-line.ts` against `ministry.timezone`, and this table only says
-- which rows carried it and when they were queued.

alter table outbound_message
  -- The default is for the backfill and is dropped immediately below, so no
  -- future insert can decline to say whether it carried the line. A row that
  -- defaulted would be answering *did this Person read it* by omission.
  add column carries_rates_line boolean not null default false;

-- The one time the body is read for it. Rows queued before this column existed
-- carry the line exactly where their words end in it, and saying so is what stops
-- every Person being sent it again in the month this ships. The line is at the end
-- of `body` wherever it appears: the only thing composed after it is a shared
-- contact, which the sending layer adds at dispatch and never writes back here.
update outbound_message
   set carries_rates_line = true
 where right(body, length('Msg & data rates may apply. Reply STOP to opt out, HELP for help.'))
       = 'Msg & data rates may apply. Reply STOP to opt out, HELP for help.';

alter table outbound_message
  alter column carries_rates_line drop default;

comment on column outbound_message.carries_rates_line is
  'Whether this text carried the rates and opt-out line when it was queued. What the '
  'once-a-month rule counts: a row withheld at send time does not count, because '
  'nobody read it.';

-- The read made before every command that queues a text which may carry the line:
-- when did this Person last have it. Partial, because a row that did not carry it,
-- or was withheld and never read, is never what it asks about.
create index outbound_message_rates_line_idx
  on outbound_message (person_id, enqueued_at desc)
  where carries_rates_line and withheld_at is null;
