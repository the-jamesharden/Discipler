-- ---------------------------------------------------------------------------
-- Ticket 20 -- One conversation per phone
-- ---------------------------------------------------------------------------
--
-- A phone number holds one conversation at a time, however many people are
-- reachable on it. Ticket 03 landed most of what that needs -- `prompt_key`, the
-- serialisation key, and `prompt_state`, the reply lifecycle -- and neither has to
-- change. What is missing is what kind of message a row is, and when its
-- conversation opened.
--
-- Nothing on the table distinguishes a scheduled check-in question from a Welcome
-- Message today, and `prompt_state` cannot stand in for it: it is null on both, and
-- the two are governed by opposite rules. A keyword command and its question are
-- never held; a message expecting no reply never holds the phone at all. Neither
-- sentence is expressible without this column.

-- `scheduled_question` -- a Response-Required Message the Check-In Rhythm scheduled:
--   the meeting question, the satisfaction question, the Concern detail request. It
--   takes the number when it is sent, and it waits when the number is busy.
-- `keyword_question`   -- a Response-Required Message an inbound keyword opened: the
--   menu, the pause confirmation. It takes the number and **never** waits. A Leader
--   who texts PAUSE is answered now, not after answering the check-in they are
--   trying to pause.
-- `no_reply`           -- everything else. The Welcome and Starter Messages, the
--   closing thank-you, a reminder re-send, a clarification, an Invitation Link, an
--   acknowledgement. None is answered, so none takes the number.
--
-- Spelled *question* rather than *prompt* because `CONTEXT.md` avoids the second
-- word: it names an Outstanding Reply where it survives in this table, and reads as
-- a Keyword Exchange where it does not. The two older columns keep their names --
-- the glossary grants them that -- and nothing new borrows the ambiguity.
create type outbound_message_kind as enum (
  'scheduled_question',
  'keyword_question',
  'no_reply'
);

alter table outbound_message
  -- The default is for the backfill and is dropped immediately below, so no
  -- future insert can decline to say what it is sending. A row that defaulted
  -- would be answering *does this take the recipient's number* by omission, and
  -- the two wrong answers are a Welcome Message that blocks a first check-in and a
  -- check-in question that lets a second one land on top of it.
  add column message_kind outbound_message_kind not null default 'no_reply',

  -- When the queue took this number, which is when the conversation started and
  -- what every timeout is measured from.
  --
  -- Not `sent_at`, and the difference is a bug this replaces. The number is taken
  -- inside the claim, before the vendor is called -- ADR 0013 says why -- so a
  -- worker killed between the two leaves a row that is open and has no `sent_at`.
  -- A sweep reading `sent_at` would never match it, and that number would hold a
  -- conversation for a message nobody sent, forever.
  add column reply_opened_at timestamptz;

alter table outbound_message
  alter column message_kind drop default;

alter table outbound_message
  -- A conversation that ever opened knows when. Every `prompt_state` -- open and
  -- the three ways it closes -- is a fact about a conversation that started, so
  -- none of them may stand without the moment it started at.
  add constraint outbound_message_an_open_reply_knows_when_it_opened
    check ((prompt_state is null) = (reply_opened_at is null));

comment on column outbound_message.message_kind is
  'What kind of message this row is, which is the only thing serialisation reads. '
  'A scheduled question takes the recipient''s number and waits for it; a keyword '
  'question takes it and never waits; everything else takes nothing.';

comment on column outbound_message.reply_opened_at is
  'When the queue took this number. Every timeout is measured from here rather '
  'than from sent_at, because the number is taken before the vendor is called and '
  'a send that never completed must still time out.';

-- ---------------------------------------------------------------------------
-- One open conversation per number, enforced
-- ---------------------------------------------------------------------------
--
-- Ticket 03's index made the lookup fast. Unique makes the rule true.
--
-- Two queue workers draining at once lock two different rows, so a row lock alone
-- cannot stop both of them deciding the number is free -- the thing they share is
-- the key, not the row. This index is what they contend on: the second write to
-- take a number that is already taken blocks until the first commits and is then
-- refused, which the worker reads as *held* and leaves for the next drain.
--
-- **Scoped to the Ministry**, unlike the index it replaces, and that is not
-- symmetry for its own sake. Every read on this path is bounded by
-- `app.command_ministry_id()`, so a Ministry cannot see -- or sweep, or close -- a
-- conversation belonging to another. A global index would let one congregation's
-- open question silently hold another's message on a shared number, with nothing
-- on either side able to release it. Whether a handset reachable in two Ministries
-- is one conversation or two is ticket 26's question, and it is not answered here
-- by making one tenant wait on a row it may not read.
drop index outbound_message_open_prompt_idx;

create unique index outbound_message_one_open_reply_per_number
  on outbound_message (ministry_id, prompt_key)
  where prompt_state = 'open';

comment on index outbound_message_one_open_reply_per_number is
  'A phone holds one conversation at a time, within a Ministry. Also the lock two '
  'concurrent queue workers contend on: they hold different row locks and only '
  'this is shared.';

-- The scan the timeout sweep makes: every conversation still open, with the kind
-- that says which window applies and the moment it opened. Partial for the same
-- reason the index above is -- open is the only state either ever asks about.
create index outbound_message_open_reply_sweep_idx
  on outbound_message (ministry_id, message_kind, reply_opened_at)
  where prompt_state = 'open';
