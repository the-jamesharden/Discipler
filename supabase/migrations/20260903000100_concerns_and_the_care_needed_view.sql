-- ---------------------------------------------------------------------------
-- Concerns, and why they are not Follow-Up Items
-- ---------------------------------------------------------------------------
--
-- A Concern is a Leader saying, in their own words, that something is wrong. It is
-- the most sensitive text in the product and gets four properties nothing in
-- `follow_up_item` has: the words are reached one Person at a time rather than in a
-- list, *viewing* is audited as well as resolving, resolving clears the words
-- unless somebody deliberately keeps them, and several outstanding on one
-- relationship show as a count.
--
-- The last of those is the reason for a table rather than a seventh follow-up kind:
-- clear-on-resolve is a destructive update, and it has no business sitting in a
-- table of durable admin records that are never rewritten. Care Needed unions the
-- two rather than storing them together.
--
-- Relationship State is not here at all and gets no column. It is derived from
-- history by `deriveRelationshipState`, because a stored state is a second answer
-- waiting to disagree with the record it was computed from.

create table concern (
  id              uuid primary key default gen_random_uuid(),
  ministry_id     uuid not null references ministry (id) on delete cascade,
  relationship_id uuid not null,
  -- The Leader who answered `C`. Recorded rather than assumed: a Participant
  -- check-in would raise one the same way, and the two have to be tellable apart
  -- without reading the prose to find out.
  raised_by       uuid not null,
  raised_at       timestamptz not null,
  -- The reply that carried the words. `checkin_prompt` keeps the raw reply as it
  -- arrived, which is a second copy of the same prose, and clearing one while the
  -- other stands would make clear-on-resolve a gesture. Not null: a Concern that
  -- cannot say where its other copy is cannot promise to clear it, and the day
  -- something raises one without a reply is the day to answer that rather than
  -- the day to discover it.
  prompt_id       uuid not null references checkin_prompt (id) on delete cascade,

  -- The Leader's own words. Nullable because resolving clears them -- this is the
  -- one column in the schema that exists in order to be emptied.
  detail          text,

  resolved_at     timestamptz,
  resolved_by     uuid,

  constraint concern_relationship_fk
    foreign key (relationship_id, ministry_id) references relationship (id, ministry_id)
    on delete cascade,

  constraint concern_raised_by_fk
    foreign key (raised_by, ministry_id) references person (id, ministry_id)
    on delete cascade,

  -- Keyed to their membership of *this* Ministry rather than to an account that
  -- merely exists, and cleared rather than blocking when somebody leaves -- the
  -- durable record of who acted is the `concern.resolved` event in
  -- `ministry_event`, which is append-only and outlives the membership.
  constraint concern_resolved_by_fk
    foreign key (ministry_id, resolved_by) references ministry_member (ministry_id, user_id)
    on delete set null (resolved_by),

  -- The target of `concern_viewing`'s composite foreign key, which is what keeps a
  -- viewing and the Concern it read inside one Ministry declaratively.
  constraint concern_id_ministry_uniq unique (id, ministry_id),

  -- An open Concern with no words is a Concern nobody raised.
  constraint concern_open_carries_its_words
    check (resolved_at is not null or detail is not null),

  constraint concern_resolution_is_dated
    check (resolved_by is null or resolved_at is not null),

  -- Resolving clears the words, with no exception and nothing to set. A Ministry
  -- does not accumulate a permanent file of people's hardest weeks, and this is
  -- the schema refusing to hold one rather than the application promising not to.
  constraint concern_resolution_clears_its_words
    check (resolved_at is null or detail is null),

  constraint concern_resolves_after_it_is_raised
    check (resolved_at is null or resolved_at >= raised_at)
);

-- What the badge counts, and what Care Needed reads. Partial because a resolved
-- Concern is never counted and the table keeps every one ever raised: how many a
-- Ministry raised and how fast it closed them is a question it should be able to
-- ask later.
create index concern_open_per_relationship_idx
  on concern (ministry_id, relationship_id)
  where resolved_at is null;

-- ---------------------------------------------------------------------------
-- Who read it
-- ---------------------------------------------------------------------------

-- Every other read in Discipler is invisible and this one is not. A Ministry should
-- be able to answer who read what somebody said about their marriage, and the
-- answer must not be *we do not keep that*.
--
-- A row per viewing rather than a flag on the Concern: the second Admin to open one
-- is a fact as much as the first was, and a flag would record only whichever of
-- them got there first.
create table concern_viewing (
  id          uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references ministry (id) on delete cascade,
  concern_id  uuid not null,
  -- Nullable for the same reason `concern.resolved_by` is: removing somebody from
  -- a Ministry must not be blocked by a Concern they read two years ago, and the
  -- durable record is the `concern.viewed` event in `ministry_event`.
  viewed_by   uuid,
  viewed_at   timestamptz not null,

  constraint concern_viewing_concern_fk
    foreign key (concern_id, ministry_id) references concern (id, ministry_id)
    on delete cascade,

  constraint concern_viewing_viewer_fk
    foreign key (ministry_id, viewed_by) references ministry_member (ministry_id, user_id)
    on delete set null (viewed_by)
);

create index concern_viewing_concern_idx
  on concern_viewing (ministry_id, concern_id, viewed_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table concern         enable row level security;
alter table concern_viewing enable row level security;
alter table concern         force  row level security;
alter table concern_viewing force  row level security;

revoke all on concern, concern_viewing from anon, authenticated, service_role;

-- The column list is the whole point of this grant, and `detail` is not in it.
--
-- Ticket 10 says the words are reached one Person at a time and that viewing is
-- recorded. A signed-in Admin who could select the column directly would satisfy
-- neither: they would have the whole Ministry's Concerns in one response and leave
-- no trace of having read any of them. So the text is unreachable from the
-- authenticated role at all, and the only path to it is the `concern.view` command,
-- which records the viewing in the same transaction that returns the words.
--
-- Reading a Concern without leaving a trace is not discouraged here. It is
-- unrepresentable.
grant select (id, ministry_id, relationship_id, raised_by, raised_at,
              resolved_at, resolved_by) on concern to authenticated;
grant select on concern_viewing to authenticated;

-- An Admin sees their Ministry's Concerns. A Leader does not -- including the one
-- who raised it. Nothing in the product shows a Leader their own Concern back, and
-- a policy written wider than the product would be a grant waiting for a screen.
create policy concern_read_own_ministry on concern
  for select to authenticated
  using (app.is_admin_of(ministry_id));

create policy concern_viewing_read_own_ministry on concern_viewing
  for select to authenticated
  using (app.is_admin_of(ministry_id));

grant select, insert, update on concern to discipler_command;
grant select, insert on concern_viewing to discipler_command;

-- No delete on either. Resolving empties `detail` and keeps the row, and an audit
-- of who read something is worth nothing if the thing that read it can erase it.
create policy concern_command on concern
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

create policy concern_viewing_command on concern_viewing
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

comment on column concern.detail is
  'The Leader''s own words. Not granted to the authenticated role: the only path '
  'to it is the concern.view command, which records the viewing in the same '
  'transaction that returns the text.';

-- ---------------------------------------------------------------------------
-- The relationship-weeks the counters run over
-- ---------------------------------------------------------------------------

-- One row per relationship per Check-In Sequence that covered it. Facts only: when
-- the conversation opened, whether a reply ever landed for that relationship, and
-- whether the reply that landed said no meeting happened.
--
-- The rule is deliberately *not* here. Which ISO week a row falls in, how many
-- consecutive weeks make a stall, and which of the two care reasons fired are all
-- decided by `deriveRelationshipState`, a pure function with no database anywhere
-- near it. This returns what history holds; the counting stays where a test can
-- drive it in milliseconds.
--
-- `covering` rather than the prompt rows is what the join walks, which is the whole
-- of ticket 10's settled reading: a relationship-week is unanswered when a sequence
-- *covered* it and no reply arrived, whether or not its question was ever sent. A
-- silent Leader with four relationships takes eight days to work through one
-- sequence and a new week abandons it first -- under sent-only counting their third
-- and fourth relationships would never be asked, never accrue a counter, and stay
-- Healthy forever. Which is the invisible failure this ticket exists to catch,
-- arriving on the Leader most in need of catching.
--
-- `closed_at` rides along because *no reply arrived* is not a fact until the
-- conversation is over. While a sequence is still open the Leader has not been
-- silent for that week -- they have not answered *yet*, which is a different thing
-- and one the counting must not read as silence. Emitted rather than filtered
-- here, because which weeks are countable is a rule and the rules live in
-- `deriveRelationshipState`.
--
-- In `public` rather than `app` because this one is called by a screen rather than
-- by a policy: PostgREST exposes `public`, and every other `app.` function here is
-- reached from inside SQL. Security invoker either way -- the policies on
-- `checkin_sequence` and `checkin_prompt` are what scope it to an Admin's own
-- Ministry, exactly as they would a direct select.
create function public.relationship_weeks(target_ministry_id uuid)
returns table (
  relationship_id uuid,
  opened_at timestamptz,
  closed_at timestamptz,
  answered_at timestamptz,
  reported_not_meeting boolean
)
language sql
stable
set search_path = ''
as $$
  select covered.relationship_id,
         s.started_at,
         s.closed_at,
         max(p.answered_at),
         coalesce(bool_or(p.question = 'met' and p.met is false), false)
    from public.checkin_sequence s
    cross join lateral unnest(s.covering) as covered(relationship_id)
    left join public.checkin_prompt p
      on p.sequence_id = s.id
     and p.relationship_id = covered.relationship_id
     and p.answered_at is not null
   where s.ministry_id = target_ministry_id
   group by covered.relationship_id, s.id, s.started_at, s.closed_at;
$$;

revoke execute on function public.relationship_weeks(uuid) from public, anon;
grant execute on function public.relationship_weeks(uuid) to authenticated;
