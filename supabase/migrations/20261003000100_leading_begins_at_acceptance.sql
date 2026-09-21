-- Manual pairing, ticket 22 -- Leading begins at acceptance
--
-- Decided by James on 2026-09-20. A leader membership gives its holder nothing
-- until they have accepted it themselves.
--
-- Until ticket 22 this needed no saying. Activation is the last Leader accepting,
-- so a relationship that was running had no Leader on it who had not agreed, and
-- everything that decides what a Leader sees asked only for an open leader
-- membership. An Admin can now add a Discipler to a group that is already
-- running, and the group does not wait for them: the first relationship that is
-- accepted with a Leader on it who is not. Asked only for a membership, that
-- Leader would see the group on their dashboard, with its Disciples' names and the
-- numbers those Disciples agreed to share with whoever leads them, having agreed
-- to lead nobody.
--
-- The same gap was already open one step earlier, and this closes it too: a Leader
-- who holds an account, invited to a *new* relationship, saw it and its people
-- before accepting. What they are shown before they accept is the Invitation
-- Link's page, which is read by the token and asks none of this.
--
-- Two rules, and they are not the same rule:
--
--   1. What a Leader is GIVEN -- sight of a relationship and its people, through
--      the policies and through the dashboard -- takes their own Acceptance,
--      always.
--   2. Who a relationship is SAID TO BE LED BY, on the Admin's screens and on the
--      group Intake link, is everybody it waits on while nobody has activated it,
--      and only the Leaders who have accepted once it is running. An unactivated
--      relationship has to go on naming who it is waiting for.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Rule 2, said once
-- ---------------------------------------------------------------------------
-- Whether an open leader membership is one of the relationship's Leaders yet.
-- Handed the two dates and nothing else, so it is a fact about them and every
-- caller reads the rows it already has. The TypeScript that derives the same
-- thing from a page document is `countsAsLeading` in `src/domain/relationships.ts`.
create function app.counts_as_leading(
  relationship_accepted_at timestamptz,
  member_accepted_at       timestamptz
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select relationship_accepted_at is null or member_accepted_at is not null;
$$;

comment on function app.counts_as_leading(timestamptz, timestamptz) is
  'Whether an open leader membership is named as one of its relationship''s '
  'Leaders: always while nobody has activated the relationship, which has to say '
  'who it is waiting on, and only once they have accepted on one that is running '
  '(Manual pairing, ticket 22). Not what a Leader is given, which always takes '
  'their own Acceptance.';

revoke execute on function app.counts_as_leading(timestamptz, timestamptz) from public, anon, service_role;
grant execute on function app.counts_as_leading(timestamptz, timestamptz) to authenticated, discipler_command;

-- ---------------------------------------------------------------------------
-- Rule 1, in the two helpers every Leader policy stands on
-- ---------------------------------------------------------------------------
-- `person_read_led`, `relationship_read_own_ministry`,
-- `relationship_member_read_own_ministry`, `material_assignment_read_led`,
-- `app.leads_relationship_using_material`, the Material's storage object,
-- `relationship_availability`, `relationship_pauses` and `contact_to_share` all
-- ask one of these two, so this is the whole of what a policy grants a Leader.
-- One line added to each; the rest is as `20260826000100` left it.
create or replace function app.leads_relationship(target_relationship_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.relationship_member m
    join public.person p on p.id = m.person_id
    where m.relationship_id = target_relationship_id
      and m.role = 'leader'
      and m.ended_at is null
      and m.accepted_at is not null
      and p.user_id = (select auth.uid())
  );
$$;

create or replace function app.leads_person(target_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.relationship_member subject
    join public.relationship_member mine
      on mine.relationship_id = subject.relationship_id
    join public.person me on me.id = mine.person_id
    where subject.person_id = target_person_id
      and subject.ended_at is null
      and mine.role = 'leader'
      and mine.ended_at is null
      and mine.accepted_at is not null
      and me.user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Rule 1, on the Leader Dashboard
-- ---------------------------------------------------------------------------
-- The policies above already hide an unaccepted membership from the Leader who
-- holds it. They do not hide it from an Admin who also leads, whose sight of the
-- Ministry's rows is an Admin's, so `led` says it for itself rather than leaning
-- on which policy happened to answer.
--
-- And a Leader who has not accepted is not yet somebody the others lead *with*:
-- the members, names, contacts and availability of a led relationship leave them
-- out, so a Leader is not shown a co-leader who has agreed to nothing. `present`
-- is that set, written once and read by all four.
--
-- Everything else is restated exactly as `20260926000100` left it.
create or replace function public.relationships_page()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  doc jsonb := app.page_session();
  uid uuid := (select auth.uid());
  mine uuid[];
  led uuid[];
  ministries uuid[];
begin
  if doc ->> 'session' = 'signed-out' then return doc; end if;

  mine := array(select p.id from public.person p where p.user_id = uid);

  led := array(
    select distinct m.relationship_id
      from public.relationship_member m
     where m.person_id = any (mine)
       and m.role = 'leader'
       and m.ended_at is null
       and m.accepted_at is not null
  );

  ministries := array(
    select distinct m.ministry_id
      from public.relationship_member m
     where m.relationship_id = any (led)
       and m.ended_at is null
  );

  return (
    with present as (
      select m.relationship_id, m.ministry_id, m.person_id, m.role
        from public.relationship_member m
       where m.relationship_id = any (led)
         and m.ended_at is null
         and (m.role <> 'leader' or m.accepted_at is not null)
    )
    select doc || jsonb_build_object('dashboard', jsonb_build_object(
      'mine', to_jsonb(mine),
      'leaderships', coalesce(
        (select jsonb_agg(jsonb_build_object(
                  'relationship_id', m.relationship_id,
                  'ministry_id', m.ministry_id,
                  'person_id', m.person_id,
                  'role', m.role))
           from public.relationship_member m
          where m.person_id = any (mine)
            and m.role = 'leader'
            and m.ended_at is null
            and m.accepted_at is not null),
        '[]'::jsonb
      ),
      'members', coalesce(
        (select jsonb_agg(jsonb_build_object(
                  'relationship_id', p.relationship_id,
                  'ministry_id', p.ministry_id,
                  'person_id', p.person_id,
                  'role', p.role))
           from present p),
        '[]'::jsonb
      ),
      'ministries', coalesce(
        (select jsonb_agg(jsonb_build_object('id', mi.id, 'name', mi.name))
           from public.ministry mi
          where mi.id = any (ministries)),
        '[]'::jsonb
      ),
      'material_periods', coalesce(
        (select jsonb_agg(to_jsonb(mp))
           from unnest(ministries) as mi(id),
                lateral public.material_periods(mi.id) mp),
        '[]'::jsonb
      ),
      'pauses', coalesce(
        (select jsonb_agg(to_jsonb(pa))
           from unnest(ministries) as mi(id),
                lateral public.relationship_pauses(mi.id) pa),
        '[]'::jsonb
      ),
      'people', app.names_of(array(select distinct p.person_id from present p)),
      'availability', coalesce(
        (select jsonb_agg(jsonb_build_object(
                  'relationship_id', r.id,
                  'person_id', a.person_id,
                  'day', a.day,
                  'hour', a.hour))
           from unnest(led) as r(id),
                lateral public.relationship_availability(r.id) a
          where exists (select 1 from present p
                         where p.relationship_id = r.id
                           and p.person_id = a.person_id)),
        '[]'::jsonb
      ),
      'materials', coalesce(
        (select jsonb_agg(jsonb_build_object(
                  'id', ma.id,
                  'body', ma.body,
                  'pdf_path', ma.pdf_path,
                  'pdf_filename', ma.pdf_filename))
           from public.material ma
          where ma.id in (select mp.material_id
                            from unnest(ministries) as mi(id),
                                 lateral public.material_periods(mi.id) mp
                           where mp.ended_at is null
                             and mp.relationship_id = any (led))),
        '[]'::jsonb
      ),
      'contacts', coalesce(
        (select jsonb_agg(jsonb_build_object(
                  'ministry_id', who.ministry_id,
                  'person_id', who.person_id,
                  'full_name', c.full_name,
                  'phone', c.phone))
           from (select distinct p.ministry_id, p.person_id from present p) who,
                lateral public.contact_to_share(who.ministry_id, who.person_id) c),
        '[]'::jsonb
      )
    ))
  );
end;
$$;

revoke execute on function public.relationships_page() from public, anon, service_role;
grant execute on function public.relationships_page() to authenticated;

-- ---------------------------------------------------------------------------
-- Rule 2, in the history the Admin's tabs derive from
-- ---------------------------------------------------------------------------
-- One key added to each membership: `accepted_at`, as the column holds it. Rows
-- only (`docs/adr/0023-a-page-is-one-read.md`): who counts as leading is derived
-- by the reader from this beside the relationship's own `accepted_at`, which is
-- already in the same document. Everything else is as `20260926000100` left it.
create or replace function app.history_inputs(target_ministry_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with relationships as (
    select r.id, r.created_at, r.accepted_at, r.ended_at
      from public.relationship r
     where r.ministry_id = target_ministry_id
  ),
  members as (
    select m.relationship_id, m.person_id, m.role, m.accepted_at
      from public.relationship_member m
     where m.ministry_id = target_ministry_id
       and m.ended_at is null
  ),
  concerns as (
    select c.id, c.relationship_id, c.raised_by, c.raised_at, c.resolved_at
      from public.concern c
     where c.ministry_id = target_ministry_id
  ),
  follow_ups as (
    select f.id, f.kind, f.raised_at, f.relationship_id, f.person_id, f.payload
      from public.follow_up_item f
     where f.ministry_id = target_ministry_id
       and f.resolved_at is null
  ),
  wanted as (
    select m.person_id as id from members m
    union
    select c.raised_by from concerns c where c.raised_by is not null
    union
    select f.person_id from follow_ups f where f.person_id is not null
  )
  select jsonb_build_object(
    'timezone', (select m.timezone from public.ministry m where m.id = target_ministry_id),
    'relationships', coalesce((select jsonb_agg(to_jsonb(r)) from relationships r), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(to_jsonb(m)) from members m), '[]'::jsonb),
    'people', app.names_of(array(select w.id from wanted w)),
    'weeks', coalesce(
      (select jsonb_agg(to_jsonb(w)) from public.relationship_weeks(target_ministry_id) w),
      '[]'::jsonb
    ),
    'concerns', coalesce(
      (select jsonb_agg(to_jsonb(c) order by c.raised_at desc) from concerns c),
      '[]'::jsonb
    ),
    'pauses', coalesce(
      (select jsonb_agg(to_jsonb(p)) from public.relationship_pauses(target_ministry_id) p),
      '[]'::jsonb
    ),
    'answers', coalesce(
      (select jsonb_agg(to_jsonb(a)) from public.relationship_week_answers(target_ministry_id) a),
      '[]'::jsonb
    ),
    'follow_ups', coalesce(
      (select jsonb_agg(to_jsonb(f) order by f.raised_at desc) from follow_ups f),
      '[]'::jsonb
    )
  );
$$;

revoke execute on function app.history_inputs(uuid) from public, anon, service_role;
grant execute on function app.history_inputs(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Rule 2, where SQL itself names a group's Leaders
-- ---------------------------------------------------------------------------
-- Three lists return names rather than rows, so the rule is applied here. Each is
-- restated as its own migration left it, with `app.counts_as_leading` on the
-- leaders and nothing else changed.

-- The group Intake link, shown to somebody with no session. It lists accepted
-- groups only, so this is *the Leaders who have accepted*: a congregant is never
-- told a group is led by somebody who has not agreed to lead it.
create or replace function public.groups_open_to_join(target_ministry_id uuid)
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
               and m.ended_at is null
               and app.counts_as_leading(r.accepted_at, m.accepted_at)),
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

revoke execute on function public.groups_open_to_join(uuid) from public, anon;
grant execute on function public.groups_open_to_join(uuid) to authenticated, discipler_command;

-- The groups an Admin names and guards, on Intake forms.
create or replace function public.ministry_groups(target_ministry_id uuid)
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
               and m.ended_at is null
               and app.counts_as_leading(r.accepted_at, m.accepted_at)),
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

revoke execute on function public.ministry_groups(uuid) from public, anon;
grant execute on function public.ministry_groups(uuid) to authenticated;

-- The groups on the Pair document. `leaders` follows the rule; `member_ids` does
-- not, and must not: it is how the popup leaves out a group somebody is already
-- in, and a Discipler invited to lead a group is in it, accepted or not.
create or replace function app.pair_groups(target_ministry_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'name', r.name,
        'declared_gender', r.declared_gender,
        'accepted_at', r.accepted_at,
        'disciple_count', live.disciple_count,
        'member_ids', live.member_ids,
        'leaders', coalesce(
          (select jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name)
                            order by p.full_name, p.id)
             from public.person p
            where p.id in (select l.person_id
                             from public.relationship_member l
                            where l.relationship_id = r.id
                              and l.role = 'leader'
                              and l.ended_at is null
                              and app.counts_as_leading(r.accepted_at, l.accepted_at))),
          '[]'::jsonb
        )
      )
      order by r.name nulls last, r.created_at, r.id
    ),
    '[]'::jsonb
  )
    from public.relationship r
   cross join lateral (
     select count(distinct m.person_id) filter (where m.role = 'participant') as disciple_count,
            jsonb_agg(distinct m.person_id order by m.person_id) as member_ids
       from public.relationship_member m
      where m.relationship_id = r.id
        and m.ended_at is null
   ) live
   where r.ministry_id = target_ministry_id
     and r.ended_at is null
     and live.disciple_count >= 2;
$$;

revoke execute on function app.pair_groups(uuid) from public, anon, service_role;
grant execute on function app.pair_groups(uuid) to authenticated;
