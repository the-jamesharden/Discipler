-- Manual pairing, recut ticket 02: which participation cap a relationship counts
-- against, on the Roster's document.
--
-- The two caps are indexes conditioned on `kind` (`leader_one_open_group`,
-- `participant_one_open_one_to_one`), declared when a relationship is formed and
-- never changed, so a group that has fallen to one Disciple is still a group: its
-- Discipler still leads their one group, and its last Disciple may still be given
-- a one-to-one. ADR-0004 says so, and James said so again on 2026-09-20.
--
-- The Pair popup shows both caps before the click, by greying what the database
-- would refuse. Until now it guessed from the live count of Disciples, because the
-- document carried nothing else, and for that one group it guessed wrong in both
-- directions: its last Disciple was greyed as *Already in a 1:1*, and its
-- Discipler was offered a 1:2 pair the index then refused.
--
-- So each relationship row says `counts_as_a_group`. The answer and not the
-- column: `kind` may be read by constraints and the scorer and never by copy or
-- state derivation (ADR-0004, amended for this), the fence test walks `src/` and
-- `app/`, and a reader handed `kind` would have it to hand for the next branch.
-- A boolean about the caps is all anybody past this function learns.
--
-- `create or replace`, because the return type does not change. Everything else
-- is restated exactly as `20261002000100` left it, and `person_page()` and
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
                  'counts_as_a_group', r.kind = 'group'))
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
