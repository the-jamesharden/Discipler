-- Remove from the Roster, ticket 01 -- Removing a Person from the Roster
--
-- A person's page gains a Remove card (James, 2026-09-22). A removed Person
-- leaves the Roster and its counts, the Pair page, Suggested Pairs and every
-- open Follow-Up item about them, is sent nothing further, and cannot be paired.
-- Their history stays: a removal is a dated fact beside the Person and not a
-- delete, and a later Intake from them brings them back as the same Person.
--
-- `public.roster` is left exactly as it stands. Two unmerged branches recreate it
-- with a column each, and whichever lands last would drop this one's filter; the
-- page documents that read it filter instead.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The removal
-- ---------------------------------------------------------------------------
-- Dated rather than a flag, for the reason an opt-out is: removed in March and
-- back through Intake in September are two facts, and a boolean can hold only
-- the second. The open row is the removal; `restored_at` is the Intake that
-- ended it.
--
-- `removed_by` names the Admin, and is cleared with their membership as every
-- other actor column is: the durable record of who removed somebody is the
-- `person.removed` event, which is append-only and outlives the membership.
create table person_removal (
  id           uuid primary key default gen_random_uuid(),
  ministry_id  uuid not null,
  person_id    uuid not null,
  removed_at   timestamptz not null,
  removed_by   uuid,
  restored_at  timestamptz,

  constraint person_removal_restored_after_it_was_removed
    check (restored_at is null or restored_at >= removed_at),
  constraint person_removal_person_fk
    foreign key (person_id, ministry_id) references person (id, ministry_id) on delete cascade,
  constraint person_removal_removed_by_fk
    foreign key (ministry_id, removed_by) references ministry_member (ministry_id, user_id)
    on delete set null (removed_by)
);

create index person_removal_ministry_idx on person_removal (ministry_id);

-- One standing removal per Person. Removing somebody twice is refused by the
-- command, and this is the floor under it.
create unique index person_one_open_removal
  on person_removal (person_id) where restored_at is null;

comment on table person_removal is
  'A Person an Admin removed from the Roster, from when, and by whom. The open '
  'row (restored_at null) is the removal; a later Intake from them closes it. '
  'Nothing about the Person is deleted.';

alter table person_removal enable row level security;
alter table person_removal force row level security;

revoke all on person_removal from anon, authenticated, service_role;

-- An Admin reads their own Ministry's, as they read its opt-outs.
grant select on person_removal to authenticated;
create policy person_removal_read_own_ministry on person_removal
  for select to authenticated
  using (app.is_admin_of(ministry_id));

-- The command connection writes them, in the one Ministry it declared, and
-- never deletes one.
grant select, insert, update on person_removal to discipler_command;
create policy person_removal_command on person_removal
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

grant select, insert, update, delete on person_removal to service_role;

-- ---------------------------------------------------------------------------
-- A removed Person cannot be paired
-- ---------------------------------------------------------------------------
-- The floor under the Roster no longer offering them. Enforced here for the
-- reason Intake and opt-outs are: an application-side check holds only until
-- the first write path that forgets it, and an import's plan or a stale Pair
-- popup is exactly such a path. Both an insert and a reopened membership,
-- because accepting an invitation reopens a leader's row rather than adding one.
create function app.reject_removed_member()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ended_at is not null then return new; end if;
  if tg_op = 'UPDATE' and old.ended_at is null then return new; end if;

  if exists (
    select 1 from public.person_removal r
     where r.person_id = new.person_id and r.restored_at is null
  ) then
    if new.role = 'leader' then
      raise exception 'this Person was removed from the Roster and cannot lead a relationship'
        using errcode = 'check_violation',
              constraint = 'relationship_member_leader_is_on_the_roster';
    end if;
    raise exception 'this Person was removed from the Roster and cannot be paired'
      using errcode = 'check_violation',
            constraint = 'relationship_member_participant_is_on_the_roster';
  end if;

  return new;
end;
$$;

create trigger relationship_member_person_is_on_the_roster
  before insert on relationship_member
  for each row execute function app.reject_removed_member();

create trigger relationship_member_person_is_on_the_roster_on_reopen
  before update of ended_at on relationship_member
  for each row execute function app.reject_removed_member();

-- ---------------------------------------------------------------------------
-- A removed Discipler's account goes with them
-- ---------------------------------------------------------------------------
-- James, 2026-09-22: "if they are a leader or mentor, then their account gets
-- removed upon them getting removed by the admin, so they no longer can log in
-- to see their mentor viewpoint."
--
-- The Person lets go of the account and their Leader access to this Ministry
-- ends. The account itself is deleted only where nothing else holds it: one
-- account may be linked to a Person on another Ministry's Roster (ADR-0009),
-- and removing somebody here must not sign them out of a church they still
-- belong to. Deleting it ends every session it holds, which
-- `public.session_is_live` reads, so a Discipler signed in right now is signed
-- out on their next page.
--
-- Refuses an Admin rather than removing their access: the command never asks it
-- to, and a Ministry left with no Admin could not be recovered from a screen.
--
-- Definer, because the command connection holds no delete on `ministry_member`
-- and no grant on `auth` at all, and should not: this is the one path by which
-- either is written from a command.
create function app.let_go_of_the_account(target_person_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  ministry uuid := app.command_ministry_id();
  account uuid;
begin
  select p.user_id into account
    from public.person p
   where p.id = target_person_id and p.ministry_id = ministry;

  if account is null then return false; end if;

  if exists (
    select 1 from public.ministry_member mm
     where mm.ministry_id = ministry and mm.user_id = account and mm.tier = 'admin'
  ) then
    raise exception 'an Admin is not removed from the Roster'
      using errcode = 'check_violation',
            constraint = 'person_removal_is_not_an_admin';
  end if;

  update public.person set user_id = null where id = target_person_id;
  delete from public.ministry_member where ministry_id = ministry and user_id = account;

  if not exists (select 1 from public.person p where p.user_id = account)
     and not exists (select 1 from public.ministry_member mm where mm.user_id = account) then
    delete from auth.users where id = account;
    return true;
  end if;

  return false;
end;
$$;

comment on function app.let_go_of_the_account(uuid) is
  'A Person being removed from the Roster lets go of their account: the link is '
  'cleared, their Leader access to this Ministry ends, and the account is '
  'deleted where no other Person or membership holds it. True when it was '
  'deleted. Refuses an Admin.';

revoke execute on function app.let_go_of_the_account(uuid) from public, anon, authenticated, service_role;
grant execute on function app.let_go_of_the_account(uuid) to discipler_command;

-- ---------------------------------------------------------------------------
-- Who has been removed, for the import to recognise
-- ---------------------------------------------------------------------------
-- A pasted row naming somebody who was removed is reported rather than filed
-- again, and the review in the browser has to say so before the import does.
-- Definer with the Roster's own Admin test, because the number is how a row is
-- recognised and no browser grant reaches `person.phone` (ADR-0021).
create function public.removed_people(target_ministry_id uuid)
returns table (person_id uuid, full_name text, phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, p.phone
    from public.person p
    join public.person_removal r on r.person_id = p.id and r.restored_at is null
   where p.ministry_id = target_ministry_id
     and app.is_admin_of(target_ministry_id)
   order by p.full_name, p.id;
$$;

revoke execute on function public.removed_people(uuid) from public, anon, service_role;
grant execute on function public.removed_people(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Who on the Roster is an Admin
-- ---------------------------------------------------------------------------
-- The People whose own account holds this Ministry's Admin tier: the test the
-- removal refuses on, read for the page so it offers no Remove card to anybody
-- it would refuse. Definer with the Admin test, because an Admin session reads
-- only its own `ministry_member` row, and ids only: no account leaves it.
create function public.admins_on_the_roster(target_ministry_id uuid)
returns table (person_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id
    from public.person p
    join public.ministry_member mm
      on mm.ministry_id = p.ministry_id and mm.user_id = p.user_id and mm.tier = 'admin'
   where p.ministry_id = target_ministry_id
     and app.is_admin_of(target_ministry_id);
$$;

revoke execute on function public.admins_on_the_roster(uuid) from public, anon, service_role;
grant execute on function public.admins_on_the_roster(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The Roster's document leaves them out
-- ---------------------------------------------------------------------------
-- Everything restated exactly as `20261006000100` left it, with three changes,
-- which Suggested Pairs inherits because its document is this one:
-- the rows leave out anybody removed; each row says whether the Person is an
-- Admin of this Ministry, which the person page reads to offer no Remove card;
-- and `removed` carries who was removed, for the import's review.
--
-- `is_admin` is put under the row and not over it, so that a Roster function
-- which one day carries the column itself (an unmerged branch adds it) is the
-- one read. Here it is the account's tier: the same test the removal refuses on.
create or replace function public.roster_page()
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
    'roster', jsonb_build_object(
      'rows', coalesce(
        (select jsonb_agg(
                  jsonb_build_object(
                    'is_admin', r.person_id in (select a.person_id
                                                  from public.admins_on_the_roster(ministry) a))
                  || to_jsonb(r))
           from public.roster(ministry) r
          where not exists (select 1
                              from public.person_removal x
                             where x.person_id = r.person_id
                               and x.restored_at is null)),
        '[]'::jsonb
      ),
      'members', coalesce(
        (select jsonb_agg(jsonb_build_object(
                  'person_id', m.person_id,
                  'relationship_id', m.relationship_id,
                  'role', m.role,
                  'accepted_at', m.accepted_at))
           from public.relationship_member m
          where m.ministry_id = ministry
            and m.ended_at is null),
        '[]'::jsonb
      ),
      'relationships', coalesce(
        (select jsonb_agg(jsonb_build_object(
                  'id', r.id,
                  'accepted_at', r.accepted_at,
                  'counts_as_a_group', r.kind = 'group',
                  'name', r.name))
           from public.relationship r
          where r.ministry_id = ministry
            and r.id in (select m.relationship_id
                           from public.relationship_member m
                          where m.ministry_id = ministry
                            and m.ended_at is null)),
        '[]'::jsonb
      ),
      'intended_pairings', coalesce(
        (select jsonb_agg(to_jsonb(i)) from public.intended_pairings(ministry) i),
        '[]'::jsonb
      ),
      'held_import_rows', coalesce(
        (select jsonb_agg(to_jsonb(h)) from public.held_import_rows(ministry) h),
        '[]'::jsonb
      ),
      'removed', coalesce(
        (select jsonb_agg(to_jsonb(x)) from public.removed_people(ministry) x),
        '[]'::jsonb
      )
    )
  );
end;
$$;

revoke execute on function public.roster_page() from public, anon, service_role;
grant execute on function public.roster_page() to authenticated;

-- ---------------------------------------------------------------------------
-- A text from a number a removed Person shares
-- ---------------------------------------------------------------------------
-- A number held by one Person on the Roster answers to them, even where somebody
-- removed once shared it: a spouse taken off the Roster must not leave the one
-- still on it unheard. Where nobody on the Roster holds the number, the rule is
-- the one it always was, so a removed Person's `STOP` is still recorded against
-- them.
create or replace function app.sender_of_inbound(candidate_phone text)
returns table (ministry_id uuid, person_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with held as (
    select p.ministry_id,
           p.id,
           exists (select 1
                     from public.person_removal r
                    where r.person_id = p.id
                      and r.restored_at is null) as removed
      from public.person p
     where p.phone = candidate_phone
  ),
  on_the_roster as (select count(*) as n from held where not removed)
  select h.ministry_id, h.id
    from held h, on_the_roster o
   where case
           when o.n > 0 then not h.removed and o.n = 1
           else (select count(*) from held) = 1
         end;
$$;

revoke execute on function app.sender_of_inbound(text) from public;
grant execute on function app.sender_of_inbound(text) to discipler_command;
