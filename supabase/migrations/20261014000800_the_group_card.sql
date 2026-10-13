-- The group card (Pastor feedback, ticket 08)
--
-- Clicking a Group on the Overview opens the pair card in its group form: the
-- Group's name, the gender it declared and since when, its leader in full, and a
-- row per Disciple. The same card, read by the same function, so a Group cannot
-- be shown one way on the Overview and another on Check-Ins or Follow-Up.
--
-- `app.pair_card` (`20261014000700_the_pair_card.sql`) already carries what a
-- Group's card shows of its people, everyone in it with an open membership, and
-- the Group's name. The one thing it does not carry is the declaration, which
-- the head says (*Group · women · formed 7 Sep*). So the function is restated
-- whole from that migration with the one key added, and everything it returned
-- before it still returns.
--
-- The Overview's page functions are untouched: `overview_card_page` composes
-- `app.pair_card` by name and picks this up as it is.
-- ---------------------------------------------------------------------------

create or replace function app.pair_card(target_ministry_id uuid, target_relationship_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'relationship_id', r.id,
    'name', r.name,
    -- Said on a Group's card (ticket 08): null where it declared none, which
    -- for a Group is mixed. Immutable since formation, so it is what the Group
    -- has always been.
    'declared_gender', r.declared_gender,
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
