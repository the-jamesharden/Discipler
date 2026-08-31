-- ---------------------------------------------------------------------------
-- Roster completeness: the plan an Admin records, and the link that reopens Intake
-- ---------------------------------------------------------------------------
--
-- Two things land here, and they are the two gaps between an Admin and a Person's
-- real situation that need storage.
--
-- The first is that `person.eligible_to_lead` -- a column since ticket 06, with a
-- comment saying it is ticket 16's intended-role field -- becomes readable on the
-- Roster. Nothing else changes about it: it is already one field rather than two,
-- already independent of Intake and of an account, and already `false` by default.
--
-- The second is the Intake link an Admin sends a Person so they can correct their
-- own availability or number. It is a credential and not a history record, which is
-- what makes it the one token table in Discipler that is replaced rather than
-- appended to: re-issuing supersedes the link the Admin sent before, because two
-- live links to the same Person would both open the door and neither could revoke
-- the other.

-- ---------------------------------------------------------------------------
-- The Roster row carries the Admin's plan
-- ---------------------------------------------------------------------------

-- Added to the function rather than read off `person` beside it, for the reason the
-- status is in here: since ticket 15 no browser session holds SELECT on every column
-- of `person`, and asking for a derivation as a computed column made the request a
-- whole-row reference. One function, one row, everything the Roster shows.
--
-- Eligibility sits next to Participation Status and answers a different question.
-- The status says whether this Person is being discipled; eligibility says whether
-- an Admin has decided they may lead. Neither reads the other, and a screen showing
-- one without the other invites exactly the collapse the product rules forbid --
-- Roster membership, Intake completion and pairing eligibility are three facts.
--
-- Dropped and recreated rather than replaced, because the result is widening by a
-- column and Postgres refuses to change the shape of an existing function's return
-- type in place.
drop function public.roster(uuid);

create function public.roster(target_ministry_id uuid)
returns table (
  person_id uuid,
  full_name text,
  participation_status public.participation_status,
  eligible_to_lead boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, public.participation_status(p), p.eligible_to_lead
    from public.person p
   where p.ministry_id = target_ministry_id
     and app.is_admin_of(target_ministry_id)
   order by p.full_name;
$$;

comment on function public.roster(uuid) is
  'One Ministry''s Roster as the Admin surface shows it: who is on it, each '
  'Person''s derived Participation Status, and whether an Admin has marked them '
  'eligible to lead. No contact details -- a number is reached through '
  'public.contact_to_share and nowhere else.';

revoke execute on function public.roster(uuid) from public, anon;
grant execute on function public.roster(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The link that reopens a Person's own Intake
-- ---------------------------------------------------------------------------

-- The only route by which a Participant's availability changes. There is no
-- Participant dashboard and no SMS path for it: an Admin hands over a link, the
-- Person opens their own form with their answers already in it, and submits it
-- again. Nothing about it gives them an account.
--
-- One row per Person, and that is the whole of re-issuing. An Admin who presses the
-- control twice has one live link, not two: the second replaces the first, which is
-- what an Admin means by *send them a new one*. It is why this table is written to
-- rather than appended to -- a token is a credential, and the record that one was
-- issued is the history event beside it.
create table intake_link (
  ministry_id uuid not null references ministry (id) on delete cascade,
  person_id   uuid not null primary key,
  -- Possession of the link is the whole of the authentication, exactly as it is for
  -- an Invitation Link, so the token is unique across every Ministry rather than
  -- within one.
  token       text not null unique check (length(btrim(token)) > 0),
  created_at  timestamptz not null,
  expires_at  timestamptz not null,

  constraint intake_link_person_fk
    foreign key (person_id, ministry_id) references person (id, ministry_id) on delete cascade,
  constraint intake_link_expires_after_it_is_issued check (expires_at > created_at)
);

create index intake_link_ministry_idx on intake_link (ministry_id);

comment on table intake_link is
  'The link an Admin sends a Person so they can correct their own Intake answers. '
  'One live link per Person: re-issuing replaces it. Never consumed -- a Person who '
  'corrects their number today and their availability next week uses the same link '
  'until it expires.';

-- ---------------------------------------------------------------------------
-- Resolving the token with no session
-- ---------------------------------------------------------------------------

-- The same problem `app.ministry_for_invitation` solves, and the same shape: the
-- page is served to somebody with no account, so something has to answer which
-- Ministry the connection should scope itself to before anything is scoped at all.
--
-- It answers with the Person and the window as well as the Ministry, because those
-- three are the whole of what the token names and reading them back afterwards would
-- be a second query for facts this one already had in hand.
--
-- An expired token still answers. The page has to tell the difference between a
-- link that has run out and one that was never real, and refusing to resolve it at
-- all would make those two the same screen. Whether it has run out is decided
-- against the injected clock, like every other question about time.
create function app.intake_link_for_token(candidate_token text)
returns table (ministry_id uuid, person_id uuid, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.ministry_id, l.person_id, l.expires_at
    from public.intake_link l
   where l.token = candidate_token;
$$;

revoke execute on function app.intake_link_for_token(text) from public;
grant execute on function app.intake_link_for_token(text) to discipler_command;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table intake_link enable row level security;
alter table intake_link force  row level security;

revoke all on intake_link from anon, authenticated, service_role;

-- The Admin's. A Leader has no business holding a link that reopens the Intake of
-- somebody they lead: correcting a Person's own answers is between that Person and
-- the Ministry, and the Admin is who hands the link over.
grant select on intake_link to authenticated;

create policy intake_link_read_own_ministry on intake_link
  for select to authenticated
  using (app.is_admin_of(ministry_id));

grant select, insert, update, delete on intake_link to service_role;
grant select, insert, update, delete on intake_link to discipler_command;

create policy intake_link_command on intake_link
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());
