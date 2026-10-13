-- A readable link per church (Pastor feedback, ticket 04)
-- ---------------------------------------------------------------------------
-- James, 2026-10-12: each Ministry's Intake forms live at a link a pastor can
-- print on a bulletin and say from the pulpit, `/join/<short name>` for the
-- mentor and mentee form and `/join/<short name>/groups` for the groups form.
--
-- The short name is lowercase letters, digits and dashes, unique across
-- Discipler. Every Ministry that exists when this ships is given one here, from
-- its name, with `-2`, `-3` and so on added on a clash; a Ministry that opens
-- afterwards is given one the same way by the trigger below. An Admin changes it
-- on Intake forms, through the command boundary, which records the change.
--
-- Every short name a Ministry has ever had keeps opening its forms, forever,
-- because QR codes get printed on bulletins. So a name is never given back:
-- `held_short_name` holds every one a Ministry has held, nothing updates or
-- deletes a row of it, and its key is what refuses a second Ministry the name.
-- The current one is on `ministry` itself.
--
-- The rules are the domain's too (`src/domain/short-name.ts`), where they become
-- sentences an Admin reads. They are here because names are generated here, for
-- Ministries that never pass through the boundary, and because a pilot writes by
-- SQL as often as by a button.

-- ---------------------------------------------------------------------------
-- What a short name may be
-- ---------------------------------------------------------------------------

-- The names the app's own routes need: every top-level route, so a short name
-- can never be mistaken for a page of Discipler's own, and `groups`, the word the
-- groups form's link ends in. The domain holds the same list as `RESERVED_SHORT_NAMES`,
-- and `tests/integration/a-readable-link-per-church.test.ts` checks this function
-- refuses every name on it.
create function app.short_name_is_reserved(candidate text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select candidate = any (array[
    'account', 'api', 'auth', 'check-ins', 'cron', 'follow-up', 'groups', 'intake',
    'intake-forms', 'invitation', 'join', 'login', 'material', 'materials', 'overview',
    'relationships', 'roster', 'settings', 'setup', 'sms', 'suggested-pairs'
  ]);
$$;

-- A check constraint below calls it, and a function in a constraint is executed
-- with the privileges of whoever writes the row -- any column of it, since every
-- check is evaluated on every update: the command connection, when an Admin saves
-- settings or renames, and the service role, which a pilot's settings are written
-- with.
revoke execute on function app.short_name_is_reserved(text) from public, anon, authenticated;
grant execute on function app.short_name_is_reserved(text) to discipler_command, service_role;

-- What a Ministry's name reads as in a link: lowercased, the common accents
-- dropped, apostrophes taken out so *St. Mark's* is `st-marks`, an ampersand said
-- as `and`, and every run of anything else made one dash. Cut at a word to the
-- longest a short name may be (`SHORT_NAME_LONGEST`, 40), and `church` where the
-- name has nothing a link can carry.
create function app.short_name_from(ministry_name text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  slug text;
begin
  slug := translate(lower(coalesce(ministry_name, '')),
                    'àáâãäåāèéêëēìíîïīòóôõöøōùúûüūýÿñçß',
                    'aaaaaaaeeeeeiiiiiooooooouuuuuyyncs');
  slug := regexp_replace(slug, '[''’]', '', 'g');
  slug := replace(slug, '&', ' and ');
  slug := btrim(regexp_replace(slug, '[^a-z0-9]+', '-', 'g'), '-');

  if length(slug) > 40 then
    -- Everything before the last dash in the first 41 characters: a word that
    -- ends exactly at the fortieth is kept whole, and one that runs past it goes.
    slug := btrim(coalesce(substring(left(slug, 41) from '^(.*)-'), left(slug, 40)), '-');
  end if;

  return coalesce(nullif(slug, ''), 'church');
end;
$$;

revoke execute on function app.short_name_from(text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Every short name a Ministry has held
-- ---------------------------------------------------------------------------

create table held_short_name (
  short_name     text collate "C" primary key,
  ministry_id    uuid not null references ministry (id) on delete cascade,
  first_held_at  timestamptz not null default now()
);

create index held_short_name_ministry_idx on held_short_name (ministry_id);

comment on table held_short_name is
  'Every short name a Ministry has held, the current one included. A printed link '
  'keeps opening the forms, so a row is never updated or deleted, and the key '
  'refuses the name to any other Ministry for good.';

-- A name goes only with its Ministry: a Ministry deleted outright -- which its
-- append-only history refuses for every Ministry the product opens, so only a
-- bare row ever is -- takes its names with it by the cascade. Its forms are gone
-- then, and there is nothing left for a printed link to open.
create function app.reject_giving_back_a_short_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and not exists (select 1 from public.ministry m where m.id = old.ministry_id) then
    return old;
  end if;
  raise exception
    'held_short_name is kept for good: % is not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;

revoke execute on function app.reject_giving_back_a_short_name() from public, anon, authenticated, service_role;

create trigger held_short_name_no_update
  before update on held_short_name
  for each row execute function app.reject_giving_back_a_short_name();

create trigger held_short_name_no_delete
  before delete on held_short_name
  for each row execute function app.reject_giving_back_a_short_name();

create trigger held_short_name_no_truncate
  before truncate on held_short_name
  for each statement execute function app.reject_giving_back_a_short_name();

alter table held_short_name enable row level security;
alter table held_short_name force  row level security;

revoke all on held_short_name from anon, authenticated, service_role;

-- Read by an Admin of the Ministry and by nobody else. Written only by the
-- trigger on `ministry`, as its owner, so no role is granted a write.
grant select on held_short_name to authenticated, discipler_command;

create policy held_short_name_read_own_ministry on held_short_name
  for select to authenticated
  using (app.is_admin_of(ministry_id));

create policy held_short_name_command_read on held_short_name
  for select to discipler_command
  using (ministry_id = app.command_ministry_id());

-- The first short name free for a Ministry that wants this one: the name itself
-- if nobody has ever held it and no route needs it, otherwise `-2`, `-3` and so
-- on, the lowest nobody holds. That is found in one read rather than counted up
-- to, so a name a thousand test Ministries share costs one read and not a
-- thousand: it is `-2`, or one past a suffix somebody holds. A number that is
-- simply part of a church's name, as in *Grace 300*, is held like any other and
-- is never counted on from. Security definer
-- because the answer depends on every Ministry's names, which no connection
-- acting for one Ministry may read.
create function app.free_short_name(wanted text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  suffix bigint;
  candidate text;
begin
  if not app.short_name_is_reserved(wanted)
     and not exists (select 1 from public.held_short_name h where h.short_name = wanted) then
    return wanted;
  end if;

  select min(c.n)
    into suffix
    from (
      select 2::bigint as n
      union
      select substring(h.short_name from length(wanted) + 2)::bigint + 1
        from public.held_short_name h
       where h.short_name like wanted || '-%'
         and substring(h.short_name from length(wanted) + 2) ~ '^[0-9]{1,9}$'
    ) c
   where not exists (
     select 1 from public.held_short_name h where h.short_name = wanted || '-' || c.n
   );

  loop
    -- The suffix always fits: the name is cut back for it, at the cost of its
    -- last characters rather than of the number that tells two churches apart.
    candidate := btrim(left(wanted, 40 - length(suffix::text) - 1), '-') || '-' || suffix;
    exit when not app.short_name_is_reserved(candidate)
          and not exists (select 1 from public.held_short_name h where h.short_name = candidate);
    suffix := suffix + 1;
  end loop;

  return candidate;
end;
$$;

revoke execute on function app.free_short_name(text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Every Ministry that exists today is given one
-- ---------------------------------------------------------------------------

alter table ministry add column short_name text collate "C";

-- Oldest first, so the Ministry that has been using Discipler longest keeps the
-- plain name when two share one. No history is written: this is no Admin's act,
-- and `held_short_name` records when each was first held.
do $$
declare
  each_ministry record;
  given text;
begin
  for each_ministry in
    select m.id, m.name from public.ministry m order by m.created_at, m.id
  loop
    given := app.free_short_name(app.short_name_from(each_ministry.name));
    update public.ministry set short_name = given where id = each_ministry.id;
    insert into public.held_short_name (short_name, ministry_id) values (given, each_ministry.id);
  end loop;
end;
$$;

alter table ministry alter column short_name set not null;

alter table ministry
  add constraint ministry_short_name_is_unique unique (short_name),
  add constraint ministry_short_name_is_readable
    check (short_name ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(short_name) <= 40),
  add constraint ministry_short_name_is_not_a_route
    check (not app.short_name_is_reserved(short_name));

-- ---------------------------------------------------------------------------
-- A new Ministry is given one when it opens, and every name is held for good
-- ---------------------------------------------------------------------------

-- Whatever opens the Ministry -- the Ministry Setup Link, the seed script, a
-- fixture -- names it and nothing else, and the short name follows from the name.
-- One generation at a time across Discipler, because two churches called the
-- same thing opening in the same moment would otherwise both be handed the plain
-- name and one of them refused at the key.
create function app.give_a_new_ministry_its_short_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.short_name is null then
    perform pg_advisory_xact_lock(hashtext('held_short_name'));
    new.short_name := app.free_short_name(app.short_name_from(new.name));
  end if;
  return new;
end;
$$;

create trigger ministry_is_given_a_short_name
  before insert on ministry
  for each row execute function app.give_a_new_ministry_its_short_name();

-- Every name a Ministry takes is held from that moment, whoever wrote it. A name
-- this Ministry held before is taken back without a second row; one another
-- Ministry holds, or once held, is refused by the key with
-- `held_short_name_pkey`, which the command boundary reads as *taken*.
create function app.hold_the_short_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.held_short_name h
     where h.short_name = new.short_name and h.ministry_id = new.id
  ) then
    insert into public.held_short_name (short_name, ministry_id)
    values (new.short_name, new.id);
  end if;
  return null;
end;
$$;

create trigger ministry_short_name_is_held
  after insert or update of short_name on ministry
  for each row execute function app.hold_the_short_name();

revoke execute on function app.give_a_new_ministry_its_short_name() from public, anon, authenticated, service_role;
revoke execute on function app.hold_the_short_name() from public, anon, authenticated, service_role;

-- An Admin renames it through the command boundary, scoped by the existing
-- `ministry_command_write` policy to the Ministry the connection acts for.
grant update (short_name) on ministry to discipler_command;

-- ---------------------------------------------------------------------------
-- Opening the forms from a link
-- ---------------------------------------------------------------------------

-- The one answer a short name buys before anything is read: which Ministry held
-- it, and what that Ministry is called now. Security definer because the
-- connection asking has not yet said which Ministry it acts for, and cannot until
-- this has answered, as `app.ministry_for_invitation` does for a token.
create function app.ministry_named(wanted text)
returns table (ministry_id uuid, short_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.short_name
    from public.held_short_name h
    join public.ministry m on m.id = h.ministry_id
   where h.short_name = wanted;
$$;

revoke execute on function app.ministry_named(text) from public, anon, authenticated, service_role;
grant execute on function app.ministry_named(text) to discipler_command;

-- ---------------------------------------------------------------------------
-- Intake forms carries the short name
-- ---------------------------------------------------------------------------

-- The document `20261008000300_assigning_a_material.sql` defined, with one key
-- added and nothing else changed: `short_name`, which the field at the top of
-- the page shows and both links and both QR codes are built from.
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
    'short_name', (select m.short_name from public.ministry m where m.id = ministry)
  );
end;
$$;

-- Restated rather than assumed, as every page function's grants are.
revoke execute on function public.intake_forms_page() from public, anon, service_role;
grant execute on function public.intake_forms_page() to authenticated;
