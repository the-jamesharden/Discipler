-- ---------------------------------------------------------------------------
-- The remaining four Follow-Up Item kinds
-- ---------------------------------------------------------------------------
--
-- Six kinds in total, named for the condition rather than the remedy. Two of them
-- already exist -- the invitation flow was the only thing raising items when it
-- was built -- and these are the rest.
--
-- Every one is an act or a condition no later event undoes, which is the test for
-- belonging in this table. Derived relationship states fail it: `Stalled` clears
-- on an answered check-in, so it could never satisfy *never clears itself*, and it
-- is therefore deliberately absent from this enum. A Concern fails a different
-- test and gets a table of its own in ticket 10: its text reaches one Person at a
-- time, is cleared by default on resolution, and is audited on viewing as well as
-- on resolving. Storing erasable prose beside durable admin records invites one to
-- be treated like the other.
--
-- Alone in its own migration, and deliberately. Postgres will not let a value
-- added to an enum be *used* in the same transaction, and the next migration
-- writes check constraints that name two of these by hand.

-- Raised by the tick, five days after a relationship nobody has accepted was
-- created. The Leader has already been reminded at two days; this is the point at
-- which it stops being theirs to solve.
alter type follow_up_kind add value 'relationship_unaccepted';

-- Raised by the tick at the end of a Pause period. Ticket 12 raises it. Expiry
-- changes no state and sends nothing: the relationship stays `Paused` until an
-- Admin resumes or ends it, which is exactly why it needs an item -- there is no
-- other way anybody would find out.
alter type follow_up_kind add value 'pause_expired';

-- A Leader texting `SWAP`. Ticket 17 raises it. It changes no state, moves nobody
-- and ends nothing; the decision is pastoral and stays with the Admin.
alter type follow_up_kind add value 'swap_requested';

-- A Participant texting a recognized keyword. Ticket 17 raises it. No inbound
-- message falls through to silence, and this is where the ones that need a human
-- land.
alter type follow_up_kind add value 'participant_keyword';
