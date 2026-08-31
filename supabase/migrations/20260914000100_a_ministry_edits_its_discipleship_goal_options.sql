-- ---------------------------------------------------------------------------
-- An Admin edits the Discipleship Goal options
-- ---------------------------------------------------------------------------
--
-- Ticket 03 landed the table and seeded every new Ministry with a starting list,
-- so the Intake form renders. Nothing yet let an Admin change it. The writes need
-- no new grants -- `discipler_command` has held INSERT, UPDATE and DELETE on
-- `discipleship_goal` since that migration -- so two things land here and neither
-- of them is a permission.
--
-- The first is the floor. A Ministry with no options cannot serve an Intake form
-- at all, and the command boundary refusing to empty the list is not enough on its
-- own: pilot settings get written by SQL as often as by a button, and a rule that
-- only a screen enforces is a rule that is off wherever the screen is not.
--
-- The second is the count. Removing an option blanks it on the submissions that
-- chose it -- `on delete set null`, which is what makes the loss real -- so the
-- Admin has to be told how many people it costs *before* it happens. Both the
-- settings surface, warning them, and the command boundary, writing the number
-- into history, need that count; one definition of it means the number an Admin
-- was warned with and the number history records cannot disagree.

-- ---------------------------------------------------------------------------
-- A Ministry always has at least one option
-- ---------------------------------------------------------------------------

create function app.ministry_keeps_a_discipleship_goal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A Ministry being deleted takes its options with it, and that cascade is not an
  -- edit: there is no form left to serve and nobody left to serve it to. The parent
  -- row is already gone by the time this fires, which is what tells the two apart.
  if not exists (select 1 from public.ministry where id = old.ministry_id) then
    return old;
  end if;

  if not exists (
    select 1
      from public.discipleship_goal
     where ministry_id = old.ministry_id
       and id <> old.id
  ) then
    raise exception
      'A Ministry cannot be left with no Discipleship Goal options'
      using errcode = 'restrict_violation';
  end if;

  return old;
end;
$$;

comment on function app.ministry_keeps_a_discipleship_goal() is
  'Refuses the delete that would empty a Ministry''s Discipleship Goal list, '
  'because Intake requires a selection and could not then be served. Lets the '
  'cascade from deleting the Ministry itself through: the options are going with '
  'a form nobody will open again.';

-- Row-level rather than statement-level, so a statement deleting all but one is
-- permitted and one deleting every row is refused on its last: each row's check
-- sees the deletes that have already been applied.
create trigger discipleship_goal_never_empties_a_ministry
  before delete on discipleship_goal
  for each row execute function app.ministry_keeps_a_discipleship_goal();

-- ---------------------------------------------------------------------------
-- The list, with what each option would cost to remove
-- ---------------------------------------------------------------------------

-- People, not submissions. Intake is append-only and may be re-submitted, so a
-- Person who changed their answer points at one option and used to point at
-- another -- and what an Admin needs warning about is the people whose stated goal
-- would go, not the rows that would be blanked.
--
-- The same tiebreak every other latest-submission read in this schema uses, down
-- to the last term: `app.current_gender`, `public.relationship_availability` and
-- the Leader Dashboard all order by `submitted_at desc, created_at desc, id desc`.
-- Two submissions can share both timestamps, and without the id the tiebreak is the
-- planner's -- so this count and the answer that actually stands could disagree.
--
-- Answers to two callers, which is deliberate and is the whole reason this is one
-- function. The signed-in Admin reads it to be warned; the command boundary reads
-- it on the trusted connection to write the number into history. A second query
-- somewhere would be a second definition of *how many people chose this*, and the
-- two would eventually give an Admin one number and the record another.
create function public.discipleship_goal_options(target_ministry_id uuid)
returns table (
  id uuid,
  label text,
  -- `list_position` rather than `position`: POSITION is a keyword Postgres will not
  -- take as a bare output column name here, and quoting it would leave every caller
  -- having to remember why.
  list_position smallint,
  chosen_by bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with standing as (
    select distinct on (i.person_id)
           i.person_id,
           i.discipleship_goal_id
      from public.intake_submission i
     where i.ministry_id = target_ministry_id
     order by i.person_id, i.submitted_at desc, i.created_at desc, i.id desc
  )
  select g.id,
         g.label,
         g.position,
         (select count(*) from standing s where s.discipleship_goal_id = g.id)
    from public.discipleship_goal g
   where g.ministry_id = target_ministry_id
     and (
       app.is_admin_of(target_ministry_id)
       or app.command_ministry_id() = target_ministry_id
     )
   order by g.position;
$$;

comment on function public.discipleship_goal_options(uuid) is
  'One Ministry''s Discipleship Goal options in the order the Intake form shows '
  'them, each with how many people''s current Intake answer points at it. The '
  'count is what an Admin is warned with before a removal and what history records '
  'afterwards -- one definition, so the two cannot disagree.';

-- Admin-only for a session, because the count is derived from `intake_submission`
-- and what a Person said at Intake is the pastor's to read. A Leader who is a
-- member of the Ministry may read the option labels off the table directly; they
-- may not read who chose what.
revoke execute on function public.discipleship_goal_options(uuid) from public, anon;
grant execute on function public.discipleship_goal_options(uuid)
  to authenticated, discipler_command;
