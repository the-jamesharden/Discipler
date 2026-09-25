-- Assigning one Material to many relationships at once
-- ---------------------------------------------------------------------------
-- Richer materials, ticket 02 (`.scratch/richer-materials/spec.md`, *Assigning
-- to many at once*). A Material's folder gains **Assign to more**, opening
-- `/materials/<id>/assign`: every live, accepted relationship not already on
-- it, each with a checkbox, and one button that starts the ticked ones on it in
-- one act. Two things here, and nothing about who may see or write what changes.
--
-- 1. `app.assign_materials`, which runs `app.assign_material` for each of a
--    list of assignments in turn, in one statement, and stops at the first
--    refusal, answering which relationship it was about. The command that
--    assigns many is one transaction already; this makes it one round trip too,
--    rather than one per relationship. Every other assignment -- a single card,
--    the groups card, acceptance -- comes through it as a list of one or two.
--
-- 2. `assign_material_page`, the page's one read
--    (`docs/adr/0023-a-page-is-one-read.md`): the Materials tab's document, and
--    the names of one relationship the last press was refused over. A
--    relationship that ended between the page being drawn and the press is off
--    the tab's list, since the tab lists live ones, so the page could not name
--    it from that list; this is where its name comes from.

-- ---------------------------------------------------------------------------
-- 1. Many assignments in one statement
-- ---------------------------------------------------------------------------
-- The four lists are one assignment per position, as the command's effects
-- list them. In the order given, because order is meaning here: acceptance
-- opens the period with no Material before the Material chosen at pairing
-- closes it at the same instant, and an Admin's many are decided in the order
-- the page listed them, so the one named is the first the page showed.
--
-- A refusal is answered rather than raised, as `app.assign_material` answers
-- one, and nothing after it is attempted. What was written before it is still
-- in the caller's transaction, which the caller rolls back on the refusal:
-- assigning to many is all or nothing, and the rollback is what makes it so.
create function app.assign_materials(
  target_relationship_ids uuid[],
  target_material_ids     uuid[],
  ats                     timestamptz[],
  actors                  uuid[]
)
returns table (refused_relationship_id uuid, refusal text)
language plpgsql
set search_path = ''
as $$
declare
  n      integer;
  answer text;
begin
  -- Four lists that disagree about how many assignments there are is a caller
  -- composing the call wrong, and guessing which list is short would write
  -- somebody's period with another's Material.
  if cardinality(target_relationship_ids) is distinct from cardinality(target_material_ids)
     or cardinality(target_relationship_ids) is distinct from cardinality(ats)
     or cardinality(target_relationship_ids) is distinct from cardinality(actors) then
    raise exception 'app.assign_materials was handed lists of different lengths';
  end if;

  for n in 1 .. coalesce(cardinality(target_relationship_ids), 0) loop
    answer := app.assign_material(target_relationship_ids[n], target_material_ids[n], ats[n], actors[n]);
    if answer is not null then
      refused_relationship_id := target_relationship_ids[n];
      refusal := answer;
      return next;
      return;
    end if;
  end loop;
end;
$$;

comment on function app.assign_materials(uuid[], uuid[], timestamptz[], uuid[]) is
  'app.assign_material for each position of four equal-length lists, in order, '
  'stopping at the first refusal: returns that relationship and the refusal code, '
  'or no row when every assignment opened. The caller''s transaction is what makes '
  'a refusal undo the assignments before it.';

-- The command connection's, as `app.assign_material` is, and nobody else's.
revoke execute on function app.assign_materials(uuid[], uuid[], timestamptz[], uuid[])
  from public, anon, authenticated, service_role;
grant execute on function app.assign_materials(uuid[], uuid[], timestamptz[], uuid[])
  to discipler_command;

-- ---------------------------------------------------------------------------
-- 2. The page
-- ---------------------------------------------------------------------------
-- The tab's document, which already holds everything the list is drawn from:
-- the live Materials for the group headings, every accepted unended
-- relationship with its periods for which group it sits in, the genders for the
-- filter, and the history its pill is derived from. Composed rather than
-- copied, so the list and the tab cannot come to disagree about which
-- relationships are live, and so this page is not a second place to change
-- when the tab's document changes.
--
-- `refused` is the relationship the last press was refused over, carried back
-- on the address by the route, or null. It is read under the same policies as
-- everything else here, so an id from another Ministry, or no id at all, reads
-- as nothing. Named by the people who were in it when it ended, or who are in
-- it now where it has not.
create function public.assign_material_page(refused uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  doc jsonb := public.materials_page();
  ministry uuid;
begin
  if doc ->> 'session' <> 'admin' then return doc; end if;
  ministry := (doc -> 'admin' ->> 'ministry_id')::uuid;
  return doc || jsonb_build_object(
    'refused', (
      select jsonb_build_object(
               'id', r.id,
               'name', r.name,
               'ended_at', r.ended_at,
               'members', coalesce(
                 (select jsonb_agg(jsonb_build_object('role', m.role, 'full_name', p.full_name)
                                   order by m.role, m.started_at, p.full_name, m.person_id)
                    from public.relationship_member m
                    join public.person p on p.id = m.person_id
                   where m.ministry_id = ministry
                     and m.relationship_id = r.id
                     and (m.ended_at is null or m.ended_at >= r.ended_at)),
                 '[]'::jsonb
               ))
        from public.relationship r
       where r.ministry_id = ministry
         and r.id = refused
    )
  );
end;
$$;

-- A signed-in user's and nobody else's, as every page function is. The platform
-- grants execute to `anon` and `service_role` by default, so both are revoked.
revoke execute on function public.assign_material_page(uuid) from public, anon, service_role;
grant execute on function public.assign_material_page(uuid) to authenticated;
