-- ---------------------------------------------------------------------------
-- Joining a group: a group has a name, an open or a guarded door, and a cap
-- ---------------------------------------------------------------------------
--
-- Ticket 29 turns the Ministry's original Intake link into the form for somebody
-- who wants to join one of its groups. The form's one new question is *which
-- group*, and until this file a relationship had nothing a dropdown could show:
-- `kind`, `declared_gender` and four timestamps. `docs/open-questions.md` had
-- already parked *who names a group and when* for the check-in question's sake;
-- this is the second consumer of that decision, and the two want the same thing.
--
-- Two columns on `relationship`, both about groups and neither immutable.
--
-- `name` is a label an Admin types when forming a group and may change from the
-- Roster afterwards. It is not a ministry event, so editing it overwrites no
-- history -- unlike `kind` and `declared_gender`, which describe periods that
-- ended under the old value. Nullable, because every group that exists today has
-- none and a backfill would be a guess: an unnamed group is left out of the
-- dropdown and keeps the check-in's Participant listing until an Admin names it.
-- The Admin surface requires a name when forming a group; the column does not,
-- for the existing rows' sake.
--
-- `join_requires_approval` is the pastor's switch. Off, a Person who picks the
-- group on the Intake form is in it the moment they submit; on, their submission
-- raises a `group_join_requested` item and an Admin admits them or does not. Off
-- by default, which is a product decision recorded in
-- `docs/adr/0017-picking-a-group-joins-it.md`, and editable because it is not a
-- safety binding: a pastor who gets burned by an open group closes it without
-- ending it.
alter table relationship
  add column name text,
  add column join_requires_approval boolean not null default false;

comment on column relationship.name is
  'What the Ministry calls this group, typed by an Admin when forming it and '
  'editable from the Roster. Null on every one-to-one, and on every group formed '
  'before ticket 29 until an Admin names it -- never backfilled with a guess. A '
  'named group is offered on the group Intake link and asked about by name in '
  'the weekly check-in; an unnamed one is neither.';

comment on column relationship.join_requires_approval is
  'Whether picking this group on the Intake form asks to join rather than joins. '
  'Off by default: a Person who chose a group has chosen. On, the submission '
  'raises a group_join_requested Follow-Up Item and an Admin admits them. A '
  'pastor''s switch, not a safety binding, so it is editable.';

-- Whitespace is not a name. The same rule the Ministry's own name and a
-- Discipleship Goal's label carry, so a group cannot be named into the dropdown as
-- a blank line.
alter table relationship
  add constraint relationship_name_is_not_blank
    check (name is null or length(btrim(name)) > 0);

-- ---------------------------------------------------------------------------
-- A one-to-one holds one Participant
-- ---------------------------------------------------------------------------

-- Until now nothing stopped a second open participant membership landing on a
-- relationship formed as a one-to-one, because nothing could put one there:
-- memberships were written at formation and never again. Joining a group is the
-- first path that adds a Participant to a relationship that already exists, and a
-- one-to-one with two Participants is a relationship whose `kind` lies about it.
--
-- Beside `participant_one_open_one_to_one` and `leader_one_open_group`, and of
-- the same kind: a participation cap, expressed as a partial unique index reading
-- `kind`, which is the one thing ADR-0004 says `kind` is for. The join path never
-- offers a one-to-one -- `groups_open_to_join` below lists groups -- and this is
-- what makes that a rule rather than a filter.
create unique index one_to_one_one_open_participant
  on relationship_member (relationship_id)
  where role = 'participant' and kind = 'one_to_one' and ended_at is null;

-- ---------------------------------------------------------------------------
-- The groups a Person may ask to join
-- ---------------------------------------------------------------------------

-- What the group Intake form offers, and the only read that decides it: accepted,
-- not ended, formed as a group, and named. Read on the command connection by the
-- Intake page -- which is served to somebody with no session -- and by the
-- submission's own check that the group the body names is one the page offered,
-- so the two cannot come to disagree about which groups exist.
--
-- The gender filter is *not* here. The form asks gender before it asks which
-- group, and filters this list on `declared_gender` at the screen; the submission
-- checks the same thing again in the domain, and ticket 25's trigger on
-- `relationship_member` checks it a third time at the insert. Returning every
-- group and filtering above keeps the rule in the place every other gender rule
-- lives.
--
-- The Leader's first names ride along for the page a Person sees once they have
-- joined: it names the Leader so the Person recognises the call when it comes.
-- First names only, and no number -- the same rule the Starter Messages follow --
-- and the whole of what an unauthenticated page is told about a group is its name
-- and who leads it.
--
-- Reads `kind`, which is why this is a function rather than a query in the reader:
-- which relationships can take another Participant is a capacity question, and
-- ADR-0004 fences that column to the database's capacity rules and the code that
-- writes it. The reader asks the database and never names the literal.
create function public.groups_open_to_join(target_ministry_id uuid)
returns table (
  relationship_id uuid,
  name text,
  declared_gender public.gender,
  join_requires_approval boolean,
  leader_first_names text[]
)
language sql
stable
set search_path = ''
as $$
  select r.id,
         r.name,
         r.declared_gender,
         r.join_requires_approval,
         coalesce(
           (select array_agg(split_part(btrim(p.full_name), ' ', 1)
                             order by m.started_at, p.full_name)
              from public.relationship_member m
              join public.person p on p.id = m.person_id
             where m.relationship_id = r.id
               and m.role = 'leader'
               and m.ended_at is null),
           array[]::text[]
         )
    from public.relationship r
   where r.ministry_id = target_ministry_id
     and r.kind = 'group'
     and r.name is not null
     and r.accepted_at is not null
     and r.ended_at is null
   order by r.name, r.created_at;
$$;

comment on function public.groups_open_to_join(uuid) is
  'The groups the Ministry''s group Intake link offers: formed as a group, named, '
  'accepted by every Leader, and not ended. Not filtered by gender -- the form '
  'does that against the gender it has just asked -- and carrying nothing about a '
  'group but its name, its declared gender, whether joining asks or joins, and its '
  'Leaders'' first names.';

-- Security invoker, so the policy on `relationship` scopes it to whichever
-- Ministry the connection acts for: the command connection sees the one it has
-- declared, and an authenticated session sees what it is an Admin or Leader of.
revoke execute on function public.groups_open_to_join(uuid) from public, anon;
grant execute on function public.groups_open_to_join(uuid) to authenticated, discipler_command;

-- ---------------------------------------------------------------------------
-- The Ministry's groups, for the Admin who names them
-- ---------------------------------------------------------------------------

-- Every group the Ministry holds that has not ended, named or not, accepted or
-- not, with everybody in it -- the list an Admin names groups from and switches
-- approval on. Its own read rather than a column on `public.roster`, because the
-- Roster is a list of people and a group is on it once per member.
--
-- Reads `kind` for the reason `groups_open_to_join` does: *is this a group* here
-- means *can it take another Participant*, and that is the column's own question.
create function public.ministry_groups(target_ministry_id uuid)
returns table (
  relationship_id uuid,
  name text,
  declared_gender public.gender,
  join_requires_approval boolean,
  accepted boolean,
  leader_names text[],
  participant_names text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id,
         r.name,
         r.declared_gender,
         r.join_requires_approval,
         r.accepted_at is not null,
         coalesce(
           (select array_agg(p.full_name order by m.started_at, p.full_name)
              from public.relationship_member m
              join public.person p on p.id = m.person_id
             where m.relationship_id = r.id
               and m.role = 'leader'
               and m.ended_at is null),
           array[]::text[]
         ),
         coalesce(
           (select array_agg(p.full_name order by m.started_at, p.full_name)
              from public.relationship_member m
              join public.person p on p.id = m.person_id
             where m.relationship_id = r.id
               and m.role = 'participant'
               and m.ended_at is null),
           array[]::text[]
         )
    from public.relationship r
   where r.ministry_id = target_ministry_id
     and r.kind = 'group'
     and r.ended_at is null
     and app.is_admin_of(target_ministry_id)
   order by r.name nulls last, r.created_at;
$$;

comment on function public.ministry_groups(uuid) is
  'One Ministry''s live groups as the Admin surface shows them, named or not: '
  'what each is called, what it declared, whether joining asks or joins, whether '
  'its Leaders have accepted, and who is in it. An Admin of the Ministry and '
  'nobody else.';

revoke execute on function public.ministry_groups(uuid) from public, anon;
grant execute on function public.ministry_groups(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Who is waiting to be admitted
-- ---------------------------------------------------------------------------

-- Every open `group_join_requested` item, with what an Admin needs beside it to
-- decide: who asked, what they answered about themselves on the form that asked,
-- which group, and when. The gender and the age band are read off the latest
-- Intake submission -- the one the Person made asking -- because that is the
-- answer the Admin is admitting on, and because `intake_submission` is not a table
-- a browser session reads.
--
-- An Admin of the Ministry and nobody else, like `ministry_groups`.
create function public.group_join_requests(target_ministry_id uuid)
returns table (
  item_id uuid,
  person_id uuid,
  full_name text,
  relationship_id uuid,
  group_name text,
  gender public.gender,
  age_band public.age_band,
  raised_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id,
         p.id,
         p.full_name,
         r.id,
         r.name,
         latest.gender,
         latest.age_band,
         f.raised_at
    from public.follow_up_item f
    join public.person p on p.id = f.person_id
    join public.relationship r on r.id = f.relationship_id
    left join lateral (
      select i.gender, i.age_band
        from public.intake_submission i
       where i.person_id = p.id
       order by i.submitted_at desc, i.created_at desc, i.id desc
       limit 1
    ) latest on true
   where f.ministry_id = target_ministry_id
     and f.kind = 'group_join_requested'
     and f.resolved_at is null
     and app.is_admin_of(target_ministry_id)
   order by f.raised_at, p.full_name;
$$;

comment on function public.group_join_requests(uuid) is
  'Everybody waiting to be admitted to a group that requires approval, oldest '
  'request first, with the group they named and what they answered about '
  'themselves. An Admin of the Ministry and nobody else.';

revoke execute on function public.group_join_requests(uuid) from public, anon;
grant execute on function public.group_join_requests(uuid) to authenticated;
