-- Manual pairing, Unpair (James, 2026-09-21): a third way an invitation that was
-- never accepted ends. An Admin takes it back.
--
-- A Discipler an Admin added to a group that is already running holds an
-- invitation and leads nothing until they accept it. Until now it ended two ways:
-- they declined on the page the link opens, or nobody answered and the tick
-- withdrew it at two weeks. Unpair on their page is the Admin changing their mind,
-- and it is the same withdrawal: the invitation stops opening anything, and their
-- unaccepted leader membership ends with it, dated and never deleted.
--
-- `withdrawn_as` says which of the ways it was, so the record stays true: nobody
-- declined, and nothing ran out. Who took it back is on the history event, like
-- every other Admin act, which is the record that survives them leaving.
--
-- Nothing else about the table changes. `invitation_withdrawal_is_whole`,
-- `invitation_ends_one_way` and the one-live index all read `withdrawn_at`, and a
-- withdrawn invitation still stands in nobody's way of being invited again.
alter table invitation
  drop constraint invitation_withdrawn_as_is_known;

alter table invitation
  add constraint invitation_withdrawn_as_is_known
    check (withdrawn_as is null or withdrawn_as in ('declined', 'expired', 'withdrawn'));

comment on column invitation.withdrawn_at is
  'When this invitation was withdrawn without being accepted: its Leader declined, '
  'nobody answered before it expired, or an Admin took it back. Null on a live or a '
  'consumed invitation.';
comment on column invitation.withdrawn_as is
  'Which of the three withdrew it: declined, by its Leader on the page the link opens; '
  'expired, by the scheduled tick; or withdrawn, by an Admin.';
