-- The text when a Material changes (Richer materials, ticket 03)
-- ---------------------------------------------------------------------------
-- James, 2026-09-24: one text per person, once nothing that feeds it has changed
-- for an hour, at most once a day, saying where things ended up. The rule is in
-- `src/domain/material-notices.ts`; this is what it reads and writes.
--
-- Three things land here:
--   1. `material_notice`, a row each time a person is told about one
--      relationship's Material, never updated. The latest row per person and
--      relationship is what the next change is compared against.
--   2. `app.material_content_fingerprint`, what a Material holds as one value:
--      its text and its items, and not its title, so a corrected title tells
--      nobody anything.
--   3. A baseline: everybody in a running relationship is recorded as already
--      told about the Material it is on now. Without it, the first tick after
--      this ships would text every Leader in every Ministry about a Material
--      they have had for months.

-- ---------------------------------------------------------------------------
-- 1. What people have been told
-- ---------------------------------------------------------------------------

create table material_notice (
  id              uuid primary key default gen_random_uuid(),
  ministry_id     uuid not null references ministry (id) on delete cascade,
  person_id       uuid not null references person (id),
  relationship_id uuid not null references relationship (id),
  -- What they were told the relationship is working through, or null for none.
  material_id     uuid references material (id),
  -- What that Material held when they were told. Null exactly when there is no
  -- Material.
  fingerprint     text,
  told_at         timestamptz not null,
  -- Whether a text went with it. A Disciple moved to no Material is recorded and
  -- sent nothing, and so is everybody the baseline below records.
  texted          boolean not null,
  created_at      timestamptz not null default now(),

  constraint material_notice_fingerprint_with_material
    check ((material_id is null) = (fingerprint is null))
);

create index material_notice_latest_idx
  on material_notice (person_id, relationship_id, told_at desc, created_at desc);

-- The one-a-day rule reads when a person was last texted.
create index material_notice_texted_idx
  on material_notice (person_id, told_at desc)
  where texted;

comment on table material_notice is
  'Each time a person was told about one relationship''s Material: which, what it '
  'held, when, and whether a text went. Append-only; the latest row per person and '
  'relationship is what the next change is compared against.';

create function app.reject_material_notice_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'material_notice is append-only: % is not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger material_notice_no_update
  before update on material_notice
  for each row execute function app.reject_material_notice_mutation();

create trigger material_notice_no_delete
  before delete on material_notice
  for each row execute function app.reject_material_notice_mutation();

create trigger material_notice_no_truncate
  before truncate on material_notice
  for each statement execute function app.reject_material_notice_mutation();

alter table material_notice enable row level security;
alter table material_notice force  row level security;

revoke all on material_notice from anon, authenticated, service_role;

grant select on material_notice to authenticated;
grant select, insert on material_notice to service_role;

-- An Admin may read what their own Ministry's people were told; nothing on a
-- screen reads it yet, and a Leader and a Disciple are given no read at all.
create policy material_notice_read_own_ministry on material_notice
  for select to authenticated
  using (app.is_admin_of(ministry_id));

-- The command connection reads and appends, and nothing more.
grant select, insert on material_notice to discipler_command;

create policy material_notice_command_read on material_notice
  for select to discipler_command
  using (ministry_id = app.command_ministry_id());

create policy material_notice_command_append on material_notice
  for insert to discipler_command
  with check (ministry_id = app.command_ministry_id());

-- ---------------------------------------------------------------------------
-- 2. What a Material holds, as one value
-- ---------------------------------------------------------------------------

-- The text, the old single PDF while that column stands, and every item in
-- order: kind, where it is and what it is called. Not the title. Security
-- invoker: it reads what its caller may read.
create function app.material_content_fingerprint(target_material_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select md5(concat_ws(
           '|',
           coalesce(m.body, ''),
           coalesce(m.pdf_path, ''),
           coalesce(
             (select string_agg(
                       concat_ws(':', i.kind, coalesce(i.path, i.url), coalesce(i.filename, ''), coalesce(i.label, '')),
                       '|' order by i.position)
                from public.material_item i
               where i.material_id = m.id),
             '')))
    from public.material m
   where m.id = target_material_id;
$$;

comment on function app.material_content_fingerprint(uuid) is
  'What a Material holds -- its text and its items, not its title -- as one '
  'value, so a change to it can be told from no change.';

revoke execute on function app.material_content_fingerprint(uuid) from public, anon, service_role;
grant execute on function app.material_content_fingerprint(uuid) to authenticated, discipler_command;

-- ---------------------------------------------------------------------------
-- 3. Everybody already knows what they are on
-- ---------------------------------------------------------------------------

-- Every open membership of an accepted, unended relationship that is working
-- through a Material now: the Leaders who have accepted and every Participant.
-- Participants too, although ticket 04 is what texts them, so that shipping 04
-- later texts nobody about a Material they already had.
insert into material_notice (ministry_id, person_id, relationship_id, material_id, fingerprint, told_at, texted)
select m.ministry_id, m.person_id, m.relationship_id, a.material_id,
       app.material_content_fingerprint(a.material_id), now(), false
  from relationship_member m
  join relationship r on r.id = m.relationship_id
  join material_assignment a on a.relationship_id = m.relationship_id and a.ended_at is null
 where m.ended_at is null
   and (m.role <> 'leader' or m.accepted_at is not null)
   and r.accepted_at is not null
   and r.ended_at is null
   and a.material_id is not null;
