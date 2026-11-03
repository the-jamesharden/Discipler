-- The setup meter (Exponential launch, ticket 26)
--
-- "Jumpstart discipleship" counts seven steps for a church, on every Admin page. It
-- comes through the one read every page already makes (ADR-0023): one more key on
-- `app.page_session()`, so no page makes a second request.
--
-- Additive and safe to push ahead of the code: two columns with defaults on
-- `ministry_member`, one index, one new function, and one new key on the page
-- session. Nothing is backfilled, because nothing needs to be: a church from before
-- launch shows its real progress from the history it already holds.

-- ---------------------------------------------------------------------------
-- What each Admin has watched
-- ---------------------------------------------------------------------------

-- On the membership because it is about one Admin and says nothing about the church,
-- which is also why it is a bookmark rather than an event: history records what
-- happened in a Ministry, and somebody having seen a confetti burst did not.
alter table ministry_member
  add column setup_steps_seen text[] not null default '{}'
    constraint ministry_member_setup_steps_seen_are_steps check (
      setup_steps_seen <@ array[
        'check_in_time', 'tour', 'test_check_in', 'roster', 'intake', 'relationship', 'accepted'
      ]::text[]
    ),
  add column setup_badge_seen_at timestamptz;

comment on column ministry_member.setup_steps_seen is
  'The setup steps this Admin has watched tick, so each plays once for each Admin. '
  'Whether a step is done is read from the church''s history (`app.setup_meter_of`).';
comment on column ministry_member.setup_badge_seen_at is
  'When this Admin was shown the badge at 100%. The bar is gone for them from then on.';

-- An Admin's own bookmark, written as every other Admin action is. Column by column,
-- so the command connection still cannot change who is an Admin.
grant update (setup_steps_seen, setup_badge_seen_at) on ministry_member to discipler_command;

create policy ministry_member_command_setup_seen on ministry_member
  for update to discipler_command
  using (ministry_id = app.command_ministry_id() and tier = 'admin')
  with check (ministry_id = app.command_ministry_id() and tier = 'admin');

-- ---------------------------------------------------------------------------
-- The steps, as history
-- ---------------------------------------------------------------------------

-- This is asked on every Admin page until the church reaches 100%, and the event
-- table's own index would walk a church's whole history to find a type it has not got.
-- With this one each question is a single probe, and an index this small costs almost
-- nothing to keep. The list is the event types the function below reads.
create index ministry_event_setup_step_idx
  on ministry_event (ministry_id, type)
  where type in (
    'ministry.settings_changed',
    'setup.check_in_time_confirmed',
    'setup.tour_finished',
    'setup.test_check_in_sent',
    'person.imported',
    'person.joined_at_intake',
    'intake.submitted',
    'relationship.created',
    'relationship.activated'
  );

-- Each step is a question about what the church has stored, and never a counter. They
-- cannot go down because what they read is not taken back: `ministry_event` refuses
-- an update or a delete, no product path deletes a person, a submission or a
-- relationship, and removing a person or ending a relationship leaves the row and
-- `accepted_at` where they were.
--
-- Most steps read a row as well as its event, because a church from before launch may
-- hold rows from before the event was written, or put there by hand during the pilot.
-- The step reads whichever is there, so that history decides and not the route it
-- arrived by:
--
--   check_in_time   An Admin pressed Save on the one Settings form, which holds the
--                   check-in day and hour. A save that changed anything has always
--                   said `ministry.settings_changed`, so a church from before launch
--                   gets the credit; one that changed nothing says
--                   `setup.check_in_time_confirmed`.
--   tour            `setup.tour_finished`, appended by ticket 27 on the tour's Done.
--   test_check_in   `setup.test_check_in_sent`, appended by ticket 28 on sending one.
--   roster          Somebody who is not an Admin. The row is the present tense, and
--                   the event keeps it true of somebody later made an Admin by hand.
--   intake          A submission, or its event.
--   relationship    A relationship, or its event. An invitation taken back keeps both.
--   accepted        `accepted_at`, or its event. Ending the relationship keeps both.
--
-- Nothing here counts ratings, meetings or Follow-Up.
--
-- Security definer for one reason: a session reads only its own `ministry_member` row,
-- so as the invoker a second Admin's Roster row would read as somebody who is not an
-- Admin, and two Admins of one church would disagree about step 4. The meter is the
-- same for every Admin. It answers only for a church the session administers.
--
-- Once this Admin has seen the badge nothing below the first read runs, so a church
-- past setup pays for one primary-key read on each page.
create function app.setup_meter_of(target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  own record;
  church record;
begin
  if not app.is_admin_of(target) then return null; end if;

  select m.setup_steps_seen, m.setup_badge_seen_at
    into own
    from public.ministry_member m
   where m.ministry_id = target
     and m.user_id = (select auth.uid());

  if own.setup_badge_seen_at is not null then
    return jsonb_build_object('finished', true);
  end if;

  select c.checkin_day, c.checkin_hour
    into church
    from public.ministry c
   where c.id = target;

  return jsonb_build_object(
    'finished', false,
    'seen', to_jsonb(own.setup_steps_seen),
    'day', church.checkin_day,
    'hour', church.checkin_hour,
    'done', jsonb_build_object(
      'check_in_time', exists (
        select 1 from public.ministry_event e
         where e.ministry_id = target
           and e.type in ('ministry.settings_changed', 'setup.check_in_time_confirmed')
      ),
      'tour', exists (
        select 1 from public.ministry_event e
         where e.ministry_id = target and e.type = 'setup.tour_finished'
      ),
      'test_check_in', exists (
        select 1 from public.ministry_event e
         where e.ministry_id = target and e.type = 'setup.test_check_in_sent'
      ),
      'roster', exists (
        select 1 from public.ministry_event e
         where e.ministry_id = target
           and e.type in ('person.imported', 'person.joined_at_intake')
      ) or exists (
        select 1 from public.person p
         where p.ministry_id = target
           and not exists (
             select 1 from public.ministry_member m
              where m.ministry_id = target
                and m.user_id = p.user_id
                and m.tier = 'admin'
           )
      ),
      'intake', exists (
        select 1 from public.ministry_event e
         where e.ministry_id = target and e.type = 'intake.submitted'
      ) or exists (
        select 1 from public.intake_submission s where s.ministry_id = target
      ),
      'relationship', exists (
        select 1 from public.ministry_event e
         where e.ministry_id = target and e.type = 'relationship.created'
      ) or exists (
        select 1 from public.relationship r where r.ministry_id = target
      ),
      'accepted', exists (
        select 1 from public.ministry_event e
         where e.ministry_id = target and e.type = 'relationship.activated'
      ) or exists (
        select 1 from public.relationship r
         where r.ministry_id = target and r.accepted_at is not null
      )
    )
  );
end;
$$;

revoke execute on function app.setup_meter_of(uuid) from public, anon, service_role;
grant execute on function app.setup_meter_of(uuid) to authenticated;

comment on function app.setup_meter_of(uuid) is
  'The setup meter for one Admin of the church: which of the seven steps its history '
  'holds and which of them this Admin has seen. See `src/domain/setup-meter.ts`.';

-- ---------------------------------------------------------------------------
-- The page session
-- ---------------------------------------------------------------------------

-- The newest definition (20261103102300) with one key added at the end, `setup`.
-- Everything the meter asks is in the function above, so a later replacement of this
-- function carries it with that one line.
create or replace function app.page_session()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  membership record;
  own record;
begin
  if uid is null or not public.session_is_live() then
    return jsonb_build_object('session', 'signed-out');
  end if;

  select mm.ministry_id, m.name
    into membership
    from public.ministry_member mm
    left join public.ministry m on m.id = mm.ministry_id
   where mm.user_id = uid
     and mm.tier = 'admin'
   order by mm.created_at
   limit 1;

  if not found then
    return jsonb_build_object('session', 'not-an-admin', 'user_id', uid);
  end if;

  select p.id, p.full_name
    into own
    from public.person p
   where p.ministry_id = membership.ministry_id
     and p.user_id = uid
   limit 1;

  return jsonb_build_object(
    'session', 'admin',
    'user_id', uid,
    'admin', jsonb_build_object(
      'ministry_id', membership.ministry_id,
      'ministry_name', membership.name,
      'person_id', own.id,
      'full_name', own.full_name
    ),
    'billing', (select to_jsonb(s) from app.billing_state_of(membership.ministry_id) s),
    'setup', app.setup_meter_of(membership.ministry_id)
  );
end;
$$;

revoke execute on function app.page_session() from public, anon, service_role;
grant execute on function app.page_session() to authenticated;
