-- Four answers, A to D (Pastor feedback, ticket 03).
--
-- James, 2026-10-12: the satisfaction question offers four answers instead of
-- three, so there is no middle answer to default to -- A outstanding, B good,
-- C okay, D concern. Only D is a concern. Until now it read *Reply A for
-- outstanding, B for good, C for concern*.
--
-- `okay` is a new stored word. It goes before `concern` so the enum keeps its
-- order from best to worst. Nothing already stored changes: the answers are
-- stored as words and never as letters, so every `concern` on record stays a
-- concern, and no row here is rewritten.

alter type public.checkin_satisfaction add value 'okay' before 'concern';

-- Which answers a question offered when it was sent. A reply is read against the
-- wording its question was sent with, never the wording in force when the reply
-- arrives: a Leader sent the three-answer question on Monday who replies `C` on
-- Tuesday, after the change, meant concern, and is recorded as a concern.
--
-- `a_to_c` is the three-answer question and `a_to_d` the four-answer one. Only
-- the satisfaction question was ever worded two ways; the meeting question and
-- the Concern detail request read the same under both, so a prompt of either
-- carries the wording too and it changes nothing about how it is read. Stated on
-- every prompt rather than only on the one question, so the next change to any
-- question's answers is one more value here and not a second column.
create type public.checkin_wording as enum ('a_to_c', 'a_to_d');

-- Null on every row written before this migration, and on every row written by
-- the code from before it during the window between this migration and the
-- deploy that follows it: both sent the three-answer question, so null reads as
-- `a_to_c`. Not backfilled, because the rows that already exist are history and
-- are not rewritten, and because a backfill would not reach the rows the old
-- code goes on inserting until the deploy lands. Not defaulted, for the second of
-- those reasons too: a default of `a_to_d` would stamp the old code's three-answer
-- questions as four-answer ones, and a default of `a_to_c` would quietly mislabel
-- any future insert that forgot to say.
alter table public.checkin_prompt add column wording public.checkin_wording;

comment on column public.checkin_prompt.wording is
  'Which answers the question offered when it was sent, and so how its reply is '
  'read. Null on a prompt sent before this column existed, which offered the '
  'three answers A to C (C for concern); every prompt sent since says a_to_d.';
