-- The pair card (Pastor feedback, ticket 07)
--
-- Clicking a one-to-one or a 1:2 pair on the Overview opens a card over the
-- page: both people side by side with their contact details and Intake answers,
-- the facts about the pair, and the Concern or the stall in a band under the
-- names. The card is the Overview's own page at `?card=`, so it is one read
-- like every page (ADR-0023): `overview_card_page` is the Overview's document
-- with the card beside it.
--
-- Most of what the card shows is already in the history every Admin tab reads:
-- who is in the pair, the weeks, the answers, the Concerns, the Pause, the open
-- Follow-Up Items. What is not is gathered here, for the one relationship the
-- address names: whether it has a name, which is what tells a pair from a Group,
-- each person's age band and goal off their latest Intake, their phone and
-- email where they agreed to share them, the Material running now, and who has
-- read its unresolved Concerns. The card is shared: the Check-Ins and Follow-Up
-- tabs open the same card (tickets 09 and 10), and their pages compose
-- `app.pair_card` the way the Overview's does.
--
-- Nothing here reads a Concern's words. They are still reached one at a time
-- through the `concern.view` command, which records the reading in the same
-- transaction that returns them; the page runs it as the card opens.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. The contact details the card may show
-- ---------------------------------------------------------------------------
-- The consent rule Nudge reads (ADR-0010), `app.current_consent(p.id,
-- 'contact_sharing') is true`, the same predicate `public.contact_to_share`
-- carries: a Person's number and email reach the card only while their current
-- decision is yes. NULL, never asked, is no. The ticket asks for exactly that
-- check, so the card shows nothing the Follow-Up reveal would not.
--
-- Its own function rather than `contact_to_share` called per person, for two
-- reasons the two cannot share: the card shows the email as well, which
-- `contact_to_share` does not return, and somebody with an email and no number
-- is somebody the card can still help an Admin reach. The test of who may ask
-- is the Admin test alone: the card is an Admin surface, and the Leader clause
-- `contact_to_share` carries is for the Leader Dashboard.
--
-- Definer for the reason `contact_to_share` is one: `app.current_consent` is not
-- granted to `authenticated`, and a second definition of *current consent*
-- written against `consent_record` under the Admin's policy would drift.
create function public.pair_card_contacts(target_ministry_id uuid, target_relationship_id uuid)
returns table (person_id uuid, phone text, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.phone, p.email
    from public.relationship_member m
    join public.person p
      on p.id = m.person_id
     and p.ministry_id = m.ministry_id
   where m.ministry_id = target_ministry_id
     and m.relationship_id = target_relationship_id
     and m.ended_at is null
     and app.is_admin_of(target_ministry_id)
     and app.current_consent(p.id, 'contact_sharing') is true
$$;

comment on function public.pair_card_contacts(uuid, uuid) is
  'The phone and email of everyone in one relationship who currently agrees to '
  'share their contact details, for an Admin of its Ministry, and no row for '
  'anybody else. The same consent rule as public.contact_to_share, which Nudge '
  'reads (ADR-0010), with the email beside the number for the pair card.';

revoke execute on function public.pair_card_contacts(uuid, uuid) from public, anon, service_role;
grant execute on function public.pair_card_contacts(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The card's own reads, for one relationship
-- ---------------------------------------------------------------------------
-- Security invoker: every table here is read under the Admin's own policies, as
-- the pages that already read them do (`intake_submission`, `discipleship_goal`
-- and `relationship` under the Admin-only policies Suggested Pairs reads them
-- under, `material_assignment` as the Materials tab does, `concern_viewing` under
-- the policy that lets an Admin see who read what). Null for a relationship the
-- Admin cannot see, or one that has ended: there is no card for either.
--
-- The goal is what the latest submission said, as Suggested Pairs reads it: the
-- Ministry's current wording of the option chosen, or the words typed after
-- *Other* (`20261014000600_other_on_the_intake_goal.sql`), never both.
create function app.pair_card(target_ministry_id uuid, target_relationship_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'relationship_id', r.id,
    'name', r.name,
    'created_at', r.created_at,
    'accepted_at', r.accepted_at,

    -- One row per open membership. Who leads and who is discipled, and their
    -- names, come from the history the page already holds; these are the
    -- details the history does not carry.
    'people', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'person_id', m.person_id,
                'age_band', latest.age_band,
                'goal', g.label,
                'goal_other', latest.discipleship_goal_other,
                'phone', c.phone,
                'email', c.email))
         from public.relationship_member m
         left join lateral (
           select i.age_band, i.discipleship_goal_id, i.discipleship_goal_other
             from public.intake_submission i
            where i.person_id = m.person_id
            order by i.submitted_at desc, i.created_at desc, i.id desc
            limit 1
         ) latest on true
         left join public.discipleship_goal g
           on g.id = latest.discipleship_goal_id
         left join public.pair_card_contacts(target_ministry_id, target_relationship_id) c
           on c.person_id = m.person_id
        where m.ministry_id = target_ministry_id
          and m.relationship_id = r.id
          and m.ended_at is null),
      '[]'::jsonb
    ),

    -- The period running now: the Material, or none yet, and since when.
    'material', (
      select jsonb_build_object('title', mat.title, 'started_at', a.started_at)
        from public.material_assignment a
        left join public.material mat
          on mat.id = a.material_id
       where a.ministry_id = target_ministry_id
         and a.relationship_id = r.id
         and a.ended_at is null
       order by a.started_at desc
       limit 1
    ),

    -- Every reading of a Concern on this pair that is still unresolved, newest
    -- first, with the reader's name where they are on this Roster and whether
    -- it was the signed-in Admin's own. A resolved
    -- Concern's readings are left out: its words are gone and the card says
    -- nothing of it.
    'readings', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'concern_id', v.concern_id,
                'viewed_at', v.viewed_at,
                'viewer_name', reader.full_name,
                'by_this_reader', coalesce(v.viewed_by = (select auth.uid()), false))
              order by v.viewed_at desc, v.id)
         from public.concern_viewing v
         join public.concern c
           on c.id = v.concern_id
          and c.ministry_id = v.ministry_id
         left join public.person reader
           on reader.user_id = v.viewed_by
          and reader.ministry_id = v.ministry_id
        where v.ministry_id = target_ministry_id
          and c.relationship_id = r.id
          and c.resolved_at is null),
      '[]'::jsonb
    ),

    -- The signed-in Admin's own name, for the reading that opening the card
    -- records after this document is read.
    'reader_name', (
      select p.full_name
        from public.person p
       where p.ministry_id = target_ministry_id
         and p.user_id = (select auth.uid())
       limit 1
    )
  )
    from public.relationship r
   where r.id = target_relationship_id
     and r.ministry_id = target_ministry_id
     and r.ended_at is null;
$$;

revoke execute on function app.pair_card(uuid, uuid) from public, anon, service_role;
grant execute on function app.pair_card(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The Overview says which cards open the pair card
-- ---------------------------------------------------------------------------
-- A Group has a name; a one-to-one and a 1:2 pair have none
-- (`20261013000500_a_one_to_two_pair_has_no_name.sql`), and which of the two a
-- nameless one is follows who is in it now, which the history already says.
-- Never the kind, which is a capacity declaration and nothing else (ADR-0004).
-- So the Overview's document gains each unended relationship's name, and its
-- cards know which open the pair card. Everything else in it is
-- `20260926000100`'s unchanged, and Check-Ins, which aliases it, gains the same
-- key and reads nothing off it.
create or replace function public.overview_page()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  doc jsonb := app.page_session();
  ministry uuid;
begin
  if doc ->> 'session' <> 'admin' then return doc; end if;
  ministry := (doc -> 'admin' ->> 'ministry_id')::uuid;
  return doc || jsonb_build_object(
    'history', app.history_inputs(ministry),
    'relationship_names', coalesce(
      (select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name))
         from public.relationship r
        where r.ministry_id = ministry
          and r.ended_at is null),
      '[]'::jsonb
    )
  );
end;
$$;

-- Restated rather than assumed: `create or replace` keeps the grants, and a page
-- function open to `anon` is the drift the smoke loop exists to catch.
revoke execute on function public.overview_page() from public, anon, service_role;
grant execute on function public.overview_page() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The Overview with a card open
-- ---------------------------------------------------------------------------
-- Its own page function, so the edge log tells an Overview with a card open
-- from one without, and the Overview's document is not asked to take a
-- parameter every alias of it would have to pass along. `card` is null where
-- the address names a relationship this Admin cannot see or one that has ended.
create function public.overview_card_page(card_relationship_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  doc jsonb := public.overview_page();
begin
  if doc ->> 'session' <> 'admin' then return doc; end if;
  return doc || jsonb_build_object(
    'card', app.pair_card((doc -> 'admin' ->> 'ministry_id')::uuid, card_relationship_id)
  );
end;
$$;

revoke execute on function public.overview_card_page(uuid) from public, anon, service_role;
grant execute on function public.overview_card_page(uuid) to authenticated;
