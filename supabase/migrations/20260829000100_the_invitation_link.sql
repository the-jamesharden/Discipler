-- ---------------------------------------------------------------------------
-- The Invitation Link, acceptance, and the Follow-Up Item
-- ---------------------------------------------------------------------------
--
-- A relationship is created and activates later, when every Leader in it has
-- agreed to lead. This migration carries the three facts that flow needs: the
-- link that reveals a relationship to somebody with no session, the per-Leader
-- record that they agreed, and the persistent item an Admin has to act on when
-- something in the flow goes wrong.

-- ---------------------------------------------------------------------------
-- Each Leader's own acceptance
-- ---------------------------------------------------------------------------

-- `relationship.accepted_at` is activation: the moment the relationship left
-- Awaiting Leader Acceptance, after which its Starter Message has gone out. It
-- cannot also be the record that *a* Leader agreed, because a group may hold
-- several and one column cannot hold several answers. So the agreement is
-- recorded on the membership -- which is where every other fact about a role
-- already lives -- and the relationship's timestamp is stamped when the last
-- open leader membership has one.
alter table relationship_member
  add column accepted_at timestamptz;

-- Nobody accepts on behalf of a Participant. Acceptance is the Leader agreeing
-- to lead, and a Participant is told about the match rather than asked to ratify
-- it -- they decline, which raises an item, and never accept.
alter table relationship_member
  add constraint relationship_member_only_a_leader_accepts
    check (accepted_at is null or role = 'leader');

alter table relationship_member
  add constraint relationship_member_accepts_after_it_starts
    check (accepted_at is null or accepted_at >= started_at);

-- ---------------------------------------------------------------------------
-- The Invitation Link
-- ---------------------------------------------------------------------------

-- Needed so an invitation can be tied to a relationship *and* its Ministry in one
-- foreign key. `relationship_id_ministry_kind_uniq` carries `kind` as well, which
-- an invitation has no business restating.
alter table relationship
  add constraint relationship_id_ministry_uniq unique (id, ministry_id);

-- One row per person per relationship. Its meaning is the same whichever side of
-- the relationship the person stands on -- *this token reveals this relationship
-- to this person, with no session* -- so there is no role column here. The role
-- is already on `relationship_member`, and the page reads it from there rather
-- than trusting a copy that could disagree with it.
create table invitation (
  id             uuid primary key default gen_random_uuid(),
  ministry_id    uuid not null references ministry (id) on delete cascade,
  relationship_id uuid not null,
  person_id      uuid not null,
  -- Possession of the phone it was sent to is the authentication, so the token is
  -- the whole credential and is unique across every Ministry, not within one.
  token          text not null unique check (length(btrim(token)) > 0),
  created_at     timestamptz not null,
  expires_at     timestamptz not null,
  -- Consumed on account creation, not on resolution. A Leader who opens the link
  -- and is interrupted by a phone call returns to the same message rather than
  -- needing a re-issue.
  consumed_at    timestamptz,

  constraint invitation_relationship_fk
    foreign key (relationship_id, ministry_id) references relationship (id, ministry_id),
  constraint invitation_person_fk
    foreign key (person_id, ministry_id) references person (id, ministry_id),
  constraint invitation_expires_after_it_is_issued check (expires_at > created_at),
  constraint invitation_consumed_after_it_is_issued
    check (consumed_at is null or consumed_at >= created_at)
);

-- A person holds at most one live invitation to a relationship. Re-issuing is a
-- later ticket's; what this refuses is the same act running twice and leaving two
-- tokens, either of which would still open the door.
create unique index invitation_one_live_per_person_per_relationship
  on invitation (relationship_id, person_id)
  where consumed_at is null;

create index invitation_relationship_idx on invitation (relationship_id);

-- ---------------------------------------------------------------------------
-- The Follow-Up Item
-- ---------------------------------------------------------------------------

-- Ticket 07 gathers these into the Care Needed view and adds the rest of the
-- table. These two exist here because this flow is the only thing that raises
-- them, and a condition raised with nowhere to land reaches nobody.
create type follow_up_kind as enum (
  -- The highest-stakes condition in the product: a wrong number sends that
  -- Leader's check-ins to a stranger indefinitely.
  'invitation_number_disputed',
  -- A Participant said the match is not right, on a web page, without having to
  -- have a conversation about it.
  'match_declined'
);

create table follow_up_item (
  id              uuid primary key default gen_random_uuid(),
  ministry_id     uuid not null references ministry (id) on delete cascade,
  kind            follow_up_kind not null,
  person_id       uuid,
  relationship_id uuid,
  raised_at       timestamptz not null,
  -- Never cleared by the event that raised it and never clears itself. It
  -- persists until an Admin acts on it.
  resolved_at     timestamptz,

  constraint follow_up_item_person_fk
    foreign key (person_id, ministry_id) references person (id, ministry_id),
  constraint follow_up_item_relationship_fk
    foreign key (relationship_id, ministry_id) references relationship (id, ministry_id),
  constraint follow_up_item_resolved_after_it_is_raised
    check (resolved_at is null or resolved_at >= raised_at)
);

-- Twenty taps on "not my number" is one condition, not twenty. An open item of a
-- kind, about a person, on a relationship, is the item -- raising it again while
-- it stands changes nothing, which is what makes the raise safe to retry.
create unique index follow_up_item_one_open_per_subject
  on follow_up_item (ministry_id, kind, person_id, relationship_id)
  where resolved_at is null;

create index follow_up_item_open_idx
  on follow_up_item (ministry_id, raised_at desc)
  where resolved_at is null;

-- ---------------------------------------------------------------------------
-- Resolving a token with no session
-- ---------------------------------------------------------------------------

-- The one read in Discipler that cannot name its Ministry up front. Every other
-- sessionless read -- the Intake form -- has the Ministry in the URL; an
-- Invitation Link deliberately does not, because a link that announced which
-- church it belonged to would say something about its holder before they had
-- proved anything.
--
-- So this answers exactly one question, which Ministry the connection should
-- scope itself to, and nothing else. Everything the page actually shows is then
-- read back under the ordinary policies, with `discipler.ministry_id` set. An
-- expired or consumed token still answers: the page has to tell the difference
-- between a link that has run out and one that was never real, and refusing to
-- resolve it at all would make those two the same screen.
create function app.ministry_for_invitation(candidate_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i.ministry_id from public.invitation i where i.token = candidate_token;
$$;

revoke execute on function app.ministry_for_invitation(text) from public;
grant execute on function app.ministry_for_invitation(text) to discipler_command;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table invitation      enable row level security;
alter table follow_up_item  enable row level security;
alter table invitation      force  row level security;
alter table follow_up_item  force  row level security;

revoke all on invitation, follow_up_item from anon, authenticated, service_role;

-- Both are the Admin's. A Leader has no view onto the invitations of the people
-- they lead, and Care Needed is an Admin surface by definition.
grant select on invitation, follow_up_item to authenticated;

create policy invitation_read_own_ministry on invitation
  for select to authenticated
  using (app.is_admin_of(ministry_id));

create policy follow_up_item_read_own_ministry on follow_up_item
  for select to authenticated
  using (app.is_admin_of(ministry_id));

grant select, insert, update, delete on invitation, follow_up_item to service_role;
grant select, insert, update, delete on invitation, follow_up_item to discipler_command;

create policy invitation_command on invitation
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

create policy follow_up_item_command on follow_up_item
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

-- ---------------------------------------------------------------------------
-- Enrolling a Leader, and nothing wider
-- ---------------------------------------------------------------------------

-- Acceptance is the only thing in Discipler that creates a `ministry_member` row
-- without an Admin, so the privilege it needs is written as narrowly as the act:
-- insert only, into the Ministry the connection has declared it is acting for, at
-- the `leader` tier and no other. The command role cannot make an Admin, cannot
-- change a tier, and cannot remove anybody.
--
-- `tier` governs access only. It never determines who leads a relationship: an
-- Admin who also leads keeps their one `admin` row, because
-- unique (ministry_id, user_id) permits no second one, and the insert below does
-- nothing rather than demoting them.
grant insert on ministry_member to discipler_command;

create policy ministry_member_enrol_a_leader on ministry_member
  for insert to discipler_command
  with check (ministry_id = app.command_ministry_id() and tier = 'leader');
