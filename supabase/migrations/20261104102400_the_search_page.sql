-- Search reads one document, as a page does (Exponential launch, ticket 24, and
-- `docs/adr/0023-a-page-is-one-read.md`). It is read when an Admin opens search and at
-- no other time, so a page that is only looked at makes no extra call.
--
-- It holds names and nothing a person wrote. Search never finds a Concern or a reply,
-- and the surest way to keep that true is for neither to be in what it reads: no
-- `app.history_inputs`, which is where they travel, and no phone or email off the
-- Roster row, which search does not offer either.
--
-- Security invoker, like every page function: the Ministry comes from the session's
-- own membership, `person`, `relationship`, `relationship_member` and `material` are
-- read under their policies, and `public.roster` keeps its own Admin test. So an Admin
-- finds only their own church, and anybody else gets the verdict alone.
--
-- A removed Person is left out as the Roster leaves them out, an ended relationship is
-- not searchable because the Overview draws no card for it, and a removed Material is
-- left off as the tab leaves it off.
create function public.search_page()
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
    'timezone', (select m.timezone from public.ministry m where m.id = ministry),
    'people', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'person_id', r.person_id,
                'full_name', r.full_name,
                'participation_status', r.participation_status,
                'is_admin', r.person_id in (select a.person_id
                                              from public.admins_on_the_roster(ministry) a))
              order by r.full_name, r.person_id)
         from public.roster(ministry) r
        where not exists (select 1
                            from public.person_removal x
                           where x.person_id = r.person_id
                             and x.restored_at is null)),
      '[]'::jsonb
    ),
    'relationships', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', r.id,
                'name', r.name,
                'created_at', r.created_at,
                'accepted_at', r.accepted_at)
              order by r.created_at, r.id)
         from public.relationship r
        where r.ministry_id = ministry
          and r.ended_at is null),
      '[]'::jsonb
    ),
    'members', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'relationship_id', m.relationship_id,
                'person_id', m.person_id,
                'role', m.role,
                'accepted_at', m.accepted_at)
              order by m.relationship_id, m.person_id, m.role)
         from public.relationship_member m
         join public.relationship r on r.id = m.relationship_id
        where m.ministry_id = ministry
          and m.ended_at is null
          and r.ended_at is null),
      '[]'::jsonb
    ),
    'materials', coalesce(
      (select jsonb_agg(jsonb_build_object('id', m.id, 'title', m.title)
              order by m.title, m.id)
         from public.material m
        where m.ministry_id = ministry
          and m.removed is null),
      '[]'::jsonb
    )
  );
end;
$$;

revoke execute on function public.search_page() from public, anon, service_role;
grant execute on function public.search_page() to authenticated;
