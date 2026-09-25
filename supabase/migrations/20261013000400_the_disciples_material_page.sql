-- The Disciple's Material page (Richer materials, ticket 04)
-- ---------------------------------------------------------------------------
-- James, 2026-09-24: a Disciple is texted a link to a read-only page of their
-- relationship's Material, with no sign-in. ADR-0028 records it, and how it
-- stands beside ADR-0011's *only a Leader is sent a link*.
--
-- One link per Participant membership, minted the first time a text carries it
-- and never re-minted, so every text a Disciple has had opens today's Material.
-- It opens nothing once the membership closes or the relationship ends; that is
-- decided when it is read, not by revoking anything.

create table material_link (
  id              uuid primary key default gen_random_uuid(),
  ministry_id     uuid not null references ministry (id) on delete cascade,
  person_id       uuid not null references person (id),
  relationship_id uuid not null references relationship (id),
  -- The secret. A uuid like every other link token here, stored as the other
  -- tokens are, and unique across every Ministry since it alone names one.
  token           text not null unique,
  created_at      timestamptz not null default now(),

  constraint material_link_one_per_membership unique (person_id, relationship_id)
);

comment on table material_link is
  'A Disciple''s link to the page showing the Material one relationship of theirs '
  'is working through. Minted the first time a text carries it, never re-minted.';

alter table material_link enable row level security;
alter table material_link force  row level security;

revoke all on material_link from anon, authenticated, service_role;

grant select on material_link to authenticated;
grant select, insert on material_link to service_role;

create policy material_link_read_own_ministry on material_link
  for select to authenticated
  using (app.is_admin_of(ministry_id));

grant select, insert on material_link to discipler_command;

create policy material_link_command on material_link
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

-- The one answer a token buys before anything is read: which Ministry, and whose
-- link. Security definer because the connection asking has not yet said which
-- Ministry it acts for, and cannot until this has answered. Granted to the
-- command connection only, as `app.ministry_for_invitation` is.
create function app.material_link_for_token(target_token text)
returns table (ministry_id uuid, person_id uuid, relationship_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select l.ministry_id, l.person_id, l.relationship_id
    from public.material_link l
   where l.token = target_token;
$$;

revoke execute on function app.material_link_for_token(text) from public, anon, authenticated, service_role;
grant execute on function app.material_link_for_token(text) to discipler_command;
