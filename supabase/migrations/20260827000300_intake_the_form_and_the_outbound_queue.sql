-- Intake is the single consent gate, and this is the form behind it.
--
-- Ticket 02 landed the identity of three facts -- a submission exists, a consent of
-- a given kind was granted, an opt-out is open -- because Participation Status
-- needed nothing more. What the form actually captures lands here: availability,
-- the Discipleship Goal, an age band, a gender, an optional email.
--
-- The outbound queue gains the two columns ticket 20 serialises on. They are added
-- now, unused, so that per-phone serialisation is a query change rather than a
-- migration against a table the pilot is already writing to.

-- ---------------------------------------------------------------------------
-- The Discipleship Goal options a Ministry offers
-- ---------------------------------------------------------------------------

-- The list belongs to the Ministry and is set before a semester begins, so a goal
-- is a row here rather than a value on the submission. Ministries do not share the
-- list: two congregations describing what they are looking for in the same words is
-- a coincidence, not a fact to model.
create table discipleship_goal (
  id           uuid primary key default gen_random_uuid(),
  ministry_id  uuid not null references ministry (id) on delete cascade,
  label        text not null check (length(btrim(label)) > 0),
  -- The order the options appear on the form. The Ministry's own ordering is
  -- pastoral -- what they most want people to consider first -- so it is stored
  -- rather than alphabetised on their behalf.
  position     smallint not null,
  created_at   timestamptz not null default now(),

  unique (ministry_id, label),
  unique (ministry_id, position) deferrable initially deferred
);

create index discipleship_goal_ministry_idx on discipleship_goal (ministry_id, position);

comment on table discipleship_goal is
  'The Discipleship Goal options one Ministry offers at Intake. Set before a '
  'semester begins. Deleting an option blanks it on the submissions that chose it '
  '-- see intake_submission.discipleship_goal_id -- so the Admin surface that edits '
  'this list has to say so before it deletes anything.';

-- A Ministry with no options cannot serve an Intake form at all, so it starts with
-- a list it can edit rather than with nothing. These are a starting point for the
-- pilot and carry no product meaning of their own.
create function app.seed_discipleship_goals()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.discipleship_goal (ministry_id, label, position)
  values
    (new.id, 'Growing in the basics of faith', 1),
    (new.id, 'Career and calling', 2),
    (new.id, 'Marriage and family', 3),
    (new.id, 'Healing and recovery', 4),
    (new.id, 'Leadership and serving', 5);
  return new;
end;
$$;

create trigger ministry_starts_with_discipleship_goals
  after insert on ministry
  for each row execute function app.seed_discipleship_goals();

-- Ministries that already exist get the same starting list.
insert into discipleship_goal (ministry_id, label, position)
select m.id, g.label, g.position
  from ministry m
 cross join (values
    ('Growing in the basics of faith', 1::smallint),
    ('Career and calling', 2),
    ('Marriage and family', 3),
    ('Healing and recovery', 4),
    ('Leadership and serving', 5)
 ) as g (label, position)
 where not exists (
   select 1 from discipleship_goal existing where existing.ministry_id = m.id
 );

-- ---------------------------------------------------------------------------
-- What the form captures
-- ---------------------------------------------------------------------------

-- Seven days of four blocks: twenty-eight slots. Named blocks rather than clock
-- times, because a Person answering *when could work* is describing the shape of
-- their day and not committing to an hour -- and because pairing counts shared
-- slots, which only means something when both sides used the same grid.
create type weekday as enum
  ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');

create type day_block as enum ('early_morning', 'midday', 'afternoon', 'evening');

-- A range, never an exact age or a date of birth. The suggestion constraint is
-- expressed in bands for the same reason: two adjacent bands may differ by one year
-- or by nineteen. See docs/adr/0001-pairing-suggestion-inputs.md.
create type age_band as enum ('18-24', '25-34', '35-44', '45-54', '55-64', '65+');

create type gender as enum ('male', 'female');

alter table intake_submission
  add column age_band age_band not null,
  add column gender   gender   not null,
  -- Nullable, and null is a real state rather than an unfinished form: a Ministry
  -- that retires an option blanks it on the submissions that chose it, which is
  -- what makes the Admin warning about losing the data true. The form still
  -- requires a selection; the database records what survived.
  add column discipleship_goal_id uuid references discipleship_goal (id) on delete set null;

comment on column intake_submission.discipleship_goal_id is
  'Null once the Ministry retires the option this Person chose. Required on the '
  'form, nullable here: a retired option loses the answers that pointed at it, and '
  'the Person is left rankable by availability alone rather than unpairable.';

-- Availability is rows rather than an array so that pairing can count the overlap
-- between two people as a join, and so a slot is a value the database understands
-- rather than a string an application agreed to spell consistently.
create table intake_availability (
  ministry_id          uuid not null,
  intake_submission_id uuid not null,
  day                  weekday not null,
  block                day_block not null,

  primary key (intake_submission_id, day, block),

  constraint intake_availability_submission_fk
    foreign key (intake_submission_id) references intake_submission (id) on delete cascade,
  constraint intake_availability_ministry_fk
    foreign key (ministry_id) references ministry (id) on delete cascade
);

create index intake_availability_overlap_idx
  on intake_availability (ministry_id, day, block);

comment on table intake_availability is
  'The slots one Intake submission selected. A submission with no rows here is a '
  'Person who shares time with nobody; the form refuses to submit one, but the '
  'database does not, because an empty availability is visible in the No Schedule '
  'Overlap section rather than silently wrong.';

-- ---------------------------------------------------------------------------
-- The outbound queue gains what ticket 20 serialises on
-- ---------------------------------------------------------------------------

-- open       -- sent, awaiting a reply
-- answered   -- the reply arrived and bound to it
-- superseded -- a later prompt to the same phone took ownership of the next reply
-- timed_out  -- twenty-four hours passed with no reply
create type prompt_state as enum ('open', 'answered', 'superseded', 'timed_out');

alter table outbound_message
  -- The phone, not the Person: a number holds one conversation at a time however
  -- many people are reachable on it, which is the whole reason ticket 20 exists.
  add column prompt_key   text,
  -- Whose contact details this message would include, resolved at send time and
  -- never written into `body` at enqueue. Contact-sharing consent is checked when
  -- the message is sent rather than assumed from enrolment, and a body that already
  -- contained the number would leave the sending layer nothing to withhold.
  add column discloses_person_id uuid references person (id) on delete set null,
  -- Sent and not-sent are not the two outcomes. A message the sending layer refuses
  -- is neither delivered nor lost: it stays on the queue saying why it was refused,
  -- because a congregant who did not receive something is a thing an Admin has to
  -- be able to find out about.
  add column withheld_at     timestamptz,
  add column withheld_reason text,
  -- Null for a message that expects no reply -- a Welcome Message, a Starter
  -- Message. Only a Response-Required Message carries a state, and serialisation
  -- waits on those and nothing else.
  add column prompt_state prompt_state;

-- The lookup ticket 20 makes before every scheduled send: is there an open prompt
-- on this number. Partial, because that is the only state it ever asks about.
create index outbound_message_open_prompt_idx
  on outbound_message (prompt_key)
  where prompt_state = 'open';

alter table outbound_message
  add constraint outbound_message_not_both_sent_and_withheld
    check (sent_at is null or withheld_at is null);

comment on column outbound_message.withheld_reason is
  'Why the sending layer refused this message: the recipient opted out or lost SMS '
  'consent between enqueue and send. Codes, never prose.';

comment on column outbound_message.prompt_key is
  'The recipient phone, and the unit serialisation works in. A phone holds one '
  'conversation at a time regardless of how many people are reachable on it.';

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table discipleship_goal   enable row level security;
alter table intake_availability enable row level security;

alter table discipleship_goal   force row level security;
alter table intake_availability force row level security;

-- The goal list is not sensitive -- it is the set of options printed on a form --
-- so any member of the Ministry may read it. The Intake form itself is served to
-- somebody with no session at all, and reads the list on the server.
create policy discipleship_goal_read_own_ministry on discipleship_goal
  for select to authenticated
  using (app.is_member_of(ministry_id));

-- Availability follows what it belongs to: Admin-only, like the submission itself.
-- A Leader sees the people they lead, not the answers those people gave.
create policy intake_availability_read_own_ministry on intake_availability
  for select to authenticated
  using (app.is_admin_of(ministry_id));

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------

revoke all on discipleship_goal, intake_availability from anon, authenticated, service_role;

grant select on discipleship_goal, intake_availability to authenticated;

grant select, insert, update, delete
  on discipleship_goal, intake_availability to service_role;

grant select, insert, update, delete
  on discipleship_goal, intake_availability to discipler_command;

create policy discipleship_goal_command on discipleship_goal
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

create policy intake_availability_command on intake_availability
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());
