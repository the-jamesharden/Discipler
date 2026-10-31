-- The unpaired pop-up (Exponential launch, ticket 29)
--
-- The Overview gains a card at the bottom right telling the Admin how many
-- people are waiting on them: Ready to Pair and in no relationship, and No
-- Intake Submitted. Its counts come from the Overview's own read, so the
-- document gains one more part, `waiting`, with
--
--   * `to_pair`, the people whose Participation Status is Ready to Pair and who
--     hold no open membership on either side: Ready to Pair already means
--     discipled by nobody, and somebody leading a relationship is in one too;
--   * `awaiting_intake`, the people whose Participation Status is No Intake
--     Submitted;
--   * `session_id`, the Auth session the caller's token names, which is what
--     makes each sign-in its own showing of the card (`src/domain/waiting-on-you.ts`).
--
-- Both counts leave out Admins (`admins_on_the_roster`) and anybody removed
-- from the Roster, and an opted-out Person is counted in neither by their
-- status. Nothing is recorded and no table changes: whether the card has been
-- shown in this sign-in today is the browser's to remember, not the database's.
--
-- `overview_card_page` composes `overview_page` and so carries it too; the
-- Check-Ins tab answers with `app.history_page()` and does not.
-- ---------------------------------------------------------------------------

create function app.waiting_on_you(target_ministry_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with on_the_roster as (
    select public.participation_status(p) as status,
           exists (select 1
                     from public.relationship_member m
                    where m.person_id = p.id
                      and m.ended_at is null) as in_a_relationship
      from public.person p
     where p.ministry_id = target_ministry_id
       and not exists (select 1
                         from public.person_removal x
                        where x.person_id = p.id
                          and x.restored_at is null)
       and p.id not in (select a.person_id
                          from public.admins_on_the_roster(target_ministry_id) a)
  )
  select jsonb_build_object(
    'to_pair', count(*) filter (where status = 'ready_to_pair' and not in_a_relationship),
    'awaiting_intake', count(*) filter (where status = 'no_intake_submitted'),
    'session_id', nullif((select auth.jwt()) ->> 'session_id', '')
  )
    from on_the_roster;
$$;

revoke execute on function app.waiting_on_you(uuid) from public, anon, service_role;
grant execute on function app.waiting_on_you(uuid) to authenticated;

-- What `20261014001400_the_growth_chart.sql` left it, with `waiting` beside
-- `growth`.
create or replace function public.overview_page()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  doc jsonb := app.history_page();
  ministry uuid;
begin
  if doc ->> 'session' <> 'admin' then return doc; end if;
  ministry := (doc -> 'admin' ->> 'ministry_id')::uuid;
  return doc || jsonb_build_object(
    'growth', app.growth_inputs(ministry),
    'waiting', app.waiting_on_you(ministry)
  );
end;
$$;

revoke execute on function public.overview_page() from public, anon, service_role;
grant execute on function public.overview_page() to authenticated;
