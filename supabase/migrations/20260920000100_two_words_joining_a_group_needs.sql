-- ---------------------------------------------------------------------------
-- Two words joining a group needs: an Intake path and a Follow-Up kind
-- ---------------------------------------------------------------------------
--
-- Alone in its own migration, for the reason `20260830000100` gives: Postgres will
-- not let a value added to an enum be *used* in the transaction that added it, and
-- the migration after this one reads both.
--
-- `group` is the path ticket 27 reserved rather than shipped -- "an enum member
-- nothing writes is a claim about a form nobody can fill in" -- and ticket 29 is
-- the form. Every consent record the converted `/intake/<ministry>` link writes
-- carries it, beside `source`, which goes on answering *link or QR* by itself. The
-- check constraint `consent_record_declared_side_follows_the_path` already says
-- what this path carries for a side: nothing, because a group has no sides.
alter type intake_path add value 'group';

-- A Person asked to join a group the pastor has set to require approval. Raised by
-- the Intake submission and closed by an Admin admitting them or resolving it
-- alone, and never by anything else -- which is the test for being a Follow-Up
-- Item at all. It carries both a Person and a relationship, so the one-open-item
-- index on the table already says *the same Person asking for the same group twice
-- is one thing to act on*. It carries no payload: the item is the request, and what
-- the Admin needs to know -- who, what they answered, which group -- is read off
-- the rows it points at when the list is drawn.
alter type follow_up_kind add value 'group_join_requested';
