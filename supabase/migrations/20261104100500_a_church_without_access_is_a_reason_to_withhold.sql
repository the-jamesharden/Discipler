-- ---------------------------------------------------------------------------
-- A church without access is a reason to withhold (Exponential launch, ticket 05)
-- ---------------------------------------------------------------------------
--
-- Documentation only. The texting gate writes this column with a reason that is about
-- the church and not the recipient, and the column has said it is only ever the second
-- since `20260827000300_intake_the_form_and_the_outbound_queue.sql`. Nothing depends
-- on this having run.
comment on column outbound_message.withheld_reason is
  'Why the sending layer refused this message: the recipient opted out, lost SMS '
  'consent or was removed between enqueue and send, has no phone, or the church held '
  'no access to texting when a drain reached it. Final: a withheld row is never sent. '
  'Codes, never prose.';
