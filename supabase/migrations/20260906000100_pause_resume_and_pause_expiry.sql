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
