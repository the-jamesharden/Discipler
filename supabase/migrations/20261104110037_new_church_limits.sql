-- Exponential launch, ticket 37 -- the limits on a new church's first weeks
--
-- Whether a church is new, how many people its Roster holds and how many texts it has sent
-- are all read off what is already stored, and never kept here. So are the limits' lifting,
-- which is an event in the church's history, `ministry.new_church_limits_lifted`. What is
-- stored is only what a tick cannot remember for itself: that a church hit a limit, and
-- whether support@ has been told. One row per church per limit. The numbers are
-- `NEW_CHURCH_LIMITS` in `src/domain/launch-terms.ts`; nothing here restates them.
-- ---------------------------------------------------------------------------

create table new_church_limit_hit (
  -- Not `ministry_id`, which is the promise of a policy that scopes the row. The watch
  -- looks across every new church, and support@'s record of them belongs to none of them.
  church      uuid not null references ministry (id) on delete cascade,
  limit_kind  text not null
    constraint new_church_limit_hit_kind_is_known check (limit_kind in ('roster', 'texts')),
  -- As it was when the limit was hit. The email is written from this and never from a
  -- later read, so a retry of an email that did not go is the same message.
  church_name text not null,
  hit_at      timestamptz not null,
  -- Null until support@ has been told; every pass tries again until then.
  told_at     timestamptz,

  primary key (church, limit_kind)
);

create index new_church_limit_hit_untold
  on new_church_limit_hit (hit_at)
  where told_at is null;

-- The `ministry_setup` shape (`OPERATOR_ONLY_TABLES`), with no policy at all.
alter table new_church_limit_hit enable row level security;
alter table new_church_limit_hit force  row level security;

revoke all on new_church_limit_hit from anon, authenticated, service_role, discipler_command;

comment on table new_church_limit_hit is
  'Each limit a church hit in its first weeks, and when support@ was told. Whether a church '
  'is still limited is derived from its history, not from this.';

-- Asked on every drain of every church, and the history of an old church is long.
create index ministry_event_new_church_limits_idx
  on ministry_event (ministry_id, type, occurred_at)
  where type in ('ministry.opened', 'ministry.new_church_limits_lifted');
