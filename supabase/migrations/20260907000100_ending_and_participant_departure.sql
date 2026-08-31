-- Ticket 13 -- Ending a relationship, and Participant departure
--
-- Two acts, and the difference between them is the whole ticket. Ending closes a
-- relationship and everyone in it, and records whether it completed or broke down.
-- A Participant leaving closes exactly one membership and leaves the relationship
-- running with whoever remains.
--
-- Neither deletes anything. A membership gains an end date, a relationship gains an
-- ending date, an outcome and a reason, and every week either of them was part of
-- stays attached exactly as it was recorded. A relationship that ran five months and
-- finished well is an outcome, not a deletion.
--
-- What this migration adds is the part that cannot live in application code: the
-- outcome the ending has to carry, the one function that ends a relationship, and
-- the constraint that keeps *no open membership outlives its relationship* true of
-- every write path rather than of the one that happens to be careful.

-- ---------------------------------------------------------------------------
-- An ending records an outcome as well as a reason
-- ---------------------------------------------------------------------------

-- Exactly two values. `relationship.ended_reason` already exists and is already
-- required, and it cannot answer the question the ending exists to open: *did this
-- complete or break down* is asked in counts, and free text cannot be classified
-- retrospectively once a pilot has written a hundred sentences.
--
-- Two, deliberately. The question is binary, and a third value invites a taxonomy
-- nobody has agreed -- after which every row written before it was added is
-- unclassifiable. An enum rather than a check constraint on text so that adding a
-- third is a migration somebody has to write on purpose.
create type relationship_outcome as enum ('completed', 'discontinued');

alter table relationship add column ended_outcome relationship_outcome;

-- Every relationship that has already ended by the time this runs was ended by
-- `relationship.cancel` -- the only writer of `ended_at` before this migration --
-- and a relationship nobody accepted did not complete. Backfilled rather than left
-- null, because the constraint below is what makes the column meaningful and a
-- constraint that had to permit a null for history's sake would permit one for ever.
update relationship set ended_outcome = 'discontinued' where ended_at is not null;

-- The same shape as the reason it stands beside: an ending carries both, or the row
-- is not an ending. Stated as a constraint rather than as a rule the command
-- boundary keeps, because the boundary is not the only thing that can write this
-- table -- a migration, a repair script and the service role all reach it.
--
-- A cancellation is an ending in the data and carries an outcome too. It is
-- `discontinued`: nothing was completed, because nobody had accepted it. The
-- question *how many relationships completed* is asked of relationships that ran,
-- and `accepted_at` is what separates those from the ones that never started.
alter table relationship
  add constraint relationship_ended_carries_an_outcome
    check (ended_at is null or ended_outcome is not null);

comment on column relationship.ended_outcome is
  'Whether the relationship completed or was discontinued -- the part of an ending '
  'a Ministry can count. Required whenever ended_at is set. The reason beside it is '
  'what happened in the Ministry''s own words, and neither substitutes for the other.';

-- ---------------------------------------------------------------------------
-- One function ends a relationship
-- ---------------------------------------------------------------------------

-- The invariant this holds is that no open membership outlives its relationship,
-- and it cannot be held by a constraint alone: it is a fact about two tables, and
-- the closure has to happen in the same transaction as the ending or a Participant
-- stays out of the pairing pool for a relationship that no longer exists.
--
-- So both writers go through here -- the ending an Admin records against a
-- relationship that ran, and the cancellation of one nobody accepted. They differ in
-- exactly one thing, which side of acceptance the act belongs on, and that is
-- `expects_accepted`: an ending refuses a relationship that never started, and a
-- cancellation refuses one that did. Each caller says which act it is performing
-- rather than repeating the check and hoping.
--
-- The row is taken `for update` before anything is decided. The command boundary
-- already decided from a snapshot read under that same lock earlier in the
-- transaction; this is the database having the final say, which is what refuses the
-- second of two Admins who both clicked End.
--
-- SECURITY INVOKER, deliberately. The policies on `relationship` and
-- `relationship_member` scope this to the Ministry the connection has declared it is
-- acting for, exactly as they would a direct update -- a definer function here would
-- be a way to end any relationship in any Ministry.
--
-- Returns a refusal code, or null when the relationship ended. A code rather than an
-- exception because these are ordinary outcomes an Admin sees as a sentence on a
-- screen, and the caller maps them to the refusal its own act carries.
create function app.end_relationship(
  target_relationship_id uuid,
  at                     timestamptz,
  actor                  uuid,
  reason                 text,
  outcome                relationship_outcome,
  expects_accepted       boolean
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  standing public.relationship;
begin
  select * into standing
    from public.relationship r
   where r.id = target_relationship_id
     for update;

  -- Not found is also what another Ministry's relationship looks like from here,
  -- because the policy shows this connection neither.
  if not found then return 'relationship_not_found'; end if;

  -- Terminal. A second ending would overwrite the outcome and the reason the first
  -- one recorded, which is the one part of an ending nothing can reconstruct.
  if standing.ended_at is not null then return 'relationship_already_ended'; end if;

  if expects_accepted and standing.accepted_at is null then
    return 'relationship_not_accepted';
  end if;
  if not expects_accepted and standing.accepted_at is not null then
    return 'relationship_already_accepted';
  end if;

  update public.relationship r
     set ended_at      = at,
         ended_by      = actor,
         ended_reason  = reason,
         ended_outcome = outcome
   where r.id = target_relationship_id;

  -- The whole of *everyone returns to the Roster as Ready to Pair*:
  -- `participation_status` reads open participant memberships, and the
  -- participation caps read open memberships of either role. Nothing here says
  -- anything about a Person's status, because nothing stores one.
  --
  -- A Participant who holds another open participant membership stays `Paired`, and
  -- one who has opted out stays `Opted Out`. Both fall out of the derivation with no
  -- special case, which is the point of deriving it.
  update public.relationship_member m
     set ended_at = at
   where m.relationship_id = target_relationship_id
     and m.ended_at is null;

  return null;
end;
$$;

comment on function app.end_relationship(uuid, timestamptz, uuid, text, relationship_outcome, boolean) is
  'The only write path that ends a relationship. Stamps the ending and closes every '
  'open membership on it in one transaction; returns a refusal code, or null when it '
  'ended. `expects_accepted` says which act this is: an ending, or a cancellation of '
  'a relationship nobody accepted.';

revoke execute on function
  app.end_relationship(uuid, timestamptz, uuid, text, relationship_outcome, boolean)
  from public;
grant execute on function
  app.end_relationship(uuid, timestamptz, uuid, text, relationship_outcome, boolean)
  to discipler_command;

-- ---------------------------------------------------------------------------
-- No open membership survives on a relationship that has ended
-- ---------------------------------------------------------------------------

-- The function above is where ending is written; this is what makes the invariant
-- true regardless. A membership left open on an ended relationship is invisible in
-- every screen and wrong in every count: the Person is held out of the pairing pool,
-- their participation cap is still spent, and nothing anywhere says why.
--
-- A constraint trigger rather than a plain one, and `initially deferred` rather than
-- immediate, because the invariant is only ever true between statements and not
-- within them: the function stamps the relationship first and closes the memberships
-- second, and an immediate trigger would refuse the transaction halfway through its
-- own correct work. Deferred, it is checked once at commit, which is the only moment
-- the question means anything.
--
-- It fires from both sides. Ending a relationship is one way to break it; inserting
-- an open membership onto one that has already ended is the other, and that is the
-- shape a readmission takes if anybody tries to readmit somebody to a relationship
-- that is over.
--
-- The column to read is passed as a trigger argument rather than branched on
-- `tg_table_name`, because `new.relationship_id` does not exist on a `relationship`
-- row and a branch that mentions it fails at run time on the table where it is not
-- taken.
create function app.reject_open_membership_on_an_ended_relationship()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  subject uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
begin
  if exists (
    select 1
      from public.relationship_member m
      join public.relationship r on r.id = m.relationship_id
     where m.relationship_id = subject
       and m.ended_at is null
       and r.ended_at is not null
  ) then
    raise exception
      'relationship % has ended and cannot hold an open membership', subject
      using errcode = 'check_violation',
            constraint = 'relationship_has_no_open_membership_after_it_ends';
  end if;

  return null;
end;
$$;

create constraint trigger relationship_member_closes_when_the_relationship_ends
  after insert or update on relationship_member
  deferrable initially deferred
  for each row
  execute function app.reject_open_membership_on_an_ended_relationship('relationship_id');

create constraint trigger relationship_ending_closes_every_membership
  after update on relationship
  deferrable initially deferred
  for each row
  execute function app.reject_open_membership_on_an_ended_relationship('id');

-- ---------------------------------------------------------------------------
-- Who recorded a departure
-- ---------------------------------------------------------------------------

-- A departure is an Admin act on somebody else's relationship, exactly as an ending
-- is, and every other such act in this schema names its actor against
-- `ministry_member`: `relationship.ended_by`, `follow_up_item.resolved_by`,
-- `concern.resolved_by`, `concern_viewing.viewed_by`. A departure named its actor in
-- the history event alone, where nothing checks it -- so an identifier belonging to
-- no member of this Ministry, or to a member of a different one, was written and
-- kept.
--
-- The composite key is the whole point of the shape: holding an account is not
-- standing to remove somebody from a relationship, and `(ministry_id, departed_by)`
-- is what says the actor belongs to the Ministry the membership does.
--
-- Nullable, and deliberately: a membership closed by the relationship ending has no
-- departer. `departed_by` is what distinguishes the two ways a membership closes,
-- which is a fact the ending function's blanket close would otherwise erase.
alter table relationship_member add column departed_by uuid;

alter table relationship_member
  add constraint relationship_member_departed_by_fk
    foreign key (ministry_id, departed_by) references ministry_member (ministry_id, user_id)
    on delete set null;

comment on column relationship_member.departed_by is
  'The Admin who recorded this Participant leaving, when that is how the membership '
  'closed. Null when the membership closed because the relationship ended, which is '
  'what tells the two apart.';
