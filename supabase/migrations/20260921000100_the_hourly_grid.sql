-- Ticket 31 -- The hourly grid
--
-- The availability grid becomes seven days by twelve one-hour slots, 8am to 8pm:
-- eighty-four slots, where there were thirty-five. Hours rather than named blocks,
-- because the design is hourly and the product owner decided it on 2026-09-01. See
-- docs/adr/0018-the-hourly-grid.md, which supersedes ADR-0006.
--
-- This is the migration ADR-0006 said would have no correct automatic answer, and
-- it does not have one. A Person who ticked "midday Tuesday" on the five-block grid
-- cannot be asked retrospectively which hour they meant, and a row that guessed for
-- them would be counted as an overlap they never claimed. So every row collected on
-- the old grid is deleted rather than translated. A Person whose only availability
-- predates this change reads as having none -- they sit in No Schedule Overlap
-- rather than in anybody's suggestion -- and the Roster's existing *send the Intake
-- link again* is how they are asked again. That cost is accepted and recorded in
-- the ADR.
--
-- What changes, in order:
--
--   1. The rows go.
--   2. `slot_hour` replaces `day_block`: the hour a slot starts, 24-hour and
--      zero-padded, declared in the order the grid is drawn in.
--   3. `intake_availability.block` becomes `intake_availability.hour`, and the
--      primary key and the overlap index follow it.
--   4. `relationship_availability`, the overlay's read, returns the hour. Its
--      return type changes, so it is dropped and recreated with the same body,
--      grants and comment rather than replaced.
--   5. `day_block` is dropped. Nothing names it any more.

-- ---------------------------------------------------------------------------
-- 1. The rows collected on the five-block grid
-- ---------------------------------------------------------------------------

-- Not `truncate`: a plain delete runs inside this migration's transaction like
-- everything else here, and the table is small enough that the difference is not
-- worth a statement that cannot be rolled back with the rest.
delete from intake_availability;

-- ---------------------------------------------------------------------------
-- 2. The hour a slot starts
-- ---------------------------------------------------------------------------

-- Zero-padded so the value sorts in the order of the day as text as well as as an
-- enum, and reads the same in a URL, a hidden input and this column: `monday:08`
-- is the key the form submits and the overlay slices by. The range is the grid's
-- -- the last slot starts at 7pm and ends at 8pm -- and a Ministry cannot widen it,
-- for the reason ADR-0006 gave and ADR-0018 keeps: a count of shared slots only
-- means something when both sides answered on the same grid.
create type slot_hour as enum
  ('08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19');

-- ---------------------------------------------------------------------------
-- 3. The column
-- ---------------------------------------------------------------------------

-- Dropped and added rather than altered in place: there is no cast from a block to
-- an hour, which is the whole reason step 1 exists. The table is empty by now, so
-- `not null` with no default is satisfied trivially.
alter table intake_availability drop constraint intake_availability_pkey;
drop index intake_availability_overlap_idx;

alter table intake_availability drop column block;
alter table intake_availability add column hour slot_hour not null;

alter table intake_availability
  add primary key (intake_submission_id, day, hour);

create index intake_availability_overlap_idx
  on intake_availability (ministry_id, day, hour);

comment on table intake_availability is
  'The one-hour slots one Intake submission selected, one row per slot. A '
  'submission with no rows here is a Person who shares time with nobody; the form '
  'refuses to submit one, but the database does not, because an empty availability '
  'is visible in the No Schedule Overlap section rather than silently wrong. Rows '
  'written before the grid became hourly were discarded rather than translated; '
  'see docs/adr/0018-the-hourly-grid.md.';

-- ---------------------------------------------------------------------------
-- 4. The overlay's read
-- ---------------------------------------------------------------------------

-- The body, the visibility rule, the grants and the comment are ticket 15's
-- unchanged. Only the third column is different, and Postgres will not change a
-- function's return type under `create or replace`, so it is dropped first. See
-- migration 20260910000100 for why this is a definer and why it reads the latest
-- submission per Person rather than the union of all of them.
drop function public.relationship_availability(uuid);

create function public.relationship_availability(target_relationship_id uuid)
returns table (person_id uuid, day public.weekday, hour public.slot_hour)
language sql
stable
security definer
set search_path = ''
as $$
  with permitted as (
    select r.id, r.ministry_id
      from public.relationship r
     where r.id = target_relationship_id
       and (app.is_admin_of(r.ministry_id) or app.leads_relationship(r.id))
  ),
  present as (
    select m.person_id
      from public.relationship_member m
      join permitted p on p.id = m.relationship_id
     where m.ended_at is null
  ),
  latest as (
    select distinct on (present.person_id)
           present.person_id,
           i.id as submission_id
      from present
      join public.intake_submission i on i.person_id = present.person_id
     order by present.person_id, i.submitted_at desc, i.created_at desc, i.id desc
  )
  select latest.person_id, a.day, a.hour
    from latest
    join public.intake_availability a on a.intake_submission_id = latest.submission_id;
$$;

comment on function public.relationship_availability(uuid) is
  'Everyone currently in one relationship, with the slots their most recent Intake '
  'submission selected. Readable by an Admin of the Ministry or by whoever leads '
  'the relationship, and by nobody else. Facts only: which slots overlap, which one '
  'to highlight and whether anything gathers everybody are drawOverlay''s, in the '
  'domain, where nothing about them needs a database to be proved.';

revoke execute on function public.relationship_availability(uuid) from public, anon;
grant execute on function public.relationship_availability(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The old enum
-- ---------------------------------------------------------------------------

-- Last, once no column and no function names it. Left in place it would be a type
-- somebody could add a value to, and a grid the domain does not know about.
drop type day_block;
