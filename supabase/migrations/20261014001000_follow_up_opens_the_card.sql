-- Follow-Up opens the card (Pastor feedback, ticket 10)
--
-- Each item on Follow-Up becomes one button, and pressing it opens the pair
-- card of ticket 07, or the group card of ticket 08, in a fuller form: the
-- item and its action in the band, and under the facts a *What has happened*
-- list read from the stored history. The card is the Follow-Up tab's own page
-- at `?card=`, so it is one read like every page (ADR-0023):
-- `follow_up_card_page` is the tab's document with the card beside it, as
-- `overview_card_page` is the Overview's.
--
-- `card` is a relationship's id for everything about a relationship that has
-- not ended, which opens `app.pair_card` exactly as the Overview does. An item
-- about a Person and no live relationship (*Wants a group*, *Texted a keyword*,
-- *Pair not made*) has no pair to open, so its card is named by the item's own
-- id and shows the Person it is about.
--
-- Most of what the fuller card lists is already in the history every Admin tab
-- reads: the open items, the weeks and their answers, the unresolved Concerns,
-- and, through `app.pair_card`, who has read them. What is not is gathered
-- here: the items an Admin resolved before, and by whom; the Concerns resolved
-- before, without their words, which resolving cleared; and the details of
-- whoever an open item is about, behind the consent check Nudge reads.
--
-- Opening the card is the reveal *See contact details* was, and records what
-- that kept, which is nothing (ADR-0010): the details reach the page through
-- the consent check and nothing is written. Nothing here reads a Concern's
-- words; the page reads those through `concern.view` as the card opens, as the
-- Overview's does.
--
-- `follow_up_page` is untouched: its `reveal_person_id` is now passed by
-- nothing, and is left for the round's integrator to drop once every
-- migration of the round has landed, as ticket 08 left `relationship_names`.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. One Person's contact details, as the card may show them
-- ---------------------------------------------------------------------------
-- `public.pair_card_contacts` for somebody the card is about who is not one of
-- its people: a Person with no pair, or one who asked to join a group or was
-- invited to lead one. The same predicate, `app.current_consent(p.id,
-- 'contact_sharing') is true`, which `public.contact_to_share` carries: the
-- number and email reach the card only while the Person's current decision is
-- yes, and NULL, never asked, is no. Definer for the reason the other two are:
-- `app.current_consent` is not granted to `authenticated`.
create function public.person_card_contacts(target_ministry_id uuid, target_person_id uuid)
returns table (person_id uuid, phone text, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.phone, p.email
    from public.person p
   where p.ministry_id = target_ministry_id
     and p.id = target_person_id
     and app.is_admin_of(target_ministry_id)
     and app.current_consent(p.id, 'contact_sharing') is true
$$;

comment on function public.person_card_contacts(uuid, uuid) is
  'The phone and email of one Person who currently agrees to share their contact '
  'details, for an Admin of their Ministry, and no row otherwise. The consent rule '
  'of public.contact_to_share, which Nudge reads (ADR-0010), and of '
  'public.pair_card_contacts, for somebody a Follow-Up card is about who is not '
  'one of its pair.';

revoke execute on function public.person_card_contacts(uuid, uuid) from public, anon, service_role;
grant execute on function public.person_card_contacts(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. What the fuller card adds, for the one card the address names
-- ---------------------------------------------------------------------------
-- Security invoker: every table is read under the Admin's own policies, as the
-- tabs already read them (`follow_up_item` and `concern` as Care Needed reads
-- them, `intake_submission` and `discipleship_goal` as the pair card does).
--
-- `subjects`: whoever an open item on this card is about, with their latest
-- Intake's age band and goal and, behind consent, their phone and email.
--
-- `earlier`: the items an Admin resolved before. On a relationship's card,
-- every resolved item about it; on an item's own card, every resolved item
-- about its Person or its relationship. Newest first, with who resolved each
-- where they are still on this Roster.
--
-- `earlier_concerns`: the relationship's resolved Concerns, who raised each and
-- who resolved it. Never `detail`, which resolving cleared and which
-- `authenticated` holds no grant on.
create function app.follow_up_card(target_ministry_id uuid, card_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with named as (
    -- The item the card is named by, where it is named by an item.
    select f.person_id, f.relationship_id
      from public.follow_up_item f
     where f.ministry_id = target_ministry_id
       and f.id = card_id
  ),
  standing as (
    select distinct f.person_id
      from public.follow_up_item f
     where f.ministry_id = target_ministry_id
       and f.resolved_at is null
       and f.person_id is not null
       and (f.relationship_id = card_id or f.id = card_id)
  )
  select jsonb_build_object(
    'subjects', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'person_id', s.person_id,
                'age_band', latest.age_band,
                'goal', g.label,
                'goal_other', latest.discipleship_goal_other,
                'phone', c.phone,
                'email', c.email))
         from standing s
         left join lateral (
           select i.age_band, i.discipleship_goal_id, i.discipleship_goal_other
             from public.intake_submission i
            where i.person_id = s.person_id
            order by i.submitted_at desc, i.created_at desc, i.id desc
            limit 1
         ) latest on true
         left join public.discipleship_goal g
           on g.id = latest.discipleship_goal_id
         left join lateral public.person_card_contacts(target_ministry_id, s.person_id) c
           on true),
      '[]'::jsonb
    ),

    'earlier', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', f.id,
                'kind', f.kind,
                'payload', f.payload,
                'raised_at', f.raised_at,
                'resolved_at', f.resolved_at,
                'person_name', who.full_name,
                'resolver_name', resolver.full_name)
              order by f.raised_at desc, f.id)
         from public.follow_up_item f
         left join public.person who
           on who.id = f.person_id
          and who.ministry_id = f.ministry_id
         left join public.person resolver
           on resolver.user_id = f.resolved_by
          and resolver.ministry_id = f.ministry_id
        where f.ministry_id = target_ministry_id
          and f.resolved_at is not null
          and (f.relationship_id = card_id
               or exists (
                 select 1 from named n
                  where n.person_id = f.person_id
                     or n.relationship_id = f.relationship_id
               ))),
      '[]'::jsonb
    ),

    'earlier_concerns', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', c.id,
                'raised_at', c.raised_at,
                'raised_by_name', raiser.full_name,
                'resolved_at', c.resolved_at,
                'resolver_name', resolver.full_name)
              order by c.raised_at desc, c.id)
         from public.concern c
         left join public.person raiser
           on raiser.id = c.raised_by
          and raiser.ministry_id = c.ministry_id
         left join public.person resolver
           on resolver.user_id = c.resolved_by
          and resolver.ministry_id = c.ministry_id
        where c.ministry_id = target_ministry_id
          and c.relationship_id = card_id
          and c.resolved_at is not null),
      '[]'::jsonb
    )
  );
$$;

revoke execute on function app.follow_up_card(uuid, uuid) from public, anon, service_role;
grant execute on function app.follow_up_card(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The Follow-Up tab with a card open
-- ---------------------------------------------------------------------------
-- Its own page function, as `overview_card_page` is, so the edge log tells the
-- tab with a card open from the tab without one. `card` is the relationship's
-- pair card, null where `card_id` names no relationship this Admin can see that
-- has not ended; `follow_up_card` is what the fuller card adds.
create function public.follow_up_card_page(card_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  doc jsonb := public.follow_up_page(null);
  ministry uuid;
begin
  if doc ->> 'session' <> 'admin' then return doc; end if;
  ministry := (doc -> 'admin' ->> 'ministry_id')::uuid;
  return doc || jsonb_build_object(
    'card', app.pair_card(ministry, card_id),
    'follow_up_card', app.follow_up_card(ministry, card_id)
  );
end;
$$;

revoke execute on function public.follow_up_card_page(uuid) from public, anon, service_role;
grant execute on function public.follow_up_card_page(uuid) to authenticated;
