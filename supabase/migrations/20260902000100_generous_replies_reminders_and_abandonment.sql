-- ---------------------------------------------------------------------------
-- Clarifications, the one reminder, and giving up on a question
-- ---------------------------------------------------------------------------
--
-- Both columns belong to the prompt rather than to the conversation, because both
-- rules are about one question: a Leader who mistypes the meeting question has
-- spent nothing against the rating question that follows it, and a question
-- re-sent once is that question chased, not the conversation chased.
--
-- Neither is derived from history. `clarifications_sent` counts what Discipler
-- *said*, and unreadable replies are recorded whether or not one was sent, so the
-- two numbers diverge the moment a Leader mistypes a third time.

alter table checkin_prompt
  -- The one re-send an unanswered question gets. Deliberately not a second
  -- prompt row: a reminder that created one would read as a second question the
  -- Leader failed to answer, and the Stalled rule would advance twice for one
  -- silence.
  add column reminded_at timestamptz,
  add column clarifications_sent integer not null default 0;

alter table checkin_prompt
  -- Two, and then Discipler stops re-prompting. Here as well as in the command
  -- because it is the cap on what a Ministry sends to somebody's phone, and the
  -- floor under that belongs where the row is written.
  add constraint checkin_prompt_clarifications_are_capped
    check (clarifications_sent between 0 and 2),

  add constraint checkin_prompt_reminded_after_it_is_asked
    check (reminded_at is null or reminded_at >= asked_at),

  -- A question answered before the reminder was due is never reminded, and one
  -- reminded after it was answered would be a Ministry chasing a Leader for
  -- something they had already sent.
  add constraint checkin_prompt_not_reminded_after_it_is_answered
    check (reminded_at is null or answered_at is null or reminded_at <= answered_at);

comment on column checkin_prompt.reminded_at is
  'When this question was re-sent, once, twenty-four hours after it went unanswered. '
  'Null means it has not been. A reminder never creates a second prompt row, so one '
  'silence is never counted as two unanswered questions.';

comment on column checkin_prompt.clarifications_sent is
  'How many times Discipler answered an unreadable reply with the valid replies. '
  'Capped at two, after which it stops re-prompting but keeps listening: the question '
  'stays open and a valid reply is still accepted until the sequence advances past it.';

-- The tick's read: which open conversations have a question that has been sitting
-- long enough to chase. Partial, because an answered prompt is never chased and
-- the great majority of this table is answered.
create index checkin_prompt_unanswered_idx
  on checkin_prompt (asked_at)
  where answered_at is null;
