-- The Intake form editor (Pastor feedback, ticket 11)
-- ---------------------------------------------------------------------------
-- James, 2026-10-12: an Admin edits each of the Ministry's two Intake forms --
-- the mentor and mentee form and the groups form -- page by page and question by
-- question. Each save is live at once, and somebody already part-way through the
-- form finishes the version they opened.
--
-- So a form is stored as versions, never as a row that is updated. Each save
-- writes the whole form as the next version; the wizard is served the latest one
-- when somebody opens it and carries that version's number from screen to
-- screen, so an edit made while they are on step three changes nothing in front
-- of them. A Ministry that has never edited has no version at all and is served
-- today's form, which the domain holds as the preset (`presetForm` in
-- `src/domain/intake-form.ts`, version 0). Nobody's form changes until an Admin
-- edits it.
--
-- What a form may hold, and every rule about an edit, is the domain's: the
-- document here is written by `asDefinition` and read by `intakeFormFrom`
-- (`src/platform/supabase/intake-form-document.ts`), whose comment gives its
-- shape. A question is keyed by the name its answer travels under, so a reworded
-- question is the same question and every answer given to it stays its answer
-- (ADR-0014).

-- ---------------------------------------------------------------------------
-- The versions
-- ---------------------------------------------------------------------------

create table intake_form_version (
  id          uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references ministry (id) on delete cascade,
  -- Which of the two forms, by the Intake path a submission from it declares.
  form        intake_path not null,
  -- 1 for a Ministry's first edit, and one more for each after. 0 is the preset,
  -- which is never stored.
  version     integer not null check (version > 0),
  definition  jsonb not null check (jsonb_typeof(definition) = 'object'),
  saved_at    timestamptz not null,
  -- The Admin's account, as the session named it.
  saved_by    text not null check (length(btrim(saved_by)) > 0),
  created_at  timestamptz not null default now(),

  constraint intake_form_version_once unique (ministry_id, form, version)
);

comment on table intake_form_version is
  'Every saved version of a Ministry''s two Intake forms, one row per save. A '
  'version is never changed: the wizard serves somebody the version they opened '
  'until they submit, and a submission records which version it answered. A '
  'Ministry with no row for a form is served the preset, today''s form.';

-- Read as *the latest for this form*, and as one version by number.
create index intake_form_version_latest_idx
  on intake_form_version (ministry_id, form, version desc);

-- A version is what somebody was shown; rewriting one would change the words a
-- submission says it answered. DELETE is left to the Ministry's own cascade.
create function app.reject_intake_form_rewrite()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'intake_form_version is what somebody was asked: % is not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger intake_form_version_no_update
  before update on intake_form_version
  for each row execute function app.reject_intake_form_rewrite();

create trigger intake_form_version_no_truncate
  before truncate on intake_form_version
  for each statement execute function app.reject_intake_form_rewrite();

alter table intake_form_version enable row level security;
alter table intake_form_version force row level security;

-- Admin-only, like everything else the Intake forms page reads. The wizard is
-- served to somebody with no session, and reads its form on the server.
create policy intake_form_version_read_own_ministry on intake_form_version
  for select to authenticated
  using (app.is_admin_of(ministry_id));

revoke all on intake_form_version from anon, authenticated, service_role;
grant select on intake_form_version to authenticated;
grant select, insert, delete on intake_form_version to service_role;
grant select, insert on intake_form_version to discipler_command;

create policy intake_form_version_command on intake_form_version
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

-- ---------------------------------------------------------------------------
-- Which version a submission answered
-- ---------------------------------------------------------------------------
-- 0 for the preset, a saved version's number otherwise. Null where the form was
-- not one of the Ministry's two -- the tokenized reopen link -- and on every
-- submission made before this ticket. Not a foreign key, because the preset has
-- no row.
alter table intake_submission
  add column form_version integer check (form_version >= 0);

comment on column intake_submission.form_version is
  'Which version of the Ministry''s Intake form this submission answered: 0 for '
  'the preset, otherwise intake_form_version.version for the form named by the '
  'consent record''s intake_path. Null where the form was not one of the two, '
  'and on submissions made before forms could be edited.';

-- ---------------------------------------------------------------------------
-- Intake forms reads both forms in its one document
-- ---------------------------------------------------------------------------
-- The latest version of each form the Ministry has saved, under `intake_forms`.
-- A form with no row is absent, and the reader serves the preset in its place.
-- Everything else is `20261014000400_a_readable_link_per_church.sql`'s
-- definition, unchanged.
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

    'timezone', (select m.timezone from public.ministry m where m.id = ministry),
    'short_name', (select m.short_name from public.ministry m where m.id = ministry),

    'intake_forms', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'form', latest.form,
                'version', latest.version,
                'definition', latest.definition)
              order by latest.form)
         from (select distinct on (v.form) v.form, v.version, v.definition
                 from public.intake_form_version v
                where v.ministry_id = ministry
                order by v.form, v.version desc) latest),
      '[]'::jsonb
    )
  );
end;
$$;

-- Restated rather than assumed, as every page function's grants are.
revoke execute on function public.intake_forms_page() from public, anon, service_role;
grant execute on function public.intake_forms_page() to authenticated;
