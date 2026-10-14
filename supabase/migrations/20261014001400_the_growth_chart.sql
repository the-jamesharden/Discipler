-- The growth chart (Pastor feedback, ticket 05)
--
-- Overview gains a line of how many people were being discipled at the end of
-- each of the last twelve weeks, or of every month since the Ministry opened,
-- and now. Every point is derived from what is already stored; nothing new is
-- recorded and no table changes. What the Overview's document lacks is the
-- history behind a past point, because the history every Admin tab reads is
-- about now: it carries only the memberships still open and only the Pause
-- standing today. So the document gains one more part, `growth`, with
--
--   * when the Ministry was opened here,
--   * every relationship, ended or not, with its name, which is what tells a
--     Group from a pair (`20261014000700_the_pair_card.sql`; never the kind,
--     ADR-0004), and when it was formed, accepted and ended,
--   * every membership, ended or not, with when it started and ended, and a
--     Leader's own acceptance,
--   * every Pause and Resume, in the order they happened.
--
-- The counting is the domain's (`src/domain/growth.ts`), against the injected
-- clock and the Ministry Timezone, like every other number on the dashboard.
--
-- Only the Overview carries it. The Check-Ins tab reads the Overview's
-- document under another name and draws no chart, so the part both share
-- becomes `app.history_page()`, Check-Ins answers with that alone, and the
-- Overview adds the growth part to it. `overview_card_page` composes
-- `overview_page` and so carries it too: the chart stays under an open card.
-- ---------------------------------------------------------------------------

create function app.growth_inputs(target_ministry_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'opened_at', (select m.created_at from public.ministry m where m.id = target_ministry_id),
    'relationships', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', r.id,
                'name', r.name,
                'created_at', r.created_at,
                'accepted_at', r.accepted_at,
                'ended_at', r.ended_at
              ))
         from public.relationship r
        where r.ministry_id = target_ministry_id),
      '[]'::jsonb
    ),
    'members', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'relationship_id', m.relationship_id,
                'person_id', m.person_id,
                'role', m.role,
                'started_at', m.started_at,
                'ended_at', m.ended_at,
                'accepted_at', m.accepted_at
              ))
         from public.relationship_member m
        where m.ministry_id = target_ministry_id),
      '[]'::jsonb
    ),
    -- Every Pause and Resume, not only the one standing: a point last month
    -- has to know whether the relationship was paused then. Ordered as
    -- `relationship_pauses` orders them, so two at the same instant are read in
    -- the order they were recorded.
    'pauses', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'relationship_id', e.subject_id,
                'type', e.type,
                'occurred_at', e.occurred_at
              ) order by e.occurred_at, e.recorded_at)
         from public.ministry_event e
        where e.ministry_id = target_ministry_id
          and e.subject_type = 'relationship'
          and e.type in ('relationship.paused', 'relationship.resumed')),
      '[]'::jsonb
    )
  );
$$;

revoke execute on function app.growth_inputs(uuid) from public, anon, service_role;
grant execute on function app.growth_inputs(uuid) to authenticated;

-- What `overview_page` answered until now, unchanged: the session verdict, the
-- history and each unended relationship's name. Check-Ins is this and nothing
-- more.
create function app.history_page()
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

revoke execute on function app.history_page() from public, anon, service_role;
grant execute on function app.history_page() to authenticated;

create or replace function public.overview_page()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  doc jsonb := app.history_page();
begin
  if doc ->> 'session' <> 'admin' then return doc; end if;
  return doc || jsonb_build_object(
    'growth', app.growth_inputs((doc -> 'admin' ->> 'ministry_id')::uuid)
  );
end;
$$;

revoke execute on function public.overview_page() from public, anon, service_role;
grant execute on function public.overview_page() to authenticated;

create or replace function public.check_ins_page()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app.history_page();
$$;

revoke execute on function public.check_ins_page() from public, anon, service_role;
grant execute on function public.check_ins_page() to authenticated;
