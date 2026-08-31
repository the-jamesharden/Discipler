-- Ticket 14 -- Material Assignment
--
-- The Week-by-Week History has to be able to say which Material a relationship was
-- working through in a given week, and it has to be able to say it in two years'
-- time. That is the whole reason this lands before anything that reads it: the
-- interface an Admin assigns through is deferred from V1 and the data is not,
-- because a week whose Material nobody recorded is a week nothing can recover, and
-- getting it silently wrong invalidates every report built on top of it later.
--
-- Two shapes. A Material is a resource the Ministry holds -- a title, some text it
-- typed, a PDF it uploaded, or both. A Material Assignment is a *period*: this
-- relationship worked through that Material from here until there. Assigned to the
-- relationship and never to a Person, because a Leader in two relationships may be
-- working through two different things.
--
-- The invariant the rest of this file exists to hold is that the periods on one
-- relationship never overlap and never leave gaps -- which includes the time before
-- a Ministry has assigned anything at all. That stretch is a real period with a
-- null Material, opened at acceptance. A report asking what was in use that week
-- then gets an answer saying *none*, which is a fact; no row at all is
-- indistinguishable from a defect.

-- ---------------------------------------------------------------------------
-- What a Ministry holds
-- ---------------------------------------------------------------------------

-- The Ministry's own list, like `discipleship_goal` beside it and for the same
-- reason: what a church works through is theirs, and a Discipler-wide catalogue
-- would be a product opinion about somebody else's discipleship.
--
-- A row rather than free text on the assignment. *How many relationships worked
-- through Romans* is a question asked in counts, and free text cannot answer it --
-- two spellings are two answers, and no amount of later care repairs a pilot's
-- worth of prose. The same argument ticket 13 made for `ended_outcome` standing
-- beside its free-text reason.
create table material (
  id           uuid primary key default gen_random_uuid(),
  ministry_id  uuid not null references ministry (id) on delete cascade,
  title        text not null check (length(btrim(title)) > 0),

  -- What the Material actually is. Typed content, an uploaded PDF, or both: a
  -- ministry writing its own six-week study and one handing out a published manual
  -- are the same thing to everything downstream, and the difference is which of
  -- these two columns is filled in.
  body         text check (body is null or length(btrim(body)) > 0),
  -- The object in the `material` storage bucket, keyed `<ministry_id>/<uuid>.pdf`.
  -- A path rather than the bytes: Postgres is not a file server, and the storage
  -- policies below are what keep one Ministry's uploads out of another's reach.
  pdf_path     text check (pdf_path is null or length(btrim(pdf_path)) > 0),
  -- What the Admin's file was called, kept so a download can be handed back under
  -- the name it arrived with. The path is a uuid and says nothing a human wants.
  pdf_filename text check (pdf_filename is null or length(btrim(pdf_filename)) > 0),

  created_at   timestamptz not null default now(),

  -- One Ministry does not hold the same title twice. Two rows a screen cannot tell
  -- apart are two rows an Admin assigns at random.
  unique (ministry_id, title),

  -- The target of `material_assignment`'s composite foreign key, which is what
  -- keeps an assignment and the Material it names inside one Ministry declaratively.
  constraint material_id_ministry_uniq unique (id, ministry_id),

  -- A Material with neither text nor a file is a title pointing at nothing. It
  -- would be assignable, it would attribute weeks, and a Leader opening it would
  -- find an empty page.
  constraint material_carries_something
    check (body is not null or pdf_path is not null),

  -- Both halves of the upload, or neither. A path with no filename cannot be handed
  -- back under the name it arrived with, and a filename with no path names nothing.
  constraint material_pdf_is_whole
    check ((pdf_path is null) = (pdf_filename is null))
);

create index material_ministry_idx on material (ministry_id, title);

comment on table material is
  'The discipleship resources one Ministry holds: a title, typed content, an '
  'uploaded PDF, or both. Assigned to relationships by material_assignment, never '
  'to a Person.';

-- ---------------------------------------------------------------------------
-- Where the PDFs live
-- ---------------------------------------------------------------------------

-- Private. Nothing in Discipler is world-readable, and a public bucket would put a
-- Ministry's material behind a URL that leaks by being forwarded.
--
-- The first path segment is the Ministry, which is what the policies below read.
-- Storage has no `ministry_id` column to police, so the key *is* the tenant claim:
-- `material/<ministry_id>/<uuid>.pdf`.
insert into storage.buckets (id, name, public)
values ('material', 'material', false)
on conflict (id) do nothing;

-- Ministry isolation, said again in the one place row-level security on `material`
-- cannot reach. An Admin of one Ministry reading, writing or deleting another's
-- uploads is refused here exactly as it is on every table.
--
-- The cast lives in a function rather than in the policies, and that is not tidying.
-- A key whose first segment is not a uuid -- `../x`, or anything somebody uploads by
-- hand -- would fail the cast as a Postgres error mid-policy rather than as a denial,
-- and `and` does not promise to evaluate left to right, so a guard written beside the
-- cast is not a guard. Here the answer to a key that names no Ministry is plainly
-- false.
create function app.is_admin_of_material_folder(object_name text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  folder text := (storage.foldername(object_name))[1];
begin
  if folder is null or folder !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  then
    return false;
  end if;

  return app.is_admin_of(folder::uuid);
end;
$$;

comment on function app.is_admin_of_material_folder(text) is
  'Whether the signed-in user is an Admin of the Ministry a material object key '
  'names. False for a key that names no Ministry, rather than an error.';

grant execute on function app.is_admin_of_material_folder(text) to authenticated;

-- Admin only, and only their own Ministry.
--
-- All four verbs, including the writes, even though the route that uploads a file is
-- deferred with the assignment interface. That is not the same thing as the Leader
-- policy withheld below, and the difference is worth stating because the two look
-- alike. A bucket with no policies is a bucket nobody may touch at all, so these are
-- what make the store usable rather than a permission handed to a screen that does
-- not exist -- and the part that must not be retrofitted is exactly the isolation:
-- a bucket that spends a pilot without it has objects nothing can afterwards prove
-- belonged to one Ministry. Withholding them would leave the first upload route to
-- write its own, which is how a tenant boundary ends up stated twice and differently.
--
-- The Leader case is the opposite shape: it widens *who* may read, and nothing in
-- the product shows a Leader a Material yet. Ticket 15 builds that surface, and a
-- policy written ahead of it would be a grant waiting for a screen.
create policy material_object_read_own_ministry on storage.objects
  for select to authenticated
  using (bucket_id = 'material' and app.is_admin_of_material_folder(name));

create policy material_object_write_own_ministry on storage.objects
  for insert to authenticated
  with check (bucket_id = 'material' and app.is_admin_of_material_folder(name));

create policy material_object_replace_own_ministry on storage.objects
  for update to authenticated
  using (bucket_id = 'material' and app.is_admin_of_material_folder(name))
  with check (bucket_id = 'material' and app.is_admin_of_material_folder(name));

create policy material_object_delete_own_ministry on storage.objects
  for delete to authenticated
  using (bucket_id = 'material' and app.is_admin_of_material_folder(name));

-- ---------------------------------------------------------------------------
-- The periods
-- ---------------------------------------------------------------------------

-- One row per stretch of time one relationship spent on one Material. A period and
-- not a column: *what are they working through* is answerable from a column, and
-- *what were they working through in March* is not, and only the second question
-- survives the semester.
create table material_assignment (
  id              uuid primary key default gen_random_uuid(),
  ministry_id     uuid not null references ministry (id) on delete cascade,
  relationship_id uuid not null,

  -- Null on exactly one period per relationship: the one acceptance opens, before
  -- the Ministry has assigned anything. There is no un-assign, so nothing else ever
  -- writes a null here -- one Material at a time means the history moves from one
  -- to the next.
  material_id     uuid,

  started_at      timestamptz not null,
  -- Null on the period still running. There is at most one per relationship, which
  -- the partial unique index below is what says.
  ended_at        timestamptz,

  -- The Admin who decided. Null on the opening period, which no Admin performed --
  -- acceptance opened it -- and null again once somebody leaves the Ministry, for
  -- the reason `concern.resolved_by` is: the durable record of who acted is the
  -- `relationship.material_assigned` event in `ministry_event`, which is
  -- append-only and outlives the membership.
  assigned_by     uuid,

  constraint material_assignment_relationship_fk
    foreign key (relationship_id, ministry_id) references relationship (id, ministry_id)
    on delete cascade,

  -- The composite key is the point of the shape: an assignment and the Material it
  -- names belong to one Ministry, and no application code has to remember to check.
  --
  -- `on delete restrict`, deliberately, where `discipleship_goal` blanks the
  -- submissions that chose it. A Discipleship Goal is somebody's stated preference
  -- and losing it costs a ranking input; a Material Assignment is the history this
  -- ticket exists to keep, and blanking it would turn a recorded period into the
  -- opening period -- the one shape that means *no Material was in use*. Deleting a
  -- Material that a relationship has worked through has to be a decision somebody
  -- makes on purpose, and today it is refused.
  constraint material_assignment_material_fk
    foreign key (material_id, ministry_id) references material (id, ministry_id)
    on delete restrict,

  -- Keyed to their membership of *this* Ministry rather than to an account that
  -- merely exists: holding a login is not standing to decide what somebody else's
  -- relationship works through.
  constraint material_assignment_assigned_by_fk
    foreign key (ministry_id, assigned_by) references ministry_member (ministry_id, user_id)
    on delete set null (assigned_by),

  -- A period that ends before it starts is not a period. Equality is permitted and
  -- is not an accident: assigning a Material at the very instant of acceptance
  -- closes the opening period at its own start, and a zero-length period covers no
  -- instant, so it leaves neither an overlap nor a gap.
  constraint material_assignment_ends_after_it_starts
    check (ended_at is null or ended_at >= started_at)
);

-- One Material at a time, said as an index rather than as a promise. Two open
-- periods on one relationship are two answers to *what are they working through*,
-- and every reader would take whichever came back first.
create unique index material_assignment_one_open_period
  on material_assignment (relationship_id)
  where ended_at is null;

-- And exactly one period with no Material, which is a different statement. A null
-- `material_id` means *nothing was assigned yet*, and there is only ever one such
-- stretch: the one before the Ministry chose anything. A second one written later
-- would be an un-assignment -- a shape no command produces and nothing asked for --
-- and it would read back as *no Material was in use* for weeks that had one.
--
-- An index rather than a clause in the trigger below, because it is a statement
-- about which rows exist and not about how they are ordered. The two together are
-- what make the opening period unambiguous without any row having to be counted
-- into first place.
create unique index material_assignment_one_opening_period
  on material_assignment (relationship_id)
  where material_id is null;

create index material_assignment_relationship_idx
  on material_assignment (ministry_id, relationship_id, started_at);

comment on table material_assignment is
  'One period a relationship spent on one Material. A null material_id marks the '
  'period acceptance opens, before the Ministry has assigned anything -- a row '
  'saying "none", never the absence of a row.';

-- ---------------------------------------------------------------------------
-- Never overlap, never leave gaps
-- ---------------------------------------------------------------------------

-- The acceptance criterion, stated as a constraint rather than as a rule the write
-- path keeps. The write path is `app.assign_material` below and it is careful; this
-- is what stays true of the migration, the repair script and the psql session that
-- are not.
--
-- Contiguity is the whole test, and it gives both properties at once. Order the
-- periods by when they started; each after the first must begin at the very instant
-- the one before it ended. Gaps are then impossible by construction, and so are
-- overlaps -- a period beginning before its predecessor ended would not begin at
-- the instant it ended. Cheaper and more exact than an exclusion constraint, which
-- would catch the overlap and say nothing about the hole.
--
-- Two more things fall out of the same ordering:
--
--   * The open period must be last. Anything after a period with no end would have
--     to begin at an instant that does not exist.
--
--   * The history opens with the period carrying no Material, so the first row is
--     that row. The index above is what makes it a single row to speak of.
--
-- The second is why the ordering has a third key. Assigning a Material at the instant
-- of acceptance is permitted and produces a zero-length period, so two rows can share
-- both a start and an end -- and ordered by date alone one of them lands first
-- arbitrarily, which refuses a legal history on a coin toss. The period with no
-- Material sorts ahead of anything sharing its instant, which is not a tiebreak
-- invented to settle that coin toss but the rule itself: nothing precedes the period
-- the history opens with. Rows still tied after it are interchangeable -- same start,
-- same end, both carrying a Material -- and every test here reads the same either way.
--
-- A constraint trigger, `initially deferred`, for the reason ticket 13's is: the
-- invariant is true between statements and not within them. `app.assign_material`
-- closes the running period and opens its successor in two statements, and an
-- immediate trigger would refuse the transaction halfway through its own correct
-- work. Deferred, it is checked once at commit, which is the only moment the
-- question means anything.
create function app.reject_broken_material_history()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- `new` is unassigned on a delete, so which record to read is decided by the
  -- operation rather than by coalescing a field off a record that is not there.
  subject uuid := case when tg_op = 'DELETE' then old.relationship_id
                       else new.relationship_id end;
begin
  if exists (
    select 1
      from (
        select a.material_id,
               a.started_at,
               a.ended_at,
               lag(a.ended_at) over w  as ends_before_it,
               row_number()    over w  as position,
               count(*) over (partition by a.relationship_id) as periods
          from public.material_assignment a
         where a.relationship_id = subject
        window w as (
          partition by a.relationship_id
              order by a.started_at,
                       a.ended_at nulls last,
                       (a.material_id is not null)
        )
      ) period
     where
       -- A gap, or an overlap. One test, because contiguity refuses both.
       (period.position > 1 and period.ends_before_it is distinct from period.started_at)
       -- A period with an open end that something else follows.
       or (period.ended_at is null and period.position <> period.periods)
       -- A history that starts with a Material rather than with the period that
       -- has none.
       or (period.position = 1 and period.material_id is not null)
  ) then
    raise exception
      'the Material history of relationship % would have a gap, an overlap, or no opening period',
      subject
      using errcode = 'check_violation',
            constraint = 'material_periods_never_overlap_and_never_leave_gaps';
  end if;

  return null;
end;
$$;

create constraint trigger material_assignment_leaves_no_gap
  after insert or update or delete on material_assignment
  deferrable initially deferred
  for each row
  execute function app.reject_broken_material_history();

-- ---------------------------------------------------------------------------
-- One function assigns a Material
-- ---------------------------------------------------------------------------

-- Closing the running period and opening its successor are not two acts. They are
-- one instant written twice, and anything that could do half of it would put a hole
-- in a history nobody can reconstruct -- so both writers go through here: the
-- acceptance that opens the period with no Material, and the Admin who assigns one.
--
-- They differ in exactly one thing, whether there is a Material, and that is
-- `target_material_id`. A null opens the history and refuses to run twice; a real
-- one requires the history to have been opened already.
--
-- The relationship row is taken `for update` before anything is decided, exactly as
-- `app.end_relationship` takes it. The command boundary already decided from a
-- snapshot read earlier in the transaction; this is the database having the final
-- say, which is what refuses an assignment racing an ending.
--
-- SECURITY INVOKER, deliberately. The policies on `relationship` and
-- `material_assignment` scope this to the Ministry the connection has declared it
-- is acting for, exactly as they would a direct insert.
--
-- Returns a refusal code, or null when the period opened. A code rather than an
-- exception because these are ordinary outcomes an Admin sees as a sentence on a
-- screen, and the caller maps them to the refusal its own act carries.
create function app.assign_material(
  target_relationship_id uuid,
  target_material_id     uuid,
  at                     timestamptz,
  actor                  uuid
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  standing public.relationship;
  opened   boolean;
begin
  select * into standing
    from public.relationship r
   where r.id = target_relationship_id
     for update;

  -- Not found is also what another Ministry's relationship looks like from here,
  -- because the policy shows this connection neither.
  if not found then return 'relationship_not_found'; end if;

  -- Terminal. A relationship that is over has no further week to attribute, so a
  -- period opened after its ending is one no report could ever ask about.
  if standing.ended_at is not null then return 'relationship_ended'; end if;

  select exists (
    select 1 from public.material_assignment a
     where a.relationship_id = target_relationship_id
  ) into opened;

  if target_material_id is null then
    -- The opening period, and acceptance is the only thing that writes one. A
    -- second would overlap the first, and there is no un-assign for it to be.
    if opened then return 'material_history_already_open'; end if;
  else
    -- The period with no Material runs from acceptance, so a relationship nobody
    -- has accepted has nothing here to close -- and an assignment dated before that
    -- period began would open the very gap it exists to prevent.
    if standing.accepted_at is null then return 'relationship_not_accepted'; end if;
    if not opened then return 'material_history_not_open'; end if;
    if at < standing.accepted_at then return 'assignment_precedes_acceptance'; end if;
  end if;

  -- The close and the open, at one instant. A relationship with no running period
  -- updates nothing here, which is the opening period's case.
  update public.material_assignment a
     set ended_at = at
   where a.relationship_id = target_relationship_id
     and a.ended_at is null;

  insert into public.material_assignment
    (ministry_id, relationship_id, material_id, started_at, assigned_by)
  values
    (standing.ministry_id, target_relationship_id, target_material_id, at, actor);

  return null;
end;
$$;

comment on function app.assign_material(uuid, uuid, timestamptz, uuid) is
  'The only write path that opens a Material period. Closes the running period and '
  'opens its successor at the same instant, in one transaction; returns a refusal '
  'code, or null when it opened. A null target_material_id opens the period '
  'acceptance opens, and may be used once.';

revoke execute on function app.assign_material(uuid, uuid, timestamptz, uuid) from public;
grant execute on function app.assign_material(uuid, uuid, timestamptz, uuid)
  to discipler_command;

-- ---------------------------------------------------------------------------
-- The relationships that were already running
-- ---------------------------------------------------------------------------

-- Every relationship accepted before this migration has weeks in its history and no
-- period to attribute them to. Backfilled rather than left empty, because the whole
-- justification of this ticket is that the record has to be complete from the first
-- week -- and a relationship whose history begins the day somebody first assigns
-- something is exactly the silent hole it exists to prevent.
--
-- At `accepted_at`, which is where the opening period starts for every relationship
-- written after this. One with no Material, left open: nothing has been assigned to
-- these, and that is a fact rather than an omission.
--
-- Relationships nobody accepted are deliberately absent. No check-in week exists
-- before acceptance, so there is nothing for a period to cover, and one opened here
-- would be a row about time no meeting could have been reported in.
insert into material_assignment (ministry_id, relationship_id, material_id, started_at)
select r.ministry_id, r.id, null, r.accepted_at
  from relationship r
 where r.accepted_at is not null;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table material            enable row level security;
alter table material_assignment enable row level security;
alter table material            force  row level security;
alter table material_assignment force  row level security;

revoke all on material, material_assignment from anon, authenticated, service_role;

grant select on material, material_assignment to authenticated;

-- The service role seeds fixtures and repairs, as it does on every other table
-- here. It bypasses row-level security by design and is never what a screen or a
-- command runs as.
grant select, insert, update, delete on material, material_assignment to service_role;

-- An Admin sees their own Ministry's Materials and what they were assigned to. A
-- Leader does not, yet: ticket 15 builds the surface that shows a Leader the
-- Material on their own relationship, and a policy written wider than the product
-- is a grant waiting for a screen.
create policy material_read_own_ministry on material
  for select to authenticated
  using (app.is_admin_of(ministry_id));

create policy material_assignment_read_own_ministry on material_assignment
  for select to authenticated
  using (app.is_admin_of(ministry_id));

-- No delete for the command connection. A period is a dated fact, and the history
-- moves on by opening the next one rather than by removing the last.
grant select on material to discipler_command;
grant select, insert, update on material_assignment to discipler_command;

create policy material_command_read on material
  for select to discipler_command
  using (ministry_id = app.command_ministry_id());

create policy material_assignment_command on material_assignment
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

-- ---------------------------------------------------------------------------
-- What a report reads
-- ---------------------------------------------------------------------------

-- Facts only, exactly as `relationship_weeks` beside it is facts only. Which period
-- a week belongs to is a rule about time, and every one of those is decided by
-- `materialForWeek` in the domain, where a Material changing mid-week is a test
-- that runs in a millisecond rather than a fixture and a fortnight.
--
-- In `public` rather than `app` for the reason `relationship_weeks` is: this one is
-- called by a screen, and PostgREST exposes `public`. Security invoker either way --
-- the policies above are what scope it to an Admin's own Ministry.
create function public.material_periods(target_ministry_id uuid)
returns table (
  relationship_id uuid,
  material_id uuid,
  title text,
  started_at timestamptz,
  ended_at timestamptz
)
language sql
stable
set search_path = ''
as $$
  select a.relationship_id, a.material_id, m.title, a.started_at, a.ended_at
    from public.material_assignment a
    left join public.material m
      on m.id = a.material_id
   where a.ministry_id = target_ministry_id
   -- Ties broken as the contiguity trigger breaks them, so a relationship that was
   -- assigned something at the instant of acceptance reads back opening period first
   -- rather than in whichever order the scan happened to produce.
   order by a.relationship_id,
            a.started_at,
            a.ended_at nulls last,
            (a.material_id is not null);
$$;

comment on function public.material_periods(uuid) is
  'Every Material period in one Ministry, gapless and non-overlapping per '
  'relationship, with the Material''s title alongside. A null material_id and title '
  'is the period before anything was assigned.';

-- Deliberately granted to nobody signed in, yet. Nothing in the product reads a
-- Material: the Admin surface that assigns one is deferred with this ticket, and the
-- Leader surface that shows one is ticket 15's. Granting `authenticated` now would be
-- the grant-waiting-for-a-screen this file refuses two sections above, and the screen
-- that first needs it is the right place to say who may read it.
--
-- The function itself is the model's read shape and belongs with the model, so that
-- whatever asks first finds the periods already emitted gapless and in order rather
-- than writing that query again.
revoke execute on function public.material_periods(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The instant a week is attributed by
-- ---------------------------------------------------------------------------

-- `relationship_weeks` already emits the last reply that landed for a
-- relationship-week, which is what ticket 10 counts silence by. Attribution needs
-- the *first*: a check-in is several messages -- did you meet, how was it -- and the
-- moment the Leader started reporting is the moment that names the meeting they are
-- reporting on. A Material changed between two of those replies must not move the
-- week, because a week is never split across two Materials.
--
-- Added here rather than computed by the caller, because it is the same fact as the
-- column beside it and belongs in the same read. Dropped and recreated because the
-- returned row type is changing; nothing but the readers depends on it, and they
-- select by name.
drop function public.relationship_weeks(uuid);

create function public.relationship_weeks(target_ministry_id uuid)
returns table (
  relationship_id uuid,
  opened_at timestamptz,
  closed_at timestamptz,
  answered_at timestamptz,
  first_answered_at timestamptz,
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
         min(p.answered_at),
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
  'deriveRelationshipState''s, the Material attribution is materialForWeek''s, and '
  'no rule about either is here.';

revoke execute on function public.relationship_weeks(uuid) from public, anon;
grant execute on function public.relationship_weeks(uuid) to authenticated;
