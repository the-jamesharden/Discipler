-- The onboarding modal (Exponential launch, ticket 27)
--
-- The modal opens on each Admin's first sign-in after this ships, with James's welcome
-- video first, and Restart onboarding brings it back without the video. So one thing is
-- kept per Admin: whether it has opened for them.
--
-- Additive and safe to push ahead of the code: one nullable column, and one more key on
-- what `app.setup_meter_of` answers. Nothing is backfilled, because every Admin who
-- exists today is meant to see it, and a null says so.
--
-- It comes through the one read every page already makes (ADR-0023), by way of the
-- meter's own function, so `app.page_session()` itself is not replaced here and carries
-- on calling the function it always called.

-- On the membership for the same reason as `setup_steps_seen`, beside it: it is about
-- one Admin, says nothing about the church, and is a bookmark rather than history.
alter table ministry_member
  add column onboarding_opened_at timestamptz;

comment on column ministry_member.onboarding_opened_at is
  'When the onboarding modal first opened for this Admin, so the welcome video plays once. '
  'Restart onboarding opens the modal again and does not change this.';

-- The policy `ministry_member_command_setup_seen` already lets the command connection
-- update an Admin's own row; only the column is new.
grant update (onboarding_opened_at) on ministry_member to discipler_command;

-- The newest definition (20261104102600) with one key added, `onboarding`: what the
-- modal draws. Whether it opens has to be known on every Overview, and when it does
-- open it must cost no second read, so it all comes here. It answers once this Admin
-- has seen the badge too, because Restart onboarding still works then, so a church past
-- setup now pays for two primary-key reads on each page instead of one.
--
-- `reads_as` is the same fact `ministryVoice` reads: what a church's texts open with.
create or replace function app.setup_meter_of(target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  own record;
  church record;
  onboarding jsonb;
begin
  if not app.is_admin_of(target) then return null; end if;

  select m.setup_steps_seen, m.setup_badge_seen_at, m.onboarding_opened_at
    into own
    from public.ministry_member m
   where m.ministry_id = target
     and m.user_id = (select auth.uid());

  select c.checkin_day,
         c.checkin_hour,
         c.leader_noun,
         c.participant_noun,
         coalesce(nullif(btrim(c.from_name), ''), c.name) as reads_as
    into church
    from public.ministry c
   where c.id = target;

  onboarding := jsonb_build_object(
    'opened', own.onboarding_opened_at is not null,
    'day', church.checkin_day,
    'hour', church.checkin_hour,
    'leader_noun', church.leader_noun,
    'participant_noun', church.participant_noun,
    'reads_as', church.reads_as
  );

  if own.setup_badge_seen_at is not null then
    return jsonb_build_object('finished', true, 'onboarding', onboarding);
  end if;

  return jsonb_build_object(
    'finished', false,
    'onboarding', onboarding,
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

comment on function app.setup_meter_of(uuid) is
  'The setup meter for one Admin of the church: which of the seven steps its history '
  'holds, which of them this Admin has seen, and what the onboarding modal draws. '
  'See `src/domain/setup-meter.ts` and `src/domain/onboarding.ts`.';
