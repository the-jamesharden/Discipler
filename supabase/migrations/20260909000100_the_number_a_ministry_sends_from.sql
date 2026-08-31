-- The number a Ministry sends from.
--
-- *Sending identity is a property of the Ministry from the first line of code, with
-- one number per Ministry for the pilot.* That sentence in the spec is a warning
-- against exactly the shortcut this column exists to refuse: a single number in the
-- environment, shared by every Ministry, which reads as one congregation texting
-- another's people the first time a second Ministry is onboarded. It is cheap now
-- and a migration against live message history later.
--
-- Nullable, because a Ministry exists before anybody has bought it a number and
-- creating one must not require having done so. The sending layer refuses to drain a
-- Ministry with no number rather than falling back to somebody else's -- a missing
-- sender is a misconfiguration, not a fact about a recipient, and the withholding
-- reasons are all recipient-level by design.
alter table ministry
  add column sending_number text
    constraint ministry_sending_number_is_e164
      check (sending_number is null or sending_number ~ '^\+[1-9][0-9]{1,14}$');

comment on column ministry.sending_number is
  'The number this Ministry''s messages are sent from, in E.164. One number per '
  'Ministry for the pilot. Null until one is provisioned, which refuses the drain '
  'rather than borrowing another Ministry''s identity. Where a Ministry settings '
  'surface lands (ticket 22) this is the field it edits; it is not `from_name`, '
  'which is the display name a message reads as.';
