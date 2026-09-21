-- Manual pairing, ticket 22 -- A Discipler added to a group as another leader
--
-- Until now leader memberships were written at formation and never again, so a
-- relationship's `accepted_at` and its Leaders' own agreed: activation is the
-- last of them accepting, and a relationship that was running had no Leader who
-- had not. An Admin can now add a Leader to a group that already exists, and the
-- group keeps running while they decide. That is the first relationship that is
-- accepted with a Leader on it who has not.
--
-- The Roster has to be able to say so. Its row for the new Leader reads the group
-- as awaiting *their* acceptance, and every other row of the same group reads it
-- as running, which one fact per relationship cannot express.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The Roster's memberships carry each Leader's own acceptance
-- ---------------------------------------------------------------------------
-- One key added to each membership: `accepted_at`, as the column holds it. Null
-- on every Participant, who accepts nothing
-- (`relationship_member_only_a_leader_accepts`), and on a Leader who has not yet.
--
-- Rows only, as `docs/adr/0023-a-page-is-one-read.md` has it: whether a row reads
-- as awaiting is derived by the reader from this beside the relationship's own
-- `accepted_at`, which already travels in the same document. A `case` here would
-- be that rule computed in a second place.
--
-- `create or replace`, because the return type does not change. Everything else
-- is restated exactly as `20260926000100` left it, and `person_page()` and
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
        (select jsonb_agg(jsonb_build_object('id', r.id, 'accepted_at', r.accepted_at))
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
