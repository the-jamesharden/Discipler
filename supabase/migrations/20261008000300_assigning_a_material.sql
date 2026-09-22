-- Materials, ticket 03 -- Assigning a Material.
--
-- Ticket 14 wrote the one function that opens a Material period and nothing
-- routed an Admin to it. This ticket routes two screens there -- the assign row
-- on a folder's cards, and the Material field on a group's card on Intake forms
-- -- and the function learns the two things those screens need that it did not
-- do: un-assign, and refuse the Material that is already running.
--
-- Everything here is additive for the code production runs today, except the
-- one index below, which is the rule that refused an un-assignment.

-- ---------------------------------------------------------------------------
-- A later period with no Material is an un-assignment, and permitted
-- ---------------------------------------------------------------------------

-- Ticket 14 held *exactly one period with no Material per relationship* as a
-- partial unique index, on the reading that a second null period was an
-- un-assignment "no command produces and nothing asked for". The grill of
-- 2026-09-12 asked for it: a "No material" option on the assign row, dated like
-- every other assignment, so an Admin can take a relationship off a Material
-- without putting it on another.
--
-- What the index also did -- keep the opening period unambiguous -- is held
-- without it. `app.reject_broken_material_history` requires the first period in
-- order to carry no Material and to start at acceptance, and orders ties by
-- `started_at, ended_at nulls last, (material_id is not null)`; a second null
-- period is never first in that order, because it starts no earlier than a
-- period that has already ended. The trigger is unchanged.
drop index material_assignment_one_opening_period;

comment on table material_assignment is
  'One period a relationship spent on one Material. A null material_id marks the '
  'period acceptance opens, before the Ministry has assigned anything, or a later '
  'one an Admin opened by un-assigning -- a row saying "none", never the absence '
  'of a row.';

-- ---------------------------------------------------------------------------
-- The function
-- ---------------------------------------------------------------------------

-- The same function with two branches added, and its signature, its security
-- and its grants unchanged.
--
-- A null target now means one of two things, told apart by whether the history
-- is open. Before it is, it is the opening period, and acceptance is the only
-- thing that writes one: it carries no Admin. After, it is an Admin taking the
-- relationship off its Material, and it names that Admin. An opening period
-- asked for twice still answers `material_history_already_open`, so the defect
-- ticket 14 made loud stays loud.
--
-- `material_already_running` is new: a target equal to the running period's
-- Material, a null one included, is refused with nothing written. Ticket 14
-- permitted it as "a dated fact like any other"; the grill decided that saving
-- the Material a relationship is already on is a press that changed nothing, and
-- the folder says so rather than writing a period that means nothing.
create or replace function app.assign_material(
  target_relationship_id uuid,
  target_material_id     uuid,
  at                     timestamptz,
  actor                  uuid
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  standing public.relationship;
  opened   boolean;
  running  public.material_assignment;
begin
  select * into standing
    from public.relationship r
   where r.id = target_relationship_id
     for update;

  -- Not found is also what another Ministry's relationship looks like from here,
  -- because the policy shows this connection neither.
  if not found then return 'relationship_not_found'; end if;

  -- Terminal. A relationship that is over has no further week to attribute, so a
  -- period opened after its ending is one no report could ever ask about.
  if standing.ended_at is not null then return 'relationship_ended'; end if;

  select exists (
    select 1 from public.material_assignment a
     where a.relationship_id = target_relationship_id
  ) into opened;

  if target_material_id is null and actor is null and not opened then
    -- The opening period. Nothing to close and nothing to compare against; the
    -- trigger is what holds it to acceptance. An Admin's un-assign on a history
    -- nobody opened falls to the branch below and answers as the defect it is.
    null;
  elsif target_material_id is null and actor is null then
    -- The opening period asked for a second time. Acceptance writes it once and
    -- carries no Admin; an un-assignment always carries the Admin who made it.
    return 'material_history_already_open';
  else
    -- A Material, or an Admin's un-assignment. The period with no Material runs
    -- from acceptance, so a relationship nobody has accepted has nothing here to
    -- close -- and an assignment dated before that period began would open the
    -- very gap it exists to prevent.
    if standing.accepted_at is null then return 'relationship_not_accepted'; end if;
    if not opened then return 'material_history_not_open'; end if;
    if at < standing.accepted_at then return 'assignment_precedes_acceptance'; end if;
  end if;

  select * into running
    from public.material_assignment a
   where a.relationship_id = target_relationship_id
     and a.ended_at is null;

  if found then
    -- Inside the period it is about to close, which is a stricter thing than
    -- being after acceptance once a second period is running: that one started
    -- later. Closing a period before its own start would raise
    -- `material_assignment_ends_after_it_starts` as a raw constraint violation.
    if at < running.started_at then
      return 'assignment_precedes_running_period';
    end if;

    -- The Material already running, or no Material on a relationship already on
    -- none. Nothing would change but a date, so nothing is written.
    if running.material_id is not distinct from target_material_id then
      return 'material_already_running';
    end if;
  end if;

  -- The close and the open, at one instant. A relationship with no running period
  -- updates nothing here, which is the opening period's case.
  update public.material_assignment a
     set ended_at = at
   where a.relationship_id = target_relationship_id
     and a.ended_at is null;

  insert into public.material_assignment
    (ministry_id, relationship_id, material_id, started_at, assigned_by)
  values
    (standing.ministry_id, target_relationship_id, target_material_id, at, actor);

  return null;
end;
$$;

comment on function app.assign_material(uuid, uuid, timestamptz, uuid) is
  'The only write path that opens a Material period. Closes the running period and '
  'opens its successor at the same instant, in one transaction; returns a refusal '
  'code, or null when it opened. A null target_material_id with no actor opens the '
  'period acceptance opens, once; with an Admin as actor it un-assigns. A target '
  'equal to the running period''s Material answers material_already_running.';

-- Restated rather than assumed: `create or replace` keeps the grants of the
-- function it replaces, and these are the ones ticket 14 gave it.
revoke execute on function app.assign_material(uuid, uuid, timestamptz, uuid)
  from public, anon, authenticated, service_role;
grant execute on function app.assign_material(uuid, uuid, timestamptz, uuid)
  to discipler_command;

-- ---------------------------------------------------------------------------
-- The group form names what each group is working through
-- ---------------------------------------------------------------------------

-- The same groups, in the same order, with one column added: the title of the
-- Material on the group's running period, or null where it is on none. The group
-- form shows it beneath the group's name (S-7), so a Person picking a group can
-- see what it is reading; they are never asked which Material they want.
--
-- Dropped and recreated because the returned row type is changing. The Intake
-- reader selects by name, and nothing in the schema depends on the function.
drop function public.groups_open_to_join(uuid);

create function public.groups_open_to_join(target_ministry_id uuid)
returns table (
  relationship_id uuid,
  name text,
  declared_gender public.gender,
  join_requires_approval boolean,
  leader_first_names text[],
  material_title text
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
         ),
         (select mt.title
            from public.material_assignment a
            join public.material mt on mt.id = a.material_id
           where a.relationship_id = r.id
             and a.ended_at is null)
    from public.relationship r
   where r.ministry_id = target_ministry_id
     and r.kind = 'group'
     and r.name is not null
     and r.accepted_at is not null
     and r.ended_at is null
   order by r.name, r.created_at;
$$;

comment on function public.groups_open_to_join(uuid) is
  'The groups the group Intake form offers: accepted, not ended, formed as a group, '
  'and named, with the first names of the Leaders who have accepted and the title '
  'of the Material on the running period, or null where it is on none.';

-- A new function gets the platform's default execute for `anon` and
-- `service_role`; neither reads this, so both are revoked.
revoke execute on function public.groups_open_to_join(uuid) from public, anon, service_role;
grant execute on function public.groups_open_to_join(uuid) to authenticated, discipler_command;

-- ---------------------------------------------------------------------------
-- Intake forms carries what the Material field on a group's card needs
-- ---------------------------------------------------------------------------

-- The document ticket 29's reads became, with three keys added and nothing else
-- changed. `materials` is the rows `pair_page()` builds -- removed ones included,
-- in title order -- so the reader keeps a removed one off the dropdown with the
-- one definition of *live* every select shares. `group_materials` is the running
-- period of each of the Ministry's live groups: the dropdown is pre-selected on
-- it and the hint says since when. `timezone` is the Ministry's, which that date
-- is printed in.
create or replace function public.intake_forms_page()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  doc jsonb := app.page_session();
  ministry uuid;
begin
  if doc ->> 'session' <> 'admin' then return doc; end if;
  ministry := (doc -> 'admin' ->> 'ministry_id')::uuid;
  return doc || jsonb_build_object(
    'groups', coalesce(
      (select jsonb_agg(to_jsonb(g)) from public.ministry_groups(ministry) g),
      '[]'::jsonb
    ),
    'join_requests', coalesce(
      (select jsonb_agg(to_jsonb(j)) from public.group_join_requests(ministry) j),
      '[]'::jsonb
    ),
    'goal_options', coalesce(
      (select jsonb_agg(to_jsonb(o)) from public.discipleship_goal_options(ministry) o),
      '[]'::jsonb
    ),
    'people', app.names_of(array(select p.id from public.person p where p.ministry_id = ministry)),

    'materials', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', m.id,
                'title', m.title,
                'removed', m.removed)
              order by m.title, m.created_at)
         from public.material m
        where m.ministry_id = ministry),
      '[]'::jsonb
    ),

    'group_materials', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'relationship_id', a.relationship_id,
                'material_id', a.material_id,
                'started_at', a.started_at)
              order by a.relationship_id)
         from public.material_assignment a
         join public.relationship r on r.id = a.relationship_id
        where a.ministry_id = ministry
          and a.ended_at is null
          and r.kind = 'group'
          and r.ended_at is null),
      '[]'::jsonb
    ),

    'timezone', (select m.timezone from public.ministry m where m.id = ministry)
  );
end;
$$;

-- Restated rather than assumed, as every page function's grants are.
revoke execute on function public.intake_forms_page() from public, anon, service_role;
grant execute on function public.intake_forms_page() to authenticated;
