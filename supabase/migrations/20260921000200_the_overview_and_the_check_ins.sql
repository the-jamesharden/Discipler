-- Ticket 31 -- The Overview and the Check-Ins tabs
--
-- Two Admin surfaces that read the Week-by-Week History and show it as numbers:
-- the Overview's three rates and this-week count, and the Check-Ins tab's list of
-- what each relationship answered this week. Neither adds a table. Both read the
-- same rows `relationship_weeks` already emits, and want two facts it does not
-- carry: *what* the Leader answered, and whether the Concern that answer raised is
-- still open.
--
-- Nothing here reads Concern text. The words are reached one Person at a time
-- through the `concern.view` command, and the authenticated role holds no grant on
-- the column; this function reads `concern.resolved_at` and nothing else of it.

-- ---------------------------------------------------------------------------
-- What each relationship-week was answered with
-- ---------------------------------------------------------------------------

-- One row per relationship per Check-In Sequence that covered it -- the same rows
-- `relationship_weeks` emits, one for one -- with the answers alongside. Facts
-- only, exactly as that function is facts only: which ISO week a row falls in, what
-- a rate is and which of this week's rows count as completed are decided in the
-- domain, where `checkInRates` and `isoWeekOf` are tests that run in milliseconds.
--
-- A second function rather than a wider `relationship_weeks`, because the two
-- answer different questions and their callers select by different names.
-- `relationship_weeks` folds the answers into one outcome for the Stalled rule;
-- this keeps them apart, because a meeting rate and a response rate are different
-- numbers computed over different denominators and the whole point of the Overview
-- is that they are not conflated. Folding the two reads into one would hand the
-- Care Needed reader columns it must not need and this one a column it must not
-- use.
--
-- `sequence_id` rides along, and is what makes the row identifiable. Two Leaders of
-- one group are asked in two conversations that open at the very same instant, so
-- `(relationship_id, opened_at)` names two rows; the sequence is what tells them
-- apart, and it is what the Check-Ins reader collapses on when one relationship was
-- covered twice in one ISO week.
--
-- `asked_at` is when the meeting question for *this relationship* went out, and is
-- null while the conversation has not reached it. The Check-Ins tab prints it as
-- the moment the question was sent; `opened_at` is when the conversation opened,
-- which for a Leader's second relationship is not the same instant.
--
-- `answered_at` is the *latest* reply for the relationship in the conversation,
-- which is the moment its turn was finished -- the same reading `relationship_weeks`
-- gives, so the two cannot disagree about whether a week was answered.
--
-- `met` and `satisfaction` are read off the prompt that asked for each, not
-- aggregated across the turn: there is one meeting question per relationship per
-- conversation and one rating question, because a reminder re-sends a prompt rather
-- than creating a second row. Taken newest-first anyway, so that if that ever
-- stopped being true the latest answer would win, exactly as `oneEntryPerWeek` in
-- the domain lets the later answer win.
--
-- `concern_open` joins `concern` on `prompt_id`, which is the exact join and the
-- only one: a Concern records the reply that carried its words, and that reply is
-- a prompt of this sequence about this relationship. Joining on `raised_at` falling
-- inside the week would be an inference about the same fact, and it goes wrong on
-- the day a Leader answers last week's abandoned conversation and this week's inside
-- the same seven days.
--
-- The `having` clause is `relationship_weeks`'s, repeated rather than shared, so the
-- two functions emit the same rows: a week a Pause withdrew the question from is not
-- a relationship-week here either, and *sent* on the Overview must count exactly
-- what the Stalled rule counts. See migration `20260906000100` for why the two
-- shapes are the two there are and why the upper bound is exclusive. Repeated
-- because the alternative -- reading `relationship_weeks` and joining back to it --
-- has no exact key to join on, since that function does not emit the sequence.
--
-- In `public` for the reason `relationship_weeks` is: this one is called by a
-- screen, and PostgREST exposes `public`. Security invoker, so the policies on
-- `checkin_sequence`, `checkin_prompt` and `concern` are what scope it to an
-- Admin's own Ministry -- and a Leader, who may read their own conversations but
-- no Concerns, would read `concern_open` as false for every week. No screen asks
-- it for a Leader; the Check-Ins tab is an Admin surface.
-- The one column of `concern` the join below reads that ticket 10's grant left
-- out: which prompt carried the words. An identifier and not the words -- the
-- grant on `detail` stays absent, and the only path to the text is still the
-- `concern.view` command. Column-level, like the grant it extends, so a
-- security-invoker function reading it as the signed-in Admin is answered by the
-- same policy that scopes every other read of this table.
grant select (prompt_id) on concern to authenticated;

create function public.relationship_week_answers(target_ministry_id uuid)
returns table (
  relationship_id uuid,
  sequence_id uuid,
  opened_at timestamptz,
  closed_at timestamptz,
  asked_at timestamptz,
  answered_at timestamptz,
  met boolean,
  satisfaction public.checkin_satisfaction,
  concern_open boolean
)
language sql
stable
set search_path = ''
as $$
  select covered.relationship_id,
         s.id,
         s.started_at,
         s.closed_at,
         min(p.asked_at) filter (where p.question = 'met'),
         max(p.answered_at),
         (array_agg(p.met order by p.step desc)
            filter (where p.question = 'met' and p.answered_at is not null))[1],
         (array_agg(p.satisfaction order by p.step desc)
            filter (where p.question = 'satisfaction' and p.answered_at is not null))[1],
         coalesce(
           bool_or(exists (
             select 1
               from public.concern c
              where c.prompt_id = p.id
                and c.resolved_at is null
           )),
           false
         )
    from public.checkin_sequence s
    cross join lateral unnest(s.covering) as covered(relationship_id)
    left join public.checkin_prompt p
      on p.sequence_id = s.id
     and p.relationship_id = covered.relationship_id
   where s.ministry_id = target_ministry_id
   group by covered.relationship_id, s.id, s.started_at, s.closed_at
  having max(p.answered_at) is not null
      or not (
           -- 1. The open question, taken back.
           exists (
             select 1
               from public.ministry_event e
              where e.ministry_id = target_ministry_id
                and e.subject_type = 'relationship'
                and e.type = 'checkin.question_withdrawn'
                and e.subject_id = covered.relationship_id
                and e.payload ->> 'reason' = 'paused'
                and e.payload ->> 'sequenceId' = s.id::text
           )
           -- 2. A turn nothing was ever asked about, because a Pause landed first.
           or (
             not exists (
               select 1
                 from public.checkin_prompt asked
                where asked.ministry_id = target_ministry_id
                  and asked.sequence_id = s.id
                  and asked.relationship_id = covered.relationship_id
             )
             and exists (
               select 1
                 from public.ministry_event e
                where e.ministry_id = target_ministry_id
                  and e.subject_type = 'relationship'
                  and e.type = 'relationship.paused'
                  and e.subject_id = covered.relationship_id
                  and e.occurred_at >= s.started_at
                  and (s.closed_at is null or e.occurred_at < s.closed_at)
             )
           )
         );
$$;

comment on function public.relationship_week_answers(uuid) is
  'One row per relationship per Check-In Sequence that covered it -- the rows '
  'relationship_weeks emits, one for one -- with what the Leader answered: when the '
  'meeting question went out, whether they met, how it went, and whether the '
  'Concern it raised is still open. Facts only: the rates are checkInRates''s and '
  'the week boundary is isoWeekOf''s. Carries no Concern text and cannot -- the '
  'authenticated role holds no grant on that column.';

revoke execute on function public.relationship_week_answers(uuid) from public, anon;
grant execute on function public.relationship_week_answers(uuid) to authenticated;
