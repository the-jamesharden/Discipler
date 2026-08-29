-- ---------------------------------------------------------------------------
-- What a Follow-Up Item carries, and what closes one
-- ---------------------------------------------------------------------------
--
-- The table existed with the two columns the invitation flow needed. This gives it
-- the three things the rest of the product needs: a payload for the kinds that
-- carry data, a record of who closed it, and a subject rule that holds in the keys
-- rather than in whichever code path happened to write the row.

-- ---------------------------------------------------------------------------
-- The payload
-- ---------------------------------------------------------------------------

-- `jsonb` rather than a typed column per kind. Only two of six kinds carry
-- anything at all, and typed columns grow one more per kind added later -- each of
-- them null on every row but one kind's.
--
-- The rule about what each kind carries is enforced twice: as a discriminated
-- union at the command boundary, so a `pause_expired` without its period is not a
-- value TypeScript will construct, and as the check constraint below, so the
-- database refuses the bad row even when a future writer bypasses the domain.
alter table follow_up_item
  add column payload jsonb not null default '{}'::jsonb;

-- Who closed it, keyed to their membership of *this* Ministry rather than merely
-- to an account that exists. The composite key is the one this schema already uses
-- everywhere a row has to stay inside its Ministry, and it is what stops an item
-- being recorded as resolved by somebody who was never in the congregation.
--
-- `on delete set null (resolved_by)` names the one column to clear, because
-- `ministry_id` is not null and the ordinary form would try to null both. Removing
-- somebody from a Ministry must not be blocked by a care item they closed two
-- years ago -- and the durable record of who acted is the `follow_up.resolved`
-- event in `ministry_event`, which is append-only and outlives the membership.
-- This column is what the Care Needed view shows while they are still here.
alter table follow_up_item
  add column resolved_by uuid,
  add constraint follow_up_item_resolved_by_fk
    foreign key (ministry_id, resolved_by) references ministry_member (ministry_id, user_id)
    on delete set null (resolved_by);

alter table follow_up_item
  -- Two nullable typed columns, each already composite-keyed to its Ministry, and
  -- at least one of them present. Several kinds want both; `participant_keyword`
  -- has a Person and no relationship, and an item about neither is about nothing.
  add constraint follow_up_item_has_a_subject
    check (relationship_id is not null or person_id is not null),

  -- A resolver with no resolution date would be an item nothing had closed,
  -- credited to somebody.
  add constraint follow_up_item_resolution_is_dated
    check (resolved_by is null or resolved_at is not null),

  -- `relationship_unaccepted` is absent on purpose, though the Admin is shown how
  -- long it has waited. That duration is read off the relationship's `created_at`
  -- when the view is drawn: a number frozen in here would say *five days* for as
  -- long as the item stood, including on the twentieth day.
  --
  -- `is true` rather than the bare case, and it is the whole constraint. A missing
  -- key makes `payload -> 'periodWeeks'` SQL null, `jsonb_typeof` of that null, and
  -- the comparison unknown -- and a check constraint that evaluates to unknown
  -- passes. Written without this the constraint would refuse a `pause_expired`
  -- carrying the wrong type of period and admit one carrying no period at all,
  -- which is the row it exists to stop.
  add constraint follow_up_item_payload_matches_kind
    check (
      (case kind
         -- The five periods a Leader may choose, spelled out rather than merely
         -- typed as a number. `3` and `1.5` are numbers and neither is a period
         -- anybody can select, and a row carrying one would be a payload the
         -- domain refuses to read back -- which is a failed Care Needed screen
         -- rather than a refused write.
         when 'pause_expired'
           then payload -> 'periodWeeks' in ('1'::jsonb, '2'::jsonb, '4'::jsonb,
                                             '8'::jsonb, '12'::jsonb)
         when 'participant_keyword'
           then jsonb_typeof(payload -> 'keyword') = 'string'
            and length(btrim(payload ->> 'keyword')) > 0
         else true
       end) is true
    );

-- ---------------------------------------------------------------------------
-- One open item per condition
-- ---------------------------------------------------------------------------

-- Every kind dedupes while it stands open, and the history accumulates. An Admin
-- sees one thing to act on however many times it was raised, and how often it was
-- raised survives in the Week-by-Week History rather than in the Care Needed list.
--
-- Rebuilt with `nulls not distinct`, which is the whole point of this statement.
-- Under the default, two `pause_expired` items on the same relationship with a
-- null `person_id` are distinct rows to a unique index, so the tick re-evaluating
-- the same expired pause every day would file one item a day -- exactly what this
-- index was written to prevent, silently not doing it for every kind whose subject
-- is a relationship and not a Person.
drop index follow_up_item_one_open_per_subject;

create unique index follow_up_item_one_open_per_subject
  on follow_up_item (ministry_id, kind, person_id, relationship_id)
  nulls not distinct
  where resolved_at is null;

-- ---------------------------------------------------------------------------
-- Reading one subject's history back
-- ---------------------------------------------------------------------------

-- The tick asks, once per Leader still to agree, when it last reminded them --
-- which is a lookup by type and subject against a table that only ever grows. The
-- existing index is ordered for reading a Ministry's history as a timeline and
-- answers this with a sequential scan, so the cost of a tick would climb with the
-- Ministry's whole history rather than with what is outstanding in it.
--
-- Ticket 10 derives Relationship State from the same shape of question, so this is
-- the access path the history table is about to be read by, not just the tick's.
create index ministry_event_subject_idx
  on ministry_event (ministry_id, type, subject_id);
