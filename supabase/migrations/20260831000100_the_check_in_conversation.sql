-- ---------------------------------------------------------------------------
-- The weekly check-in conversation
-- ---------------------------------------------------------------------------
--
-- One sequence per Leader, covering every relationship they lead, asked one after
-- another in a single thread. Two tables: the conversation, and the questions
-- inside it.
--
-- The prompt carries the relationship *and* the role it was sent for. Both,
-- because a Person may lead some relationships and be discipled in others while
-- reaching Discipler on one phone number -- and because Participant check-ins are
-- a thing a Ministry may ask for later. A prompt keyed to the relationship alone
-- would have to be migrated the day they do.

-- The three questions of one relationship's turn. `satisfaction` follows a
-- meeting that happened; `concern_detail` follows a Concern. Neither is reachable
-- any other way.
create type checkin_question as enum ('met', 'satisfaction', 'concern_detail');

-- What `A`, `B` and `C` are *stored* as. The letters are copy: they are what the
-- message advertised, they could be renumbered, and a pilot's first check-in
-- cannot be re-tokenised afterwards. The word is the fact.
create type checkin_satisfaction as enum ('outstanding', 'good', 'concern');

-- `completed` -- the final relationship was answered for and the thank-you sent.
-- `abandoned` -- a new one displaced it. Two sequences never run for one Leader at
-- once, and an abandoned one's unanswered questions stay unanswered rather than
-- being tidied away: they are what the Stalled rule reads.
create type checkin_sequence_outcome as enum ('completed', 'abandoned');

create table checkin_sequence (
  id          uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references ministry (id) on delete cascade,
  -- The Person, never a relationship. A Leader holding three of them gets one
  -- conversation, and it is addressed to them.
  person_id   uuid not null,
  started_at  timestamptz not null,
  -- The relationships this conversation covers, in the order it asks about them,
  -- fixed at the moment it opened. Stored rather than re-derived: a relationship
  -- paused halfway through must not renumber the questions still to come, and
  -- ticket 10 counts a relationship-week unanswered when it was *covered* and no
  -- reply arrived -- whether or not its question was ever reached.
  covering    uuid[] not null check (array_length(covering, 1) >= 1),
  closed_at   timestamptz,
  outcome     checkin_sequence_outcome,

  constraint checkin_sequence_person_fk
    foreign key (person_id, ministry_id) references person (id, ministry_id)
    on delete cascade,

  -- The target of checkin_prompt's composite foreign key, which is what keeps a
  -- prompt and its sequence inside one Ministry declaratively.
  constraint checkin_sequence_id_ministry_uniq unique (id, ministry_id),

  -- A closed sequence says how it ended. A sequence with an outcome and no
  -- closing date would be one that is still running and has already finished.
  constraint checkin_sequence_closing_carries_an_outcome
    check ((closed_at is null) = (outcome is null)),
  constraint checkin_sequence_closes_after_it_opens
    check (closed_at is null or closed_at >= started_at)
);

-- Two sequences never run against one Leader at once. Enforced here rather than
-- only in the command, because the rule the whole Check-In Rhythm rests on is
-- that a reply has exactly one conversation to belong to.
create unique index checkin_sequence_one_open_per_person
  on checkin_sequence (person_id) where closed_at is null;

create index checkin_sequence_ministry_idx
  on checkin_sequence (ministry_id, started_at desc);

create table checkin_prompt (
  id              uuid primary key default gen_random_uuid(),
  ministry_id     uuid not null references ministry (id) on delete cascade,
  sequence_id     uuid not null,
  relationship_id uuid not null,
  -- The role this question was sent for. `leader` on every row today, written
  -- down anyway: it is what tells a dual-role Person's messages apart in the data
  -- when they share one phone number.
  role            member_role not null,
  -- Which relationship's turn it is, one-based, in the order the sequence opened
  -- with. History reads back in the order the Leader lived it.
  position        integer not null check (position >= 1),
  question        checkin_question not null,
  asked_at        timestamptz not null,
  -- Where this question falls in the whole conversation, and the only thing that
  -- can say which prompt is the most recent. `asked_at` cannot: a command answers
  -- a question and asks the next one from a single reading of the injected clock,
  -- so the two carry the same instant, and a tie there would make *the question
  -- awaiting a reply* depend on which row the planner happened to return.
  -- An identity column rather than a `bigserial`: the privilege to advance it
  -- comes from the privilege to insert the row, so the command role needs no
  -- separate grant on a sequence object.
  step            bigint generated always as identity,

  -- The reply, bound to the Person who sent it and never to the relationship
  -- alone. Nothing may assume one respondent per relationship: that assumption is
  -- exactly what Participant check-ins would have to migrate away from.
  answered_at     timestamptz,
  answered_by     uuid,
  -- One column per question, because they are different facts and a single text
  -- answer would make `2` and `B` the same shape.
  met             boolean,
  satisfaction    checkin_satisfaction,
  -- The Concern in the Leader's own words. The most sensitive text in the
  -- product; ticket 10 gives Concerns their own table with the viewing audit and
  -- the clear-on-resolve rule, and this is the raw reply as it arrived.
  detail          text,

  constraint checkin_prompt_sequence_fk
    foreign key (sequence_id, ministry_id) references checkin_sequence (id, ministry_id)
    on delete cascade,
  constraint checkin_prompt_relationship_fk
    foreign key (relationship_id, ministry_id) references relationship (id, ministry_id),
  constraint checkin_prompt_answered_by_fk
    foreign key (answered_by, ministry_id) references person (id, ministry_id),

  -- An answer is a moment and a Person together. Either alone is half a fact:
  -- a reply nobody sent, or a sender with nothing they sent.
  constraint checkin_prompt_answer_names_who_replied
    check ((answered_at is null) = (answered_by is null)),
  constraint checkin_prompt_answered_after_it_is_asked
    check (answered_at is null or answered_at >= asked_at),

  -- The answer columns belong to their question, and an answered prompt has
  -- exactly the one its question asked for. Without this a `met` prompt could
  -- carry a satisfaction rating for a meeting nobody confirmed happened.
  constraint checkin_prompt_answer_matches_its_question
    check (
      case question
        when 'met' then
          satisfaction is null and detail is null
          and (answered_at is null) = (met is null)
        when 'satisfaction' then
          met is null and detail is null
          and (answered_at is null) = (satisfaction is null)
        when 'concern_detail' then
          met is null and satisfaction is null
          and (answered_at is null) = (detail is null)
      end
    )
);

-- The lookup every inbound message makes: which question is this sequence waiting
-- on. The most recent prompt owns the next reply, so it is read newest-first.
create index checkin_prompt_awaiting_idx
  on checkin_prompt (sequence_id, step desc);

-- Ticket 10 derives consecutive-unanswered and consecutive-not-meeting per
-- relationship from these rows.
create index checkin_prompt_relationship_idx
  on checkin_prompt (ministry_id, relationship_id, asked_at desc);

comment on column checkin_prompt.role is
  'The role this question was sent for. Recorded rather than assumed so that a '
  'dual-role Person''s messages stay distinguishable on one phone number, and so '
  'Participant check-ins can be added without migrating what a Leader answered.';

-- ---------------------------------------------------------------------------
-- Resolving an inbound message with no session
-- ---------------------------------------------------------------------------

-- The second read in Discipler that cannot name its Ministry up front. A text
-- message arrives carrying a phone number and nothing else -- no session, no URL,
-- no token -- so this answers exactly one question, which Ministry the connection
-- should scope itself to, and which Person on it sent the message.
--
-- Resolution is the sender's number to a Person, and never to *the Person's
-- relationship*: a Leader may hold several, and the position in their open
-- sequence is the only thing that says which one a `1` is about.
--
-- A number held by more than one Person is ticket 26's. Until it lands this
-- resolves nothing rather than guessing, because guessing would file one
-- congregant's answer against another's relationship.
create function app.sender_of_inbound(candidate_phone text)
returns table (ministry_id uuid, person_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select p.ministry_id, p.id
    from public.person p
   where p.phone = candidate_phone
     and (select count(*) from public.person q where q.phone = candidate_phone) = 1;
$$;

revoke execute on function app.sender_of_inbound(text) from public;
grant execute on function app.sender_of_inbound(text) to discipler_command;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table checkin_sequence enable row level security;
alter table checkin_prompt   enable row level security;
alter table checkin_sequence force  row level security;
alter table checkin_prompt   force  row level security;

revoke all on checkin_sequence, checkin_prompt from anon, authenticated, service_role;

-- An Admin sees their Ministry's check-ins; a Leader sees the conversations they
-- are having. `app.leads_person` is not the test here -- a Leader answers for
-- themselves -- so the sequence is theirs when it is addressed to their Person.
grant select on checkin_sequence, checkin_prompt to authenticated;

create policy checkin_sequence_read_own_ministry on checkin_sequence
  for select to authenticated
  using (
    app.is_admin_of(ministry_id)
    or person_id in (
      select p.id from public.person p where p.user_id = (select auth.uid())
    )
  );

create policy checkin_prompt_read_own_ministry on checkin_prompt
  for select to authenticated
  using (
    app.is_admin_of(ministry_id)
    or sequence_id in (
      select s.id
        from public.checkin_sequence s
        join public.person p on p.id = s.person_id
       where p.user_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on checkin_sequence, checkin_prompt to service_role;
grant select, insert, update, delete on checkin_sequence, checkin_prompt to discipler_command;

create policy checkin_sequence_command on checkin_sequence
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

create policy checkin_prompt_command on checkin_prompt
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

-- `person_opt_out` needs nothing here. The Roster migration already granted the
-- command role write access and scoped it to the declared Ministry, against the
-- day something could write to it. `STOP` is that day.
