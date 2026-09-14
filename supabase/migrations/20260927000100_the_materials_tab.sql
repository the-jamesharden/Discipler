-- The Materials tab
-- ---------------------------------------------------------------------------
-- Ticket 14 gave a Ministry its Materials and the dated periods that say which
-- one each relationship was working through, and ticket 31 put a Materials tab
-- in the Admin bar and greyed it out. This is the read behind the tab
-- (`.scratch/materials/spec.md`, ticket 01): the folders on the tab, and the
-- cards inside each folder.
--
-- One function for the page, as every signed-in page has one
-- (`docs/adr/0023-a-page-is-one-read.md`), and two aliases so the edge log
-- names the page that was loaded. Security invoker and granted to
-- `authenticated` alone: every row here is read under the policies the tables
-- already carry, and `material_periods` keeps the gate the Leader Dashboard
-- gave it. Nothing about who may see what changes.
--
-- The document is keyed by the read each part replaces. `history` is the
-- Overview's history inputs, read once so the tab's badge and the cards' pills
-- and flag lines derive from the same rows the Overview derives from. The rest
-- is what the Overview does not read: the Ministry's Materials, every period,
-- the accepted unended relationships with the columns the cards and the filter
-- read, and the gender each member last declared at Intake, for the filter's
-- rule that a one-to-one takes its Leader's gender.

-- ---------------------------------------------------------------------------
-- The page
-- ---------------------------------------------------------------------------

-- `gender` is carried for the log and nothing else. The filter is TypeScript's:
-- which folder a relationship files under is a rule about a declaration, a live
-- count and a Leader, and every rule of that shape is derived on the app side
-- from the rows, where it is tested in a millisecond.
create function public.materials_page(gender text default null)
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

    -- Every Material the Ministry holds, in title order. `removed` is the flag
    -- ticket 02 adds so a Material can leave the tab and stay in history; until
    -- that column exists no Material is removed, and the key is here from the
    -- start so the reader that keeps removed ones out of the folders and on the
    -- "Previously" lines is written once and never has to learn a new key.
    'materials', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', m.id,
                'title', m.title,
                'body', m.body,
                'pdf_path', m.pdf_path,
                'pdf_filename', m.pdf_filename,
                'removed', null::timestamptz)
              order by m.title, m.created_at)
         from public.material m
        where m.ministry_id = ministry),
      '[]'::jsonb
    ),

    -- Every period of every relationship, gapless and in order, as the Leader
    -- Dashboard reads them. The running period is the folder; the closed ones
    -- are the "Previously" line.
    'material_periods', coalesce(
      (select jsonb_agg(to_jsonb(mp)) from public.material_periods(ministry) mp),
      '[]'::jsonb
    ),

    -- The relationships the tab is about: accepted, and not ended. An unaccepted
    -- one has no Material history to file under, and an ended one is over.
    'relationships', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', r.id,
                'kind', r.kind,
                'name', r.name,
                'declared_gender', r.declared_gender,
                'accepted_at', r.accepted_at))
         from public.relationship r
        where r.ministry_id = ministry
          and r.accepted_at is not null
          and r.ended_at is null),
      '[]'::jsonb
    ),

    -- What each member of those relationships last said their gender was at
    -- Intake, read under the Admin-only policy on `intake_submission`, and the
    -- most recent submission counts, as `app.current_gender` counts it. The
    -- filter's rule for a one-to-one that declared nothing is its Leader's
    -- gender, and this is where the Leader's gender is.
    'genders', coalesce(
      (select jsonb_agg(jsonb_build_object('person_id', g.person_id, 'gender', g.gender))
         from (select distinct on (i.person_id) i.person_id, i.gender
                 from public.intake_submission i
                where i.ministry_id = ministry
                  and i.person_id in (select m.person_id
                                        from public.relationship_member m
                                        where m.ministry_id = ministry
                                          and m.ended_at is null)
                order by i.person_id, i.submitted_at desc, i.created_at desc, i.id desc) g),
      '[]'::jsonb
    )
  );
end;
$$;

-- A Material's folder, and the "No material assigned" folder, draw from the
-- tab's document and are named for themselves, so the edge log tells them apart
-- and a folder that one day reads differently moves nobody else's document.
create function public.material_page()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.materials_page();
$$;

-- The page a Material is created on (ticket 02) needs the list of titles the new
-- one must not repeat, which the tab's document already carries.
create function public.new_material_page()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.materials_page();
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- A signed-in user's and nobody else's, as every page function is. The platform
-- grants execute to `anon` and `service_role` by default, so both are revoked.
revoke execute on function public.materials_page(text) from public, anon, service_role;
revoke execute on function public.material_page() from public, anon, service_role;
revoke execute on function public.new_material_page() from public, anon, service_role;

grant execute on function public.materials_page(text) to authenticated;
grant execute on function public.material_page() to authenticated;
grant execute on function public.new_material_page() to authenticated;
