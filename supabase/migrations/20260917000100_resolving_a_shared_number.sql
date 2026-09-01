-- ---------------------------------------------------------------------------
-- Resolving a number the Roster already holds
-- ---------------------------------------------------------------------------
--
-- The importer already recognises a number it holds and refuses to guess whether a
-- new name on it is a rename or a second person on a shared phone -- ADR-0005's
-- amendment is what decided that, and both readings are ordinary in a congregation.
-- What it had no way to do was let anybody answer.
--
-- The report the import redirects to is a query string. It carries line numbers and
-- codes, deliberately no names and no numbers, and it outlives nothing: an Admin who
-- navigates away has lost it. So the rows worth answering are kept here instead,
-- which is the whole of two of ticket 26's criteria -- answering one does not require
-- re-uploading the file, and a row nobody has answered stays visible rather than
-- expiring silently.
--
-- Only `same_number_different_name` lands here. The other row problems are a
-- spreadsheet to fix -- a missing name, a number that cannot be read -- and keeping
-- one would put a question on the Roster that nothing on the screen could close.

create type import_row_answer as enum (
  -- The same Person under a new name. One Person row throughout: `person.id` never
  -- moves, and their history, relationships and messages all stay theirs. Merging
  -- two Person rows that already exist is a different act and still unbuilt.
  'same_person',
  -- The second person on a shared phone, which ADR-0005 has always allowed.
  'someone_else'
);

-- The row as the file had it, because the file is gone by the time anybody reads
-- this and both answers need the name it carried.
--
-- The identifier is minted at the boundary rather than defaulted here, like every
-- other identifier in this product: the import report has to name the row it is
-- offering answers for, and a default the insert generated would not be knowable
-- until after the row landed.
create table held_import_row (
  id          uuid primary key,
  ministry_id uuid not null references ministry (id) on delete cascade,
  -- 1-based and counting the header, so it matches what the spreadsheet shows and
  -- what the import report said.
  line        integer not null check (line >= 1),
  full_name   text not null check (length(btrim(full_name)) > 0),
  -- The name as the identity index reads it, stored rather than written into the
  -- unique index below. Two reasons, and the second is why it is a column at all.
  -- It normalises exactly as `person_ministry_identity_uniq` normalises a name,
  -- because it is the same question about the same pair: two spellings the Roster
  -- would treat as one Person must not be two questions here. And an insert that
  -- has to name this index would otherwise have to repeat the expression -- through
  -- a template literal, where a lost backslash turns `\s` into `s` and the whole
  -- clause silently stops matching anything.
  name_key    text generated always as (lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g'))) stored,
  -- The same shape `person_phone_is_e164` enforces: it has already been through
  -- `asPhoneNumber`, and one of the two answers is about to store it on a Person.
  phone       text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  email       text check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  imported_at timestamptz not null,

  -- What an Admin answered, and nothing until one does. All four together or none
  -- of them: an answer with no Person behind it would leave the row claiming a
  -- decision nobody could trace, and a Person with no answer would claim one nobody
  -- made.
  answer      import_row_answer,
  -- The Person the answer landed on -- renamed, or created. Recorded because *which
  -- Person did this row become* is the question anybody reading it afterwards has,
  -- and the answer alone does not say.
  person_id   uuid,
  -- The Admin's account, like `concern.resolved_by` and `follow_up_item.resolved_by`
  -- beside it. `on delete set null` names the one column to clear: removing somebody
  -- from a Ministry must not delete the record that this row was answered.
  resolved_by uuid,
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),

  constraint held_import_row_answered_whole check (
    (answer is null and person_id is null and resolved_at is null)
    or (answer is not null and person_id is not null and resolved_at is not null)
  ),
  constraint held_import_row_person_fk
    foreign key (person_id, ministry_id) references person (id, ministry_id) on delete cascade,
  constraint held_import_row_resolver_fk
    foreign key (ministry_id, resolved_by) references ministry_member (ministry_id, user_id)
    on delete set null (resolved_by)
);

create index held_import_row_ministry_idx on held_import_row (ministry_id);

-- One open question per name on a number. An Admin who uploads the same spreadsheet
-- twice before answering has asked one question, not two, and a second row would put
-- the same choice on the Roster twice -- where answering one of them would leave the
-- other pointing at a name that is now on the number, refusable and unanswerable.
--
-- Partial, and that is deliberate. An answered row is history and several may
-- accumulate for one pair over a semester; only the unanswered ones are unique.
create unique index held_import_row_one_open_question
  on held_import_row (ministry_id, phone, name_key)
  where resolved_at is null;

comment on table held_import_row is
  'A spreadsheet row the importer would not guess about: the number is on the '
  'Roster under a different name, which is either a rename or the second person '
  'on a shared phone. Kept until an Admin says which, and kept afterwards with '
  'their answer. See docs/adr/0005-a-person-is-a-name-and-a-number.md.';

-- ---------------------------------------------------------------------------
-- What the Admin surface reads
-- ---------------------------------------------------------------------------

-- The open questions and, beside each, everyone the Roster already holds on that
-- number. Those names are what the report offers a rename for -- one answer each,
-- because a number may reach two people and *the same Person* has as many answers
-- as there are names on it.
--
-- One row per question per name, left-joined, and the caller groups them. A
-- question whose number holds nobody still comes back: it would mean the Roster had
-- moved out from under it, and a row that vanished from the screen would be the
-- silent expiry this table exists to prevent.
--
-- The number itself never leaves. `public.roster` withholds contact details for the
-- same reason -- a number is reached through `public.contact_to_share` and nowhere
-- else -- and the line, the name in the file and the names on the Roster are
-- between them enough for an Admin to know which row this is.
--
-- SECURITY DEFINER with the Admin test written in, like `public.roster`: without it
-- this function is a probe for the names on any number in any Ministry.
create function public.held_import_rows(target_ministry_id uuid)
returns table (
  row_id      uuid,
  line        integer,
  full_name   text,
  imported_at timestamptz,
  person_id   uuid,
  person_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id, h.line, h.full_name, h.imported_at, p.id, p.full_name
    from public.held_import_row h
    left join public.person p
      on p.ministry_id = h.ministry_id and p.phone = h.phone
   where h.ministry_id = target_ministry_id
     and h.resolved_at is null
     and app.is_admin_of(target_ministry_id)
   order by h.imported_at, h.line, p.full_name;
$$;

comment on function public.held_import_rows(uuid) is
  'One Ministry''s unanswered import rows, each repeated once per Person already '
  'on its number. No phone numbers -- the line, the name in the file and the '
  'names on the Roster are what identify the row.';

revoke execute on function public.held_import_rows(uuid) from public, anon;
grant execute on function public.held_import_rows(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table held_import_row enable row level security;
alter table held_import_row force  row level security;

revoke all on held_import_row from anon, authenticated, service_role;

-- The Admin's, and nobody else's. A Leader has no business seeing a spreadsheet row
-- about somebody who may not even be on the Roster yet: this is the pastor deciding
-- who a congregant is, which is the same judgement `intake_link` is scoped by.
grant select on held_import_row to authenticated;

create policy held_import_row_read_own_ministry on held_import_row
  for select to authenticated
  using (app.is_admin_of(ministry_id));

grant select, insert, update, delete on held_import_row to service_role;
grant select, insert, update, delete on held_import_row to discipler_command;

create policy held_import_row_command on held_import_row
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());
