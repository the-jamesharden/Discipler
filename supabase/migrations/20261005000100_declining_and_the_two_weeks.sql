-- Manual pairing, recut ticket 06 -- Declining an invitation, and one nobody
-- answers is withdrawn after two weeks
--
-- Until now an invitation ended one way: its Leader accepted. A Leader can now
-- decline on the page their link opens, and one nobody answers is withdrawn by
-- the tick when its fortnight runs out (decided by James on 2026-09-21). Either
-- way their unaccepted leader membership is ended, never deleted, and an Admin is
-- told on the Follow-Up tab.
--
-- The fortnight itself needs nothing here: `invitation.expires_at` already holds
-- it, and re-issuing already resets it.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The Follow-Up Item the two weeks raise
-- ---------------------------------------------------------------------------
-- Named for the condition, as every kind is. It carries the Person and the
-- relationship and nothing else, so `follow_up_item_payload_matches_kind` takes
-- it on its `else` and is not rebuilt.
--
-- A decline needs no value: `match_declined` has been one since the table was
-- made, and nothing has raised it since ADR-0011 withdrew the Participant's
-- decline.
alter type follow_up_kind add value 'invitation_expired';

-- ---------------------------------------------------------------------------
-- An invitation that was withdrawn says so
-- ---------------------------------------------------------------------------
-- Not `consumed_at`, which is an account being made with the link and sends its
-- holder to sign in. A withdrawn invitation is a third ending, and the row keeps
-- it: that somebody was invited, when, and how it ended stays in the Ministry's
-- record, and the page a declined link opens can say so without reading history.
alter table invitation
  add column withdrawn_at timestamptz,
  add column withdrawn_as text;

alter table invitation
  add constraint invitation_withdrawn_as_is_known
    check (withdrawn_as is null or withdrawn_as in ('declined', 'expired')),
  add constraint invitation_withdrawal_is_whole
    check ((withdrawn_at is null) = (withdrawn_as is null)),
  add constraint invitation_withdrawn_after_it_is_issued
    check (withdrawn_at is null or withdrawn_at >= created_at),
  -- One ending each. A link that made an account was not withdrawn, and a
  -- withdrawn one makes no account.
  add constraint invitation_ends_one_way
    check (consumed_at is null or withdrawn_at is null);

comment on column invitation.withdrawn_at is
  'When this invitation was withdrawn without being accepted: its Leader declined, '
  'or nobody answered before it expired. Null on a live or a consumed invitation.';
comment on column invitation.withdrawn_as is
  'Which of the two withdrew it: declined, by its Leader on the page the link opens, '
  'or expired, by the scheduled tick.';

-- A withdrawn invitation is not live, so it no longer stands in the way of a new
-- one: somebody who declined, or never answered, can be invited again, and the
-- new invitation is a row of its own beside the record of the old one.
drop index invitation_one_live_per_person_per_relationship;

create unique index invitation_one_live_per_person_per_relationship
  on invitation (relationship_id, person_id)
  where consumed_at is null and withdrawn_at is null;
