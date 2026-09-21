-- Manual pairing, Unpair (James, 2026-09-21): what a Ministry calls a group, on the
-- Roster's document.
--
-- A person's page lists their pairings, and named a group only by the people in
-- it: *Discipling Ana Ruiz, Mia Chen, Zoe Park*. The Pair popup has said *Thursday
-- Table* since the groups came onto its document, and Unpair now asks a question
-- about one group among several a Discipler may have led, so the page says which.
--
-- So each relationship row carries `name`, as `relationship.name` holds it: null
-- where nobody has named it, and always null on a one-to-one. It is already shown
-- to this same Admin on the Pair document, so nothing new is disclosed.
--
-- `create or replace`, because the return type does not change. Everything else
-- is restated exactly as `20261004000100` left it, and `person_page()` and
-- `pair_page()` read this document, so they carry the key with no change of
-- their own.
create or replace function public.roster_page()
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
    'history', app.history_inputs(ministry),
    'roster', jsonb_build_object(
      'rows', coalesce(
        (select jsonb_agg(to_jsonb(r)) from public.roster(ministry) r),
        '[]'::jsonb
      ),
      'members', coalesce(
        (select jsonb_agg(jsonb_build_object(
                  'person_id', m.person_id,
                  'relationship_id', m.relationship_id,
                  'role', m.role,
                  'accepted_at', m.accepted_at))
           from public.relationship_member m
          where m.ministry_id = ministry
            and m.ended_at is null),
        '[]'::jsonb
      ),
      'relationships', coalesce(
        (select jsonb_agg(jsonb_build_object(
                  'id', r.id,
                  'accepted_at', r.accepted_at,
                  'counts_as_a_group', r.kind = 'group',
                  'name', r.name))
           from public.relationship r
          where r.ministry_id = ministry
            and r.id in (select m.relationship_id
                           from public.relationship_member m
                          where m.ministry_id = ministry
                            and m.ended_at is null)),
        '[]'::jsonb
      ),
      'intended_pairings', coalesce(
        (select jsonb_agg(to_jsonb(i)) from public.intended_pairings(ministry) i),
        '[]'::jsonb
      ),
      'held_import_rows', coalesce(
        (select jsonb_agg(to_jsonb(h)) from public.held_import_rows(ministry) h),
        '[]'::jsonb
      )
    )
  );
end;
$$;

-- Restated rather than assumed. `create or replace` keeps the grants of the
-- function it replaces, and a page function open to `anon` is the drift the
-- smoke loop exists to catch.
revoke execute on function public.roster_page() from public, anon, service_role;
grant execute on function public.roster_page() to authenticated;
