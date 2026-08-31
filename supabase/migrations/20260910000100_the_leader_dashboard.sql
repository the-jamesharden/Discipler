-- Ticket 15 -- The Leader Dashboard
--
-- The Leader surface shows three things and nothing else: the availability overlay,
-- the Material assigned to the relationship, and the name and phone number of
-- everyone in it. Every widening below is one of those three, and none of them is
-- wider than the screen that needs it.
--
-- The list itself needs nothing new. `app.leads_relationship` and the policies on
-- `relationship` and `relationship_member` have answered *which relationships do I
-- lead* since ticket 06, off a live query for open leader memberships rather than
-- off `ministry_member.tier` -- which is what lets an Admin who leads reach both
-- surfaces holding one row that says `admin`, and what makes a Leader's last
-- relationship ending remove the surface without anybody revoking anything.
--
-- Four things do change:
--
--   1. Availability becomes readable for the people in a relationship the caller
--      leads. It was Admin-only, and the overlay is the whole point of the screen.
--   2. The Material on a relationship the caller leads becomes readable -- the open
--      period only, which is exactly what the screen shows.
--   3. `person.phone` stops being readable unmediated by anybody signed in. This is
--      the gap ticket 02 recorded and migration `20260905000100` deferred here.
--   4. A Leader can see that their own relationship is Paused.
--
-- What is deliberately not widened: `ministry_event`, `outbound_message`,
-- `checkin_sequence`, `checkin_prompt` and `concern` stay Admin-only. The Leader
-- Dashboard carries no message history and no analytics, and the derived
-- Relationship State -- Healthy, Stalled, Needs Care -- is the Admin's reading of
-- how a relationship is doing, shown on Care Needed and not here. `Paused` is not
-- one of those: it is the Leader's own act, and it is the reason their weekly
-- check-ins have stopped arriving, so the Leader's list says so.

-- ---------------------------------------------------------------------------
-- 1. The availability overlay
-- ---------------------------------------------------------------------------

-- Everyone's Intake availability for one relationship, on one grid.
--
-- A function rather than a widened policy on `intake_availability`, because the
-- rows are keyed to a submission and the question is about a Person: a policy would
-- have to reach `intake_submission` to find out whose slots these are, and that
-- table is Admin-only, so the subquery would answer *no rows* for the Leader it was
-- written for. Reaching through a definer is the same move `contact_to_share`
-- makes, and for the same reason.
--
-- SECURITY DEFINER, so the visibility rule is stated here rather than inherited: an
-- Admin of the Ministry the relationship belongs to, or whoever leads it. A
-- Participant with an account reaches nothing through this, exactly as their
-- membership grants them nothing anywhere else.
--
-- The *latest* submission per Person and not the union of all of them. An Admin can
-- send somebody a tokenized link that reopens their Intake form, so a second
-- submission is an ordinary state -- and unioning the two would leave a Person
-- permanently available at a time they went back and unticked.
create function public.relationship_availability(target_relationship_id uuid)
returns table (person_id uuid, day public.weekday, block public.day_block)
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
  select latest.person_id, a.day, a.block
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
-- 2. The Material on a relationship the caller leads
-- ---------------------------------------------------------------------------

-- The open period only, on both tables and in the storage policy below.
--
-- Ticket 14 left this grant unwritten on purpose -- "a policy written wider than the
-- product is a grant waiting for a screen" -- and the screen it was waiting for
-- shows one Material: the one the relationship is working through now. A Leader
-- reading the periods that closed before it would be reading the relationship's
-- history, which this surface does not carry. So access follows the assignment: it
-- arrives when an Admin assigns and it leaves when they assign something else.
create policy material_assignment_read_led on material_assignment
  for select to authenticated
  using (ended_at is null and app.leads_relationship(relationship_id));

-- The Material behind that period. A definer function for the same reason as
-- above: the policy on `material` cannot consult `material_assignment` without
-- being answered by that table's own policy first.
create function app.leads_relationship_using_material(target_material_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.material_assignment a
     where a.material_id = target_material_id
       and a.ended_at is null
       and app.leads_relationship(a.relationship_id)
  );
$$;

comment on function app.leads_relationship_using_material(uuid) is
  'Whether the signed-in user leads a relationship currently working through this '
  'Material. The open period only: a Leader''s sight of a Material ends when the '
  'Admin assigns the next one.';

revoke execute on function app.leads_relationship_using_material(uuid) from public;
grant execute on function app.leads_relationship_using_material(uuid) to authenticated;

create policy material_read_led on material
  for select to authenticated
  using (app.leads_relationship_using_material(id));

-- The uploaded PDF, in the storage bucket where row-level security cannot reach.
--
-- Keyed on `pdf_path` rather than on the folder, which is the difference from
-- `app.is_admin_of_material_folder` beside it. An Admin may read everything under
-- their Ministry's folder because the whole folder is theirs; a Leader may read one
-- object, because one Material is what they were assigned. There is no cast to
-- guard here for the same reason: the name is matched against a stored path, so a
-- key naming nothing matches nothing.
create function app.leads_material_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.material m
      join public.material_assignment a on a.material_id = m.id
     where m.pdf_path = object_name
       and a.ended_at is null
       and app.leads_relationship(a.relationship_id)
  );
$$;

comment on function app.leads_material_object(text) is
  'Whether the signed-in user leads a relationship currently working through the '
  'Material this storage object holds the PDF for.';

revoke execute on function app.leads_material_object(text) from public;
grant execute on function app.leads_material_object(text) to authenticated;

-- Select only. A Leader reads what they were given and writes nothing: uploading,
-- replacing and deleting stay with the Admin who owns the Ministry's list.
create policy material_object_read_led on storage.objects
  for select to authenticated
  using (bucket_id = 'material' and app.leads_material_object(name));

-- Ticket 14 granted this to nobody signed in and named this ticket as the one that
-- would decide. It is granted now, and the policies above are what bound it: a
-- Leader calling it for their own Ministry gets back the open period on the
-- relationships they lead and nothing else, because it is security invoker and the
-- rows it can see are the rows they can see.
grant execute on function public.material_periods(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. A number is shown only where its Person currently agrees to share it
-- ---------------------------------------------------------------------------

-- The gap ticket 02 recorded when it added the column, and migration
-- `20260905000100` deferred to this ticket in as many words: row-level security is
-- row-level, so a Leader permitted to read a Person they lead read that Person's
-- `phone` along with everything else on the row -- consent or no consent. Checking
-- consent on the screen would leave the column one REST call away, so the column
-- itself stops being readable and `public.contact_to_share` becomes the only path
-- to a number a browser session has.
--
-- Column privileges cannot be subtracted from a table-level grant -- revoking
-- SELECT (phone) leaves a table-level SELECT untouched, and the number stays
-- readable -- so the table grant is dropped and the columns are named instead.
--
-- `email` is left readable, and that is a decision rather than an oversight. It is
-- the same kind of fact and it is covered by the same consent, but no surface in
-- Discipler displays it, so there is nothing here to gate at display time and
-- nothing to route through. Recorded for ticket 16, which is the first one to put
-- an email address on a screen.
revoke select on person from authenticated;

grant select (id, ministry_id, full_name, created_at, user_id, eligible_to_lead, email)
  on person to authenticated;

comment on column person.phone is
  'Not readable by any browser session. Reached through public.contact_to_share, '
  'which answers only where the Person currently consents to contact sharing, and '
  'on the command connection, which sends the messages.';

-- A whole-row reference needs SELECT on every column, so dropping one column takes
-- `participation_status` as a PostgREST computed column with it -- the Roster asks
-- for `person.*` to compute it. The derivation is unchanged and this is the read
-- shape it is asked for through instead.
--
-- SECURITY DEFINER because it is the whole-row reference: it holds the privilege
-- the caller no longer has, and it hands back three columns none of which is a
-- number. The Ministry check is the Roster's own -- it is an Admin surface, and
-- `participation_status` applies its own visibility rule on top.
create function public.roster(target_ministry_id uuid)
returns table (
  person_id uuid,
  full_name text,
  participation_status public.participation_status
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.full_name, public.participation_status(p)
    from public.person p
   where p.ministry_id = target_ministry_id
     and app.is_admin_of(target_ministry_id)
   order by p.full_name;
$$;

comment on function public.roster(uuid) is
  'One Ministry''s Roster as the Admin surface shows it: who is on it and each '
  'Person''s derived Participation Status. No contact details -- a number is '
  'reached through public.contact_to_share and nowhere else.';

revoke execute on function public.roster(uuid) from public, anon;
grant execute on function public.roster(uuid) to authenticated;

-- The consent-respecting path narrows from *any member of the Ministry* to the two
-- principals that have standing to ask.
--
-- `app.is_member_of` was right when Care Needed was the only caller, because that
-- is an Admin surface and the two coincided there. They do not coincide any more: a
-- Leader holds a `ministry_member` row too, so the old test would have let a Leader
-- ask for the number of any Person in the congregation -- including people in
-- relationships they have nothing to do with -- the moment this dashboard shipped.
-- A Leader may ask about the people they lead, which is the same set of people this
-- screen shows them.
create or replace function public.contact_to_share(target_ministry_id uuid, target_person_id uuid)
returns table (full_name text, phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.full_name, p.phone
    from public.person p
   where p.id = target_person_id
     and p.ministry_id = target_ministry_id
     and (app.is_admin_of(target_ministry_id) or app.leads_person(target_person_id))
     -- A number that is not there is not a number withheld, but the caller cannot
     -- tell the difference and does not need to: both mean "you cannot call them".
     and p.phone is not null
     -- The *current* decision, not whether one was ever given. A Person who granted
     -- contact sharing and later withdrew it has two records, and the older one must
     -- not answer for them. `is true` because NULL -- never asked -- is also "do not".
     and app.current_consent(p.id, 'contact_sharing') is true
$$;

comment on function public.contact_to_share(uuid, uuid) is
  'The contact details an Admin of this Person''s Ministry, or a Leader who leads '
  'them, may see -- or no row where the Person has not currently agreed to share '
  'them. The only consent-respecting path to a number from a browser session, and '
  'since ticket 15 the only path of any kind.';

-- ---------------------------------------------------------------------------
-- 4. A Leader sees that their own relationship is Paused
-- ---------------------------------------------------------------------------

-- A Pause is two events in `ministry_event` and what stands is the later of them,
-- which is what this function has always answered. It was security invoker, so the
-- Admin-only policy on `ministry_event` scoped it -- and a Leader asking it got
-- nothing back, which reads as *not paused*: the one wrong answer this surface
-- must not give confidently, since a Pause is why their check-ins have stopped.
--
-- Made a definer with the visibility rule stated in the query rather than widening
-- the policy on `ministry_event`. History is a ministry-wide record and a Leader has
-- no view onto it; a policy admitting two event types would be a door into that
-- table held open by a `where` clause, and the next event type added under
-- `subject_type = 'relationship'` would decide on its own whether it fits through.
--
-- The three branches are the three callers. A null `auth.uid()` is the trusted
-- command connection the tick runs on, which has no session to check and is already
-- scoped to one Ministry by the argument -- the same idiom `participation_status`
-- uses for exactly the same caller.
create or replace function public.relationship_pauses(target_ministry_id uuid)
returns table (
  relationship_id uuid,
  paused_at timestamptz,
  period_weeks integer
)
language sql
stable
security definer
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
     and (
       (select auth.uid()) is null
       or app.is_admin_of(target_ministry_id)
       or app.leads_relationship(latest.relationship_id)
     );
$$;

comment on function public.relationship_pauses(uuid) is
  'The Pause standing on each relationship in this Ministry right now: when it was '
  'taken and for how many weeks. Scoped to what the caller may see -- every '
  'relationship for an Admin, the ones they lead for a Leader. When it runs out is '
  'not here -- that is decided against the injected clock at the command boundary, '
  'never by now() in SQL.';
