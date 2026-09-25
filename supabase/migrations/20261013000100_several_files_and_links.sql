-- A Material holds several files and links (Richer materials, ticket 01)
-- ---------------------------------------------------------------------------
-- A Material was a title, some text and at most one PDF. It becomes a title,
-- optional text and an ordered list of items, each a file or a link
-- (`.scratch/richer-materials/spec.md`, *Model* and *Files*).
--
-- Five things land here:
--   1. `material_item`, one row per file or link, every existing PDF copied
--      into it as its Material's first item, and the old column kept in step
--      with the items for as long as it stands.
--   2. The rule that a Material carries something, moved from a check on one
--      row to a deferred trigger, because it now spans two tables.
--   3. The `material` bucket's own limits: 50 MB and the allowed types, so
--      Storage refuses what the form would.
--   4. A Leader's read of a stored object, extended from `pdf_path` to the items.
--   5. `materials_page()` and `relationships_page()` carrying the items.
--
-- `pdf_path` and `pdf_filename` stay, unread by the code this ships with, until a
-- later migration drops them: the deploy order pushes this before its code
-- merges, and the code still running in that window reads and writes them. So
-- the two are kept in step by trigger rather than trusted to agree: a PDF the
-- old code writes becomes an item, and an item the new code removes takes the
-- old column with it. Everything else -- the carries-something rule, a Leader's
-- read of an object, the fingerprint the change text compares -- reads the
-- items alone, so dropping the column later changes none of them. The page
-- documents keep their `pdf_*` keys, since a key only ever goes within one change.

-- ---------------------------------------------------------------------------
-- 1. The items
-- ---------------------------------------------------------------------------

create table material_item (
  id           uuid primary key default gen_random_uuid(),
  ministry_id  uuid not null,
  material_id  uuid not null,

  -- The order the Material shows its items in: the order they were added, and
  -- nothing reorders them (James, 2026-09-24). A gap left by a removed item is
  -- harmless; the next one added goes after the largest.
  position     integer not null check (position >= 0),

  kind         text not null check (kind in ('file', 'link')),

  -- A file: the object in the `material` bucket, keyed `<ministry_id>/<uuid>.<ext>`,
  -- the name it arrived under, and what Storage said it was when it was saved.
  path         text,
  filename     text check (filename is null or length(btrim(filename)) > 0),
  content_type text,
  bytes        bigint check (bytes is null or bytes >= 0),

  -- A link: the address, http or https only, and what to call it. With no label
  -- the page shows the site's address.
  url          text check (url is null or url ~* '^https?://[^\s]+$'),
  label        text check (label is null or length(btrim(label)) > 0),

  created_at   timestamptz not null default now(),

  -- Inside the Material's own Ministry, declaratively, as an assignment is.
  constraint material_item_material_fk
    foreign key (material_id, ministry_id) references material (id, ministry_id)
    on delete cascade,

  constraint material_item_position_uniq unique (material_id, position),

  -- One object is one item: two items naming one path would leave a removal of
  -- either deleting the other's file.
  constraint material_item_path_uniq unique (path),

  -- A file carries all four of its facts and nothing of a link's; a link the
  -- reverse. Half an item is not something any screen can draw.
  constraint material_item_is_whole check (
    case kind
      when 'file' then path is not null and filename is not null and content_type is not null
                       and bytes is not null and url is null and label is null
      when 'link' then url is not null and path is null and filename is null
                       and content_type is null and bytes is null
    end
  )
);

create index material_item_material_idx on material_item (material_id, position);

comment on table material_item is
  'The files and links a Material holds, in the order they were added. A '
  'Material is still what a relationship is assigned; its items are what a Leader '
  'and a Disciple open.';

-- Every existing PDF becomes its Material's first item. The size is the storage
-- object's, where the object is there; a row a fixture wrote without uploading
-- anything has none, and is given nought rather than refused.
insert into material_item (ministry_id, material_id, position, kind, path, filename, content_type, bytes, created_at)
select m.ministry_id, m.id, 0, 'file', m.pdf_path, m.pdf_filename, 'application/pdf',
       coalesce((select (o.metadata ->> 'size')::bigint
                   from storage.objects o
                  where o.bucket_id = 'material'
                    and o.name = m.pdf_path), 0),
       m.created_at
  from material m
 where m.pdf_path is not null;

-- The old column, kept in step with the items while it stands. The code still
-- running between this push and its merge writes `pdf_path` on create and on
-- every save, and deletes the object it replaces or removes; each of those
-- becomes the same change to the items, in the same transaction, so what the
-- new code finds after the merge is what the Admin last saved. Security definer
-- because the command connection may not read `storage.objects` for the size,
-- and a trigger function is callable by nothing but its trigger.
create function app.material_pdf_into_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  at_position integer;
begin
  if tg_op = 'UPDATE' and old.pdf_path is not null then
    delete from public.material_item i
     where i.material_id = new.id and i.path = old.pdf_path
    returning i.position into at_position;
  end if;
  if new.pdf_path is not null
     and not exists (select 1 from public.material_item i where i.path = new.pdf_path) then
    insert into public.material_item
      (ministry_id, material_id, position, kind, path, filename, content_type, bytes)
    values (
      new.ministry_id, new.id,
      -- A replaced PDF takes the place of the one it replaced.
      coalesce(at_position,
               (select max(i.position) + 1 from public.material_item i where i.material_id = new.id),
               0),
      'file', new.pdf_path, new.pdf_filename, 'application/pdf',
      coalesce((select (o.metadata ->> 'size')::bigint
                  from storage.objects o
                 where o.bucket_id = 'material'
                   and o.name = new.pdf_path), 0));
  end if;
  return null;
end;
$$;

revoke execute on function app.material_pdf_into_items() from public, anon, authenticated, service_role;

create trigger material_pdf_into_items_on_insert
  after insert on material
  for each row
  when (new.pdf_path is not null)
  execute function app.material_pdf_into_items();

create trigger material_pdf_into_items_on_update
  after update of pdf_path on material
  for each row
  when (new.pdf_path is distinct from old.pdf_path)
  execute function app.material_pdf_into_items();

-- And the other way: an item the new code removes that was the old PDF takes
-- the old column with it, so nothing is left naming an object that is gone.
create function app.material_item_out_of_pdf()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.material m
     set pdf_path = null, pdf_filename = null
   where m.id = old.material_id and m.pdf_path = old.path;
  return null;
end;
$$;

revoke execute on function app.material_item_out_of_pdf() from public, anon, authenticated, service_role;

create trigger material_item_out_of_pdf
  after delete on material_item
  for each row
  when (old.path is not null)
  execute function app.material_item_out_of_pdf();

-- ---------------------------------------------------------------------------
-- 2. A Material carries something
-- ---------------------------------------------------------------------------

-- Text, an item, or both. A title pointing at nothing would be assignable and
-- would attribute weeks, and a Leader opening it would find an empty page. It was
-- a check on the row; it spans two tables now, so it is a constraint trigger,
-- deferred to the end of the transaction so a Material can be inserted and then
-- given its items, or lose its text and gain a file, in one command.
alter table material drop constraint material_carries_something;

create function app.reject_empty_material()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target uuid;
begin
  -- Two branches rather than one expression: a trigger on `material` has no
  -- `material_id` on its row, and PL/pgSQL resolves a field it is asked for even
  -- in the arm of a case it will not take.
  if tg_table_name = 'material' then
    target := new.id;
  else
    target := old.material_id;
  end if;
  if exists (
    select 1
      from public.material m
     where m.id = target
       and m.body is null
       and not exists (select 1 from public.material_item i where i.material_id = m.id)
  ) then
    raise exception 'material % violates material_carries_something: it carries neither text nor any file or link', target
      using errcode = 'check_violation', constraint = 'material_carries_something';
  end if;
  return null;
end;
$$;

create constraint trigger material_carries_something
  after insert or update on material
  deferrable initially deferred
  for each row execute function app.reject_empty_material();

create constraint trigger material_item_leaves_something
  after delete on material_item
  deferrable initially deferred
  for each row execute function app.reject_empty_material();

-- ---------------------------------------------------------------------------
-- Who may read and write an item
-- ---------------------------------------------------------------------------

alter table material_item enable row level security;
alter table material_item force  row level security;

revoke all on material_item from anon, authenticated, service_role;

grant select on material_item to authenticated;
grant select, insert, update, delete on material_item to service_role;

-- The Admin's own Ministry, as on `material`.
create policy material_item_read_own_ministry on material_item
  for select to authenticated
  using (app.is_admin_of(ministry_id));

-- A Leader, for the Material their relationship is working through now, as
-- `material_read_led` reads the Material itself.
create policy material_item_read_led on material_item
  for select to authenticated
  using (app.leads_relationship_using_material(material_id));

-- The command connection inserts and deletes items and never updates one: an
-- edit removes what the Admin ticked and adds what they uploaded. Delete, unlike
-- on `material`, because an item is part of a row that is edited in place and
-- `material.edited` keeps what it used to hold.
grant select, insert, delete on material_item to discipler_command;

create policy material_item_command on material_item
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

-- ---------------------------------------------------------------------------
-- 3. The bucket's own limits
-- ---------------------------------------------------------------------------

-- The same list `src/domain/materials.ts` holds, one type per extension: the
-- browser uploads with the type the extension names rather than whatever it
-- guessed, so the list stays exact. 50 MB, which the hosted project's global
-- limit must also allow.
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array[
         'application/pdf',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'text/plain',
         'application/rtf',
         'image/jpeg',
         'image/png',
         'image/gif',
         'image/webp',
         'image/heic',
         'audio/mpeg',
         'audio/mp4',
         'audio/wav',
         'video/mp4',
         'video/quicktime',
         'video/webm'
       ]
 where id = 'material';

-- ---------------------------------------------------------------------------
-- 4. A Leader reads the objects their Material names
-- ---------------------------------------------------------------------------

-- Keyed on the stored paths, as before, and on the items alone: an old PDF is
-- an item too, kept so by `app.material_pdf_into_items`.
create or replace function app.leads_material_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.material m
      join public.material_assignment a on a.material_id = m.id
     where exists (select 1
                     from public.material_item i
                    where i.material_id = m.id
                      and i.path = object_name)
       and a.ended_at is null
       and app.leads_relationship(a.relationship_id)
  );
$$;

comment on function app.leads_material_object(text) is
  'Whether the signed-in user leads a relationship currently working through the '
  'Material one of whose files this storage object is.';

-- ---------------------------------------------------------------------------
-- 5. The page documents carry the items
-- ---------------------------------------------------------------------------

-- The rows an item is drawn from, in order, shared by both documents below.
-- Security invoker, so each reader sees the items its own policies allow.
create function app.material_items(target_material_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select jsonb_agg(jsonb_build_object(
              'id', i.id,
              'position', i.position,
              'kind', i.kind,
              'path', i.path,
              'filename', i.filename,
              'content_type', i.content_type,
              'bytes', i.bytes,
              'url', i.url,
              'label', i.label)
            order by i.position)
       from public.material_item i
      where i.material_id = target_material_id),
    '[]'::jsonb
  );
$$;

revoke execute on function app.material_items(uuid) from public, anon, service_role;
-- And the command connection, whose read of the list an edit decides against
-- draws each item from the same rows in the same shape.
grant execute on function app.material_items(uuid) to authenticated, discipler_command;

-- `20260928000100` left this; `items` is added to each Material and nothing else
-- changes.
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
                'items', app.material_items(m.id),
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

-- `20261003000100` left this; `items` is added to each Material and nothing else
-- changes.
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
                  'pdf_filename', ma.pdf_filename,
                  'items', app.material_items(ma.id)))
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
