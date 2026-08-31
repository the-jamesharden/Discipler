-- ---------------------------------------------------------------------------
-- Ticket 17 -- Inbound keyword commands: PAUSE, RESUME, SWAP
-- ---------------------------------------------------------------------------
--
-- A Leader may pause their check-ins for a season, come back early, or ask to be
-- matched with someone else, each by texting one word. Nearly all of that is rules
-- and messages, and none of it needs a table: a Pause is still two events in
-- `ministry_event`, a swap request is still a Follow-Up Item, and `START` still
-- dates the `person_opt_out` row `STOP` opened.
--
-- What does need one is the **Keyword Exchange** -- the short SMS conversation
-- Discipler opens when a keyword needs something resolved before it can act. It is
-- state that outlives the message that created it, waits on a reply that may never
-- come, and has to be the only one of its kind for a Person. That is a table, not
-- an event: a menu whose options were re-derived at reply time would renumber
-- itself the moment a fourth relationship was formed, and a Leader's `2` would
-- select the one their message meant to leave alone.

-- ---------------------------------------------------------------------------
-- The three keywords that need one
-- ---------------------------------------------------------------------------

-- `STOP`, `START` and `HELP` are absent, and their absence is the type saying
-- something true: none of them acts on a single relationship, so none of them has
-- anything to resolve. `STOP` opts a Person out, `START` reverses it, `HELP`
-- answers itself -- and an exchange for any of them would be a conversation with
-- nothing to ask.
create type keyword_exchange_keyword as enum ('PAUSE', 'RESUME', 'SWAP');

-- How an exchange stopped being open.
--
-- `applied` -- the Leader answered and the request went through. `replaced` -- a
-- second keyword arrived, and the most recent request is the one that stands.
-- `expired` -- twenty-four hours ran out. `overtaken` -- the Leader answered, and by
-- then there was nothing left to answer about, because an Admin had paused the same
-- relationship or ended it.
--
-- `overtaken` is not folded into `applied`, though both follow a reply. They are
-- opposite facts about the same Leader's evening, and only one of them means their
-- pause is running.
create type keyword_exchange_outcome as enum ('applied', 'replaced', 'expired', 'overtaken');

create table keyword_exchange (
  id          uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references ministry (id) on delete cascade,
  -- The Person, never a relationship. Which relationship is the whole question the
  -- exchange exists to settle.
  person_id   uuid not null,
  keyword     keyword_exchange_keyword not null,

  -- The eligible relationships, in the order the menu printed them, fixed at the
  -- moment it went out. Stored rather than re-derived for the reason
  -- `checkin_sequence.covering` is: the numbers in a message have to mean the same
  -- thing when the reply lands tomorrow.
  --
  -- No foreign key, because an array cannot carry one. The same trade `covering`
  -- makes, and mitigated the same way: the identifiers are read back through a
  -- query scoped to this Ministry, and a relationship that has ended since is
  -- refused by the eligibility rule rather than by the key.
  options     uuid[] not null check (array_length(options, 1) >= 1),

  -- What the exchange has settled on, or null while it is still asking. **Only a
  -- `PAUSE` ever has one**: `RESUME` and `SWAP` apply the moment a selection lands
  -- and close in the same breath, so there is no state between choosing and acting
  -- for them to be in.
  target_id   uuid,

  -- When the Leader's keyword opened this. The twenty-four hours to expiry are
  -- measured from here and from nothing else, which is what makes a Leader who
  -- mistypes twice and replies correctly nineteen hours later still get their
  -- pause: their own replies do not move the deadline, and Discipler's
  -- clarifications do not either.
  opened_at   timestamptz not null,

  -- When Discipler last put a *question* inside this exchange: the moment it
  -- opened, or the moment a selection moved it on to the confirmation. This is what
  -- decides whether the exchange or an open check-in question owns the next reply,
  -- and it is deliberately not touched by a clarification -- a clarification
  -- restates the question already out, exactly as a check-in reminder re-sends
  -- rather than re-asks.
  prompted_at timestamptz not null,

  -- Discipler's side of the conversation, capped at two. The Leader's side is not
  -- capped at all: the exchange stays open and a valid reply is honoured right up
  -- until it expires.
  clarifications_sent integer not null default 0 check (clarifications_sent >= 0),

  closed_at   timestamptz,
  outcome     keyword_exchange_outcome,

  constraint keyword_exchange_person_fk
    foreign key (person_id, ministry_id) references person (id, ministry_id)
    on delete cascade,

  -- A closed exchange says how it ended, and one with an outcome and no closing
  -- date would be one that is still running and has already finished. The same pair
  -- rule `checkin_sequence` holds.
  constraint keyword_exchange_closing_carries_an_outcome
    check ((closed_at is null) = (outcome is null)),
  constraint keyword_exchange_closes_after_it_opens
    check (closed_at is null or closed_at >= opened_at),
  constraint keyword_exchange_prompts_after_it_opens
    check (prompted_at >= opened_at),

  -- Only a pause has a second step. A `RESUME` carrying a target would be a row
  -- describing a state the product does not have.
  constraint keyword_exchange_only_a_pause_confirms
    check (target_id is null or keyword = 'PAUSE'),

  -- And the target has to be something the menu actually offered. Without this an
  -- exchange could settle on a relationship the Leader was never shown, which is
  -- precisely the inference the eligibility rule exists to prevent.
  constraint keyword_exchange_target_was_offered
    check (target_id is null or target_id = any (options))
);

-- **At most one Keyword Exchange is open per Person**, and a second keyword
-- replaces the first. Enforced here rather than only in the command, because the
-- rule the whole exchange rests on is that a reply has exactly one request to
-- belong to -- the same reason `checkin_sequence` refuses a second open sequence.
--
-- *Open* here means unclosed, not live. Whether twenty-four hours have run out is a
-- question about time and is answered against the injected clock at the command
-- boundary, never by `now()` in SQL -- so an expired exchange still occupies this
-- slot until something closes it, which the next inbound message from that Person
-- does.
create unique index keyword_exchange_one_open_per_person
  on keyword_exchange (person_id) where closed_at is null;

create index keyword_exchange_ministry_idx
  on keyword_exchange (ministry_id, opened_at desc);

comment on table keyword_exchange is
  'The short SMS conversation Discipler opens when an inbound keyword needs '
  'something resolved before it can act -- which relationship it applies to, or how '
  'long a pause should run. At most one is open per Person, and it expires after '
  'twenty-four hours with no reminder.';

comment on column keyword_exchange.options is
  'The eligible relationships in the order the menu printed them, fixed when it '
  'went out. A menu re-derived at reply time would renumber itself the moment a '
  'fourth relationship was formed.';

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table keyword_exchange enable row level security;
alter table keyword_exchange force  row level security;

revoke all on keyword_exchange from anon, authenticated, service_role;

-- An Admin sees their Ministry's exchanges; a Leader sees the ones addressed to
-- them. `app.leads_person` is not the test -- a Leader answers for themselves --
-- so it is theirs when it names their Person, exactly as a Check-In Sequence is.
grant select on keyword_exchange to authenticated;

create policy keyword_exchange_read_own_ministry on keyword_exchange
  for select to authenticated
  using (
    app.is_admin_of(ministry_id)
    or person_id in (
      select p.id from public.person p where p.user_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on keyword_exchange to service_role;
grant select, insert, update, delete on keyword_exchange to discipler_command;

create policy keyword_exchange_command on keyword_exchange
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

-- ---------------------------------------------------------------------------
-- A swap request says which side asked
-- ---------------------------------------------------------------------------

-- Either a Leader or a Participant may text `SWAP`, and the Admin's next move
-- differs by which: unpair and re-pair the Participant, or release the Leader from
-- the relationship. An item that did not say would leave that to be guessed from
-- the `person_id` beside it, which is a join and an assumption where a fact will
-- do.
--
-- It is the role held **in the relationship named**, not a property of the Person.
-- A dual-role Person asking to swap out of the relationship they are discipled in
-- is a Participant here whatever else they lead, and that is exactly the
-- distinction the Admin needs.
--
-- Rebuilt rather than added beside, because a constraint per kind on one column
-- would be four constraints saying one rule. `is true` for the same reason the
-- original has it: a missing key makes the comparison unknown, and a check
-- constraint passes on unknown -- so written without it this would refuse a wrong
-- value and admit a missing one.
alter table follow_up_item
  drop constraint follow_up_item_payload_matches_kind;

alter table follow_up_item
  add constraint follow_up_item_payload_matches_kind
    check (
      (case kind
         when 'pause_expired'
           then payload -> 'periodWeeks' in ('1'::jsonb, '2'::jsonb, '4'::jsonb,
                                             '8'::jsonb, '12'::jsonb)
         when 'swap_requested'
           then payload ->> 'requestedBy' in ('leader', 'participant')
         when 'participant_keyword'
           then jsonb_typeof(payload -> 'keyword') = 'string'
            and length(btrim(payload ->> 'keyword')) > 0
         else true
       end) is true
    );

-- ---------------------------------------------------------------------------
-- `START` reverses a `STOP`
-- ---------------------------------------------------------------------------

-- Nothing is added for it. `person_opt_out` has carried `ended_at` since the Roster
-- migration -- *dated rather than a flag, because `STOP` today and `START` in six
-- weeks are two facts* -- against the day something could write it, and the
-- `person_one_open_opt_out` partial index already keeps a Person to one open
-- opt-out at a time. This is that day; the schema was ready for it.
