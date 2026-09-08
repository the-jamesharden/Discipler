-- Ticket 36 -- An imported pair is a plan
--
-- The import can bring pairs with it: a spreadsheet of who disciples whom. But
-- pairing needs completed Intake on both sides (the readiness triggers on
-- `relationship_member`), and importing a person is never consent -- so what an
-- import records is the *intention*, and the pairing forms itself the moment both
-- have completed Intake, by the same rules and with the same invitation as pairing
-- by hand. See `docs/adr/0022-an-imported-pair-is-a-plan.md`.
--
-- Two outcomes and no third. A plan is fulfilled, with the relationship it became,
-- or refused, with the reason the pairing rules gave -- and a refused plan raises a
-- Follow-Up Item so it is never silent, and is never retried: an Admin pairs by
-- hand or lets it go. There is no withdrawal, at the product owner's direction.
-- ---------------------------------------------------------------------------

create type intended_pairing_outcome as enum ('fulfilled', 'refused');

create table intended_pairing (
  -- Minted at the boundary, like every id an effect carries, so the history event
  -- that says it was planned can name it.
  id              uuid primary key,
  ministry_id     uuid not null references ministry (id) on delete cascade,
  -- The Discipler and the Disciple. The model's words, as on every table.
  leader_id       uuid not null,
  participant_id  uuid not null,
  planned_at      timestamptz not null,
  closed_at       timestamptz,
  outcome         intended_pairing_outcome,
  -- On 'fulfilled': what it became.
  relationship_id uuid,
  -- On 'refused': the pairing refusal code, as the boundary and the store name it.
  refusal         text,
  created_at      timestamptz not null default now(),

  constraint intended_pairing_two_people check (leader_id <> participant_id),
  -- Closed as a whole: a closing instant and an outcome arrive together or not at
  -- all. `is not distinct from` because a null outcome compared to a literal is
  -- unknown, and a check passes on unknown.
  constraint intended_pairing_closed_whole
    check ((closed_at is null) = (outcome is null)),
  constraint intended_pairing_fulfilled_names_what_it_became
    check ((relationship_id is not null) = (outcome is not distinct from 'fulfilled')),
  constraint intended_pairing_refused_says_why
    check ((refusal is not null) = (outcome is not distinct from 'refused')),

  -- Composite, like `relationship_member`'s, so Ministry isolation rides on the
  -- foreign key: a plan cannot name a Person of another Ministry.
  constraint intended_pairing_leader_fk
    foreign key (leader_id, ministry_id) references person (id, ministry_id) on delete cascade,
  constraint intended_pairing_participant_fk
    foreign key (participant_id, ministry_id) references person (id, ministry_id) on delete cascade,
  constraint intended_pairing_relationship_fk
    foreign key (relationship_id, ministry_id) references relationship (id, ministry_id)
);

create index intended_pairing_ministry_idx on intended_pairing (ministry_id);

-- One open plan per Disciple. A person is in one one-to-one at a time, and a plan
-- is a one-to-one, so a second plan for the same Disciple could only ever be
-- refused. A Discipler may hold any number.
create unique index intended_pairing_one_open_per_disciple
  on intended_pairing (ministry_id, participant_id)
  where closed_at is null;

comment on table intended_pairing is
  'A pairing an import recorded the intention of, waiting on both people to '
  'complete Intake. Fulfilled with the relationship it became, or refused with the '
  'reason the pairing rules gave; never retried. ADR-0022.';

-- ---------------------------------------------------------------------------
-- Who may read and write it
-- ---------------------------------------------------------------------------
alter table intended_pairing enable row level security;
alter table intended_pairing force  row level security;

-- The command connection, scoped to the Ministry it declared it is acting for, as
-- every other table it writes. Nothing for a browser session: the defaults hand a
-- new table's TRUNCATE, REFERENCES and TRIGGER to `anon` and `authenticated`, and
-- the Admin surface reads through the function below, with its own Admin test.
revoke all on intended_pairing from public, anon, authenticated;

grant select, insert, update, delete on intended_pairing to service_role;
grant select, insert, update, delete on intended_pairing to discipler_command;

create policy intended_pairing_command on intended_pairing
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

-- ---------------------------------------------------------------------------
-- What the Roster reads
-- ---------------------------------------------------------------------------
-- The plans still standing, and the refused ones an Admin has not yet acted on:
-- a refusal is closed on the plan and open on its Follow-Up Item, and the Roster
-- goes on saying *not made* until that item is resolved.
--
-- `kind::text` rather than the enum literal, because the value is added to the
-- type below in this same transaction and Postgres refuses to use a value added
-- that recently; the text comparison says the same thing.
create function public.intended_pairings(target_ministry_id uuid)
returns table (
  id uuid,
  leader_id uuid,
  participant_id uuid,
  planned_at timestamptz,
  outcome public.intended_pairing_outcome,
  refusal text
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.leader_id, i.participant_id, i.planned_at, i.outcome, i.refusal
    from public.intended_pairing i
   where i.ministry_id = target_ministry_id
     and app.is_admin_of(target_ministry_id)
     and (
       i.closed_at is null
       or (
         i.outcome::text = 'refused'
         and exists (
           select 1
             from public.follow_up_item f
            where f.ministry_id = i.ministry_id
              and f.kind::text = 'intended_pairing_refused'
              and f.resolved_at is null
              and f.payload ->> 'intendedPairingId' = i.id::text
         )
       )
     )
   order by i.planned_at, i.id;
$$;

comment on function public.intended_pairings(uuid) is
  'The pairings an import planned for one Ministry, as the Roster shows them: the '
  'ones still waiting on Intake, and the refused ones whose Follow-Up Item an Admin '
  'has not yet resolved.';

revoke execute on function public.intended_pairings(uuid) from public, anon;
grant execute on function public.intended_pairings(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The Follow-Up Item a refusal raises
-- ---------------------------------------------------------------------------
alter type follow_up_kind add value 'intended_pairing_refused';

-- Rebuilt rather than added beside, as ticket 17 did, and on `kind::text` so the
-- value added a statement ago can be named here at all. The new kind carries
-- which plan it is about and the refusal the rules gave, both as strings.
alter table follow_up_item
  drop constraint follow_up_item_payload_matches_kind;

alter table follow_up_item
  add constraint follow_up_item_payload_matches_kind
    check (
      (case kind::text
         when 'pause_expired'
           then payload -> 'periodWeeks' in ('1'::jsonb, '2'::jsonb, '4'::jsonb,
                                             '8'::jsonb, '12'::jsonb)
         when 'swap_requested'
           then payload ->> 'requestedBy' in ('leader', 'participant')
         when 'participant_keyword'
           then jsonb_typeof(payload -> 'keyword') = 'string'
            and length(btrim(payload ->> 'keyword')) > 0
         when 'intended_pairing_refused'
           then jsonb_typeof(payload -> 'intendedPairingId') = 'string'
            and jsonb_typeof(payload -> 'refusal') = 'string'
            and length(btrim(payload ->> 'refusal')) > 0
         else true
       end) is true
    );
