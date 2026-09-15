-- Create, edit and remove a Material
-- ---------------------------------------------------------------------------
-- Ticket 14 gave a Ministry its Materials and ticket 01 of
-- `.scratch/materials/spec.md` put them on the tab as folders. Nothing yet let
-- an Admin make one, change one or take one off the list: every row so far was
-- written by hand during pilot support. This is the write behind the New
-- material button, the edit page and its Remove card (ticket 02).
--
-- Three things land here. A `removed` flag on `material`, so a Material can
-- leave the tab and every assign list while every period that names it goes on
-- naming it -- the same shape a removed Discipleship Goal takes, and for the
-- same reason: history is preserved rather than overwritten. The grants and
-- policies that let the command connection insert and update a Material, and
-- deliberately not delete one. And the page functions learning the flag and one
-- more column, with a fourth alias for the edit page.

-- ---------------------------------------------------------------------------
-- A Material can be removed
-- ---------------------------------------------------------------------------

-- Null while the Material is live. Set once, by `material.remove`, and never
-- cleared: the spec settled that there is no restore, so a Ministry that wants
-- it back creates it again and history keeps both.
alter table material add column removed timestamptz;

comment on column material.removed is
  'When the Ministry took this Material off its list, or null while it is live. '
  'A removed Material stays on every period that names it; only the tab, the '
  'dropdowns and the Leader''s screen stop offering it.';

-- One live title per Ministry, where ticket 14 said one title per Ministry ever.
-- The boundary rule is *unique among the Ministry's live Materials*: a Ministry
-- that removed "Romans" and later creates "Romans" again has two rows with one
-- title, and only one of them is on the list. The composite key an assignment
-- points at is `material_id_ministry_uniq` beside it, and is untouched.
alter table material drop constraint material_ministry_id_title_key;

create unique index material_live_title_uniq
  on material (ministry_id, title)
  where removed is null;

-- ---------------------------------------------------------------------------
-- The command connection may write a Material
-- ---------------------------------------------------------------------------

-- Insert and update, scoped to the Ministry the connection declared it acts for,
-- exactly as `material_assignment` was granted in ticket 14. No delete, and that
-- is the point of the flag above: a Material a relationship has worked through
-- is history, and `material_assignment_material_fk` is `on delete restrict` so
-- that even a hand-written delete of one in use is refused.
grant insert, update on material to discipler_command;

create policy material_command_insert on material
  for insert to discipler_command
  with check (ministry_id = app.command_ministry_id());

create policy material_command_update on material
  for update to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

-- ---------------------------------------------------------------------------
-- The page functions learn the flag and the file's size
-- ---------------------------------------------------------------------------

-- The same document ticket 01 defined, with two changes to the `materials`
-- rows and nothing else. `removed` is now the column rather than the constant
-- null the tab shipped with, so the reader that already keeps removed Materials
-- out of the folders and on the "Previously" lines needs no change. `pdf_bytes`
-- is new: the edit page shows the current PDF's filename and size, and the size
-- lives on the storage object rather than on the row. It is read from
-- `storage.objects` here, under the Admin's own storage policy, so the edit page
-- stays one read (`docs/adr/0023-a-page-is-one-read.md`) rather than asking
-- the storage API a second time. Null where no object is on the path, which is
-- what a row a fixture wrote without uploading anything reads as.
create or replace function public.materials_page(gender text default null)
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

    -- Every Material the Ministry holds, removed ones included, in title order.
    -- The reader keeps a removed one off the folders and the dropdowns; the
    -- periods keep naming it, so a card's "Previously" line still can.
    'materials', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', m.id,
                'title', m.title,
                'body', m.body,
                'pdf_path', m.pdf_path,
                'pdf_filename', m.pdf_filename,
                'pdf_bytes', (select (o.metadata ->> 'size')::bigint
                                from storage.objects o
                               where o.bucket_id = 'material'
                                 and o.name = m.pdf_path),
                'removed', m.removed)
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

-- The page a Material is edited on, named for itself like the folder and the
-- create page are, so the edge log says which page was loaded.
create function public.edit_material_page()
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
revoke execute on function public.edit_material_page() from public, anon, service_role;
grant execute on function public.edit_material_page() to authenticated;
