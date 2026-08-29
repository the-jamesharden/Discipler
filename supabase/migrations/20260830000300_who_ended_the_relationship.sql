-- ---------------------------------------------------------------------------
-- Who ended a relationship
-- ---------------------------------------------------------------------------
--
-- `ended_at` and `ended_reason` said when a relationship stopped and why, and
-- nothing said who decided. Cancelling an unaccepted relationship closes every
-- membership in it and puts people back in the suggestion pool without anybody
-- being told, so it is exactly the kind of act the product rules require a record
-- of: sensitive actions are accountable, and an unattributed one is not.
--
-- The column sits beside the two it belongs with rather than waiting for ticket
-- 13. That ticket ends relationships that have started, which is a second writer
-- of the same three columns -- and a `ended_by` added then would leave every
-- cancellation before it unattributed.
--
-- Keyed to membership of *this* Ministry rather than merely to an account that
-- exists, by the composite key this schema uses everywhere a row has to stay
-- inside its Ministry. Holding an account is not standing to disband somebody
-- else's relationship, and this is what refuses the write rather than trusting the
-- session the command was handed.
--
-- `on delete set null (ended_by)` names the one column to clear, because
-- `ministry_id` is not null and the ordinary form would try to null both. Removing
-- somebody from a Ministry must not be blocked by a relationship they cancelled
-- two years ago -- the durable record of who acted is the `relationship.cancelled`
-- event in `ministry_event`, which is append-only and outlives the membership.
-- This column is what a screen shows while they are still here.
alter table relationship
  add column ended_by uuid,
  add constraint relationship_ended_by_fk
    foreign key (ministry_id, ended_by) references ministry_member (ministry_id, user_id)
    on delete set null (ended_by),

  -- An actor with no ending date would be a relationship nothing had ended,
  -- credited to somebody. The converse is deliberately allowed: `on delete set
  -- null` clears this column when the membership goes, and the ending stands.
  add constraint relationship_ending_is_dated
    check (ended_by is null or ended_at is not null);
