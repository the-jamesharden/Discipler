-- ---------------------------------------------------------------------------
-- What a Ministry may vary about how Discipler runs for them
-- ---------------------------------------------------------------------------
--
-- Ticket 08b already landed half of this: `timezone`, `checkin_day`,
-- `checkin_hour`, the quiet-hours check constraint underneath the hour, and the
-- nullable per-relationship overrides nothing surfaces. Its own comment said the
-- two tickets share that criterion by design and that *the second to land verifies
-- the constraint rather than re-authoring it*, so none of it is rewritten here.
-- `tests/integration/ministry-settings.test.ts` proves the clamp by writing 7am
-- straight past the form, which is the only proof that matters for a rule the form
-- is not the enforcer of.
--
-- What lands here is the rest of what a Ministry owns, and one behaviour change.
--
--   * `from_name` -- the name a message *reads as*, which is not the display name
--     an Admin sees on their own screens and is not `sending_number`, which is the
--     number it comes from. All three are separate and all three are on one form.
--
--   * `leader_noun` and `participant_noun` -- the words a Ministry calls its two
--     roles by, carried into the messages that name a role. The same rule as the
--     Discipleship Goal options: a Ministry's people are called what that Ministry
--     calls them.
--
--   * `suggest_gender_match` and `suggest_max_age_band_gap` -- the two pairing
--     constraints, which are not the same kind of thing and are not stored as
--     though they were. One is a safeguarding rule with a trigger behind it; the
--     other governs suggestion only and appears in no constraint at all.
--
-- Implements `docs/adr/0007-the-check-in-cadence-and-the-week-boundary.md`.

-- ---------------------------------------------------------------------------
-- The Ministry section
-- ---------------------------------------------------------------------------

-- Nullable, and read as `coalesce(nullif(btrim(from_name), ''), name)` wherever a
-- message is composed. Null for a Ministry that has never set one, rather than the
-- display name copied in at creation: a Ministry that renames itself has renamed
-- itself, and a copy would leave its messages speaking as whoever it used to be
-- until somebody noticed.
--
-- The check is on the *present* value only. Blank is how a Ministry clears one,
-- and the application folds a blank column to null on the way back out -- so a
-- column holding spaces is refused rather than being a third state that reads as
-- neither set nor unset.
alter table ministry
  add column from_name text
    constraint ministry_from_name_is_not_blank
      check (from_name is null or length(btrim(from_name)) > 0);

comment on column ministry.from_name is
  'The name this Ministry''s messages read as, or null to speak as `name`. Not '
  '`sending_number`, which is the number they come from, and not `name`, which is '
  'what an Admin sees this Ministry called on their own screens.';

-- ---------------------------------------------------------------------------
-- The Language section
-- ---------------------------------------------------------------------------

-- `mentor` and `mentee` as the defaults, which is what `CONTEXT.md` already calls
-- the participant-facing words for the two roles -- *they belong in message copy,
-- not in the model*. Lowercase because that is where they appear: mid-sentence, in
-- a message, and stored exactly as an Admin typed them so that the preview on the
-- settings form is the message rather than an approximation of it.
--
-- `not null` with a default rather than nullable, because there is no such thing
-- as a Ministry whose messages call the roles nothing. A Ministry that has not
-- thought about it has Discipler's words, which is a real answer.
alter table ministry
  add column leader_noun      text not null default 'mentor',
  add column participant_noun text not null default 'mentee',

  add constraint ministry_leader_noun_is_not_blank
    check (length(btrim(leader_noun)) > 0),
  add constraint ministry_participant_noun_is_not_blank
    check (length(btrim(participant_noun)) > 0);

comment on column ministry.leader_noun is
  'What this Ministry calls the Leader of a relationship, in the messages it '
  'sends. Used in noun position and never as a verb -- "someone to be their '
  'mentor" survives a Ministry that says "discipleship coach"; "someone to '
  'mentor" does not.';

comment on column ministry.participant_noun is
  'What this Ministry calls the Participant of a relationship, in the messages it '
  'sends. Always the reader''s own role, so it stays singular however many people '
  'are on the other side of it.';

-- ---------------------------------------------------------------------------
-- The Pairing section
-- ---------------------------------------------------------------------------

-- The two constraints are not the same kind of thing and this schema does not
-- pretend they are, which is the same asymmetry ticket 05 named: gender is
-- enforced by a trigger and the age band is enforced nowhere.
--
-- `suggest_gender_match` defaults true, because the safe default for a
-- safeguarding constraint is enforced and never absent. A Ministry turns it off
-- deliberately, which is what `docs/product-rules.md` has always said the absolute
-- gender constraint requires.
alter table ministry
  add column suggest_gender_match boolean not null default true;

comment on column ministry.suggest_gender_match is
  'Whether the absolute gender constraint on a one-to-one is enforced for this '
  'Ministry. True by default and turned off only deliberately: it is a '
  'safeguarding rule, not a tuning dial, and the trigger below is what enforces '
  'it -- manual pairing may never cross it while it is on.';

-- The number of age bands a Participant may be **above** their Leader, and nothing
-- below: a 65+ Leader with an 18-24 Participant is five bands down and permitted,
-- because an older person discipling a younger one is the common case.
--
-- The direction is written down because the setting is a single integer, and an
-- integer with no stated direction is read as symmetric by whoever implements it
-- next -- which would exclude most of a ministry's real pairings.
--
-- Default `1`, which is ADR-0001's own rule and permits a 25-34 Leader with a
-- 35-44 Participant. `0` is valid and means *never older than their Leader*.
-- Bounded above by the ladder itself: `18-24` to `65+` is five bands, and a gap of
-- six names nothing.
alter table ministry
  add column suggest_max_age_band_gap smallint not null default 1
    constraint ministry_age_band_gap_is_a_number_of_bands
      check (suggest_max_age_band_gap between 0 and 5);

comment on column ministry.suggest_max_age_band_gap is
  'How many age bands a Participant may be ABOVE their Leader. No limit below. '
  'Default 1; 0 means never older than their Leader. Governs suggestion only -- '
  'it appears in no constraint on pairing, and an Admin who knows a pairing is '
  'right may cross it by hand.';

-- ---------------------------------------------------------------------------
-- The deliberate disable, wired to the trigger it disables
-- ---------------------------------------------------------------------------

-- Until now the rule was simply on, and 20260828000200 said so: *those settings
-- are ticket 22's, and until they exist the rule is on*. This is that ticket.
--
-- The setting is read from the relationship's Ministry rather than passed in,
-- because the whole reason this rule lives in a trigger is that it must not depend
-- on what the write paths currently happen to do. A caller that could pass "the
-- gender rule is off" would be a caller that could turn it off.
--
-- Read *before* the lock is taken and before anything else, so that a Ministry
-- with the rule off pays for neither -- and, more to the point, so that turning it
-- off is a single visible early return rather than a condition threaded through
-- the check itself.
create or replace function app.reject_gender_mismatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  joining public.gender;
begin
  -- The deliberate disable. Off means off: a Ministry that has turned this rule
  -- off has said mixed one-to-ones are permitted for them, and there is nothing
  -- left here to check.
  if not exists (
    select 1
      from public.relationship r
      join public.ministry m on m.id = r.ministry_id
     where r.id = new.relationship_id
       and m.suggest_gender_match
  ) then
    return new;
  end if;

  joining := app.current_gender(new.person_id);

  -- No Intake, so no answer. The readiness triggers refuse this row a moment later
  -- with a refusal that tells the Admin what is actually missing; answering "genders
  -- do not match" here would send them looking for the wrong problem.
  if joining is null then return new; end if;

  -- Serialises everybody joining *this* relationship, and nothing else. Without it
  -- the check below reads a snapshot that cannot see a concurrent insert, which is
  -- the failure ADR-0004 names. Taken before the read, because a lock taken after one
  -- is a lock that guarantees nothing.
  perform 1 from public.relationship where id = new.relationship_id for update;

  if exists (
    select 1
      from public.relationship_member m
     where m.relationship_id = new.relationship_id
       and m.ended_at is null
       and m.person_id <> new.person_id
       and app.current_gender(m.person_id) is distinct from joining
  ) then
    raise exception 'everyone in a relationship must be of the same gender'
      using errcode = 'check_violation',
            constraint = 'relationship_member_gender_matches';
  end if;

  return new;
end;
$$;

comment on function app.reject_gender_mismatch() is
  'Refuses a membership whose gender differs from the relationship''s other open '
  'members. Fired only for a one-to-one -- a group may be mixed -- and only where '
  'the Ministry has `suggest_gender_match` on, which is the deliberate disable the '
  'product rules have always said this constraint requires. Compared against the '
  'other members rather than against the leader, so it holds however the rows '
  'arrive.';

revoke execute on function app.reject_gender_mismatch() from public;

-- ---------------------------------------------------------------------------
-- The settings, as the signed-in Admin reads them
-- ---------------------------------------------------------------------------

-- Admin-only, and not merely member-only. The Leader Dashboard shows a Leader
-- their own relationships; what hour a whole Ministry is texted at and whether the
-- gender rule is enforced are the coordinator's to see and to change, and a screen
-- that only hid the form would still have handed the answers to anybody signed in.
--
-- A function rather than a `select` against the table, for the reason the
-- Discipleship Goal options are one: the settings surface and the command boundary
-- must not be able to disagree about what this Ministry's settings *are*, and one
-- definition is what makes that so rather than a convention.
create function public.ministry_settings(target_ministry_id uuid)
returns table (
  name text,
  from_name text,
  timezone text,
  leader_noun text,
  participant_noun text,
  suggest_gender_match boolean,
  suggest_max_age_band_gap smallint,
  checkin_day smallint,
  checkin_hour smallint
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.name,
         m.from_name,
         m.timezone,
         m.leader_noun,
         m.participant_noun,
         m.suggest_gender_match,
         m.suggest_max_age_band_gap,
         m.checkin_day,
         m.checkin_hour
    from public.ministry m
   where m.id = target_ministry_id
     and (
       app.is_admin_of(target_ministry_id)
       or app.command_ministry_id() = target_ministry_id
     );
$$;

comment on function public.ministry_settings(uuid) is
  'One Ministry''s settings, for the Admin who administers it. Answers nobody '
  'else: a Leader is a member of the Ministry and these are not theirs to read.';

revoke execute on function public.ministry_settings(uuid) from public, anon;
grant execute on function public.ministry_settings(uuid)
  to authenticated, discipler_command;

-- ---------------------------------------------------------------------------
-- Saving them
-- ---------------------------------------------------------------------------

-- The write goes through the command boundary on the trusted connection, like
-- every other write in this product -- so what is granted here is `update` to
-- `discipler_command` and nothing to `authenticated`. A signed-in Admin's session
-- reads the settings and posts a form; it never writes the row itself.
--
-- Column by column, and only the nine the settings form owns. `sending_number` is
-- the notable omission: it is provisioned with the Ministry rather than typed into
-- a box, and a blanket `grant update on ministry` would have let a settings save
-- change the number a congregation's texts come from -- which is the one field on
-- this table whose value is somebody else's to set.
grant update (
  name,
  from_name,
  timezone,
  leader_noun,
  participant_noun,
  suggest_gender_match,
  suggest_max_age_band_gap,
  checkin_day,
  checkin_hour
) on ministry to discipler_command;

-- Scoped to the Ministry this connection declared it is acting for, both ways, so
-- a command cannot read one Ministry's settings and write them onto another's row.
create policy ministry_command_write on ministry
  for update to discipler_command
  using (id = app.command_ministry_id())
  with check (id = app.command_ministry_id());
