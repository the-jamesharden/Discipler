-- A departure outlives the Admin who recorded it.
--
-- `relationship_member_departed_by_fk` was the one key onto `ministry_member`
-- declared plain `on delete set null`, which clears every column of the key and
-- so tries to null `relationship_member.ministry_id` too, which is not null.
-- Nothing deleted a membership until `app.let_go_of_the_account`
-- (20261012000100); from there, deleting a membership that ever recorded a
-- departure would fail the whole removal instead of clearing who recorded it.
--
-- Named column, as `relationship.ended_by`, `follow_up_item.resolved_by` and the
-- rest already have it: the durable record of who acted is the departure's event
-- in `ministry_event`, which is append-only and outlives the membership.
alter table relationship_member
  drop constraint relationship_member_departed_by_fk,
  add constraint relationship_member_departed_by_fk
    foreign key (ministry_id, departed_by) references ministry_member (ministry_id, user_id)
    on delete set null (departed_by);
