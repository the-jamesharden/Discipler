-- Ticket 12 -- Pause, resume, and pause expiry
--
-- A Pause has no table and no column. It is two events in `ministry_event` --
-- `relationship.paused` and `relationship.resumed` -- and what stands right now is
-- the later of them. That is the same shape acceptance, cancellation and every
-- other thing that happens to a relationship already has: history is the one source
-- everything derives from, and a stored `paused` flag would be a second answer
-- waiting to disagree with the record it was computed from.
--
-- It is also what the spec asks for by name: *membership changes, Material
-- Assignments, Pauses, and endings are all dated rather than mutated*. A pause taken
-- in March and lifted in April is two facts, and a boolean is neither of them.
--
-- So this migration adds no table. What it adds is the one read that cannot be
-- written as a plain select: *which relationships are paused right now, and for how
-- long*, which needs the latest of two event types per relationship. Everything the
-- follow-up item needs -- the `pause_expired` kind, its `periodWeeks` payload, its
-- check constraint and the index that dedupes it while it stands open -- was built
-- by tickets 07 and 10 and is used unchanged.

-- ---------------------------------------------------------------------------
-- A Pause carries a period somebody could have selected
-- ---------------------------------------------------------------------------

-- The five periods, said in the one place a Pause is actually written. The union in
-- `pause.ts` is a compile-time guard and the command boundary now checks the value
-- it was handed, but `ministry_event` takes any `jsonb` by design -- it holds facts
-- of every shape -- so neither of those stands between a hand-written `insert` and
-- a row nothing can read back.
--
-- And a row nothing can read back is expensive out of all proportion to itself.
-- `readStandingPause` throws on a period that is not one of the five, deliberately:
-- reading it as no pause at all puts a Leader who is on holiday back in the care
-- queue, and defaulting it to two weeks restarts somebody's review on a date nobody
-- chose. But both readers go through it -- the tick and the Care Needed view -- so
-- one drifted row takes down a whole Ministry's tick and its whole care queue. The
-- guard belongs on the way in, where it costs one row.
--
-- `jsonb` equality rather than a cast to integer: `'"soon"'::jsonb` compares false
-- here and would raise on `::integer`, and a check constraint that can itself throw
-- is a second failure mode rather than a guard against the first. The `coalesce`
-- is what closes the gap a missing key would otherwise open -- `payload ->
-- 'periodWeeks'` is SQL NULL when the key is absent, and a check constraint passes
-- on NULL, so a `relationship.paused` carrying no period at all would slip past.
alter table ministry_event
  add constraint ministry_event_pause_carries_a_selectable_period
  check (
    type <> 'relationship.paused'
    or coalesce(payload -> 'periodWeeks', 'null'::jsonb)
         in ('1'::jsonb, '2'::jsonb, '4'::jsonb, '8'::jsonb, '12'::jsonb)
  );

-- ---------------------------------------------------------------------------
-- The pause that stands right now
-- ---------------------------------------------------------------------------

-- One row per currently-paused relationship. Two facts and no third: when it was
-- taken and for how many weeks. **When it runs out is deliberately not here** --
-- that is `pausedAt` plus `periodWeeks`, computed at the command boundary against
-- the injected clock, like every other question about time in this codebase. A
-- third column would let a test that can prove a twelve-week pause in a
-- millisecond be replaced by one that cannot.
--
-- `distinct on` over both event types rather than a select of the paused ones: a
-- relationship paused in March and resumed in April has both events, and reading
-- only the pauses would report it as still paused for ever. The later event wins,
-- and the outer `where` keeps it only if that winner was a pause.
--
-- `recorded_at` breaks a tie on `occurred_at`, matching how the check-in snapshot
-- reads the same pair: two events at the same instant is a pause and a resume
-- applied by the same clock, and the one that landed second is the one that meant
-- it.
--
-- In `public` rather than `app` because a screen calls it as well as the command
-- connection: PostgREST exposes `public`, and the Care Needed view has to know that
-- a paused relationship is not in the care queue. Security invoker either way --
-- the policies on `ministry_event` are what scope it to the caller's own Ministry,
-- exactly as they would a direct select.
create function public.relationship_pauses(target_ministry_id uuid)
returns table (
  relationship_id uuid,
  paused_at timestamptz,
  period_weeks integer
)
language sql
stable
set search_path = ''
as $$
  select latest.relationship_id, latest.paused_at, latest.period_weeks
    from (
      select distinct on (e.subject_id)
             e.subject_id::uuid as relationship_id,
             e.type             as type,
             e.occurred_at      as paused_at,
             (e.payload ->> 'periodWeeks')::integer as period_weeks
        from public.ministry_event e
       where e.ministry_id = target_ministry_id
         and e.subject_type = 'relationship'
         and e.type in ('relationship.paused', 'relationship.resumed')
       order by e.subject_id, e.occurred_at desc, e.recorded_at desc
    ) latest
   where latest.type = 'relationship.paused'
$$;

comment on function public.relationship_pauses(uuid) is
  'The Pause standing on each relationship in this Ministry right now: when it was '
  'taken and for how many weeks. When it runs out is not here -- that is decided '
  'against the injected clock at the command boundary, never by now() in SQL.';

revoke execute on function public.relationship_pauses(uuid) from public, anon;
grant execute on function public.relationship_pauses(uuid) to authenticated;
grant execute on function public.relationship_pauses(uuid) to discipler_command;

-- The lookup this walks is by ministry, subject type and event type over a table
-- that only ever grows. `ministry_event_subject_idx` is on (ministry_id, type,
-- subject_id) and answers the acceptance-reminder lookup, which names one type;
-- this one names two and orders within each subject, so it wants the subject
-- leading and the instant trailing.
create index ministry_event_relationship_pause_idx
  on ministry_event (ministry_id, subject_id, occurred_at desc, recorded_at desc)
  where subject_type = 'relationship'
    and type in ('relationship.paused', 'relationship.resumed');

-- ---------------------------------------------------------------------------
-- A question a Pause withdrew is not a silence
-- ---------------------------------------------------------------------------

-- `relationship_weeks` emits one row per relationship per Check-In Sequence that
-- covered it, and a row with no reply is what ticket 10 counts as silence. A Pause
-- taken mid-conversation withdraws the question that was open -- no reminder goes
-- out, and the conversation moves on -- so the week it belonged to must stop being
-- one of those rows. Otherwise a Leader who stepped back on Tuesday comes back from
-- a fortnight away one week closer to `Stalled` for a question Discipler took back.
--
-- That is the spec's rule, stated for the Keyword Exchange and settled as general:
-- *a pause never accrues silence against itself*, and the withdrawn question
-- *never ages into Stalled*.
--
-- Only the unanswered ones. A Leader who answered about a relationship and was
-- paused an hour later said something true, and a Pause does not unsay it -- so the
-- `having` keeps every week a reply landed for, whatever happened afterwards.
--
-- **Only the question the Pause actually took back.** *A Pause taken during this
-- conversation* is too broad a test, and it erases silence that had already
-- accrued: a question asked on Monday, reminded on Tuesday and passed over on
-- Wednesday is a silence the Leader owns by the time an Admin pauses on Thursday,
-- and the spec says in as many words that *the pause does not answer the old ones*.
-- Dropping that week would be answering one.
--
-- So the test is the withdrawal itself, in two shapes, and there is no third:
--
--   1. **The question that was open.** The domain writes `checkin.question_withdrawn`
--      at the moment it takes a question back, naming the sequence it belonged to.
--      That event *is* the withdrawal -- reading it here is not an inference about
--      one, and a lapsed question has none because nothing withdrew it.
--
--   2. **A turn this conversation never reached.** A relationship paused before its
--      question came round is skipped in silence: nothing was asked of the Leader,
--      so there is no question to withdraw and no event to write, and no silence to
--      count either. Recognised by the absence of any prompt for it in the sequence,
--      which is the only shape that has one.
--
-- Shape 2 is still bounded to the conversation rather than to "is paused now". A
-- relationship paused in March and resumed in April must not have its March silence
-- erased retroactively when it is paused again in June; the pause has to have fallen
-- inside the very sequence whose week is being dropped. A sequence still open takes
-- every pause since it started, because it has not finished asking yet.
--
-- The upper bound is exclusive, and that is not a detail. `closed_at` is the
-- instant a conversation stopped being the open one, and a new week closes last
-- week's sequence and opens this one's at the very same instant -- so a Pause taken
-- then belongs to the week that is starting and not to the week that just ended.
-- Written inclusive, an Admin pausing at the cadence hour would erase the silence
-- of the week before the one they paused.
create or replace function public.relationship_weeks(target_ministry_id uuid)
returns table (
  relationship_id uuid,
  opened_at timestamptz,
  closed_at timestamptz,
  answered_at timestamptz,
  reported_not_meeting boolean
)
language sql
stable
set search_path = ''
as $$
  select covered.relationship_id,
         s.started_at,
         s.closed_at,
         max(p.answered_at),
         coalesce(bool_or(p.question = 'met' and p.met is false), false)
    from public.checkin_sequence s
    cross join lateral unnest(s.covering) as covered(relationship_id)
    left join public.checkin_prompt p
      on p.sequence_id = s.id
     and p.relationship_id = covered.relationship_id
     and p.answered_at is not null
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

comment on function public.relationship_weeks(uuid) is
  'One row per relationship per Check-In Sequence that covered it, minus the weeks '
  'a Pause withdrew the question from. Facts only: the counting is '
  'deriveRelationshipState''s, and no rule about how many weeks make a stall is here.';
