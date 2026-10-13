-- Check-Ins opens the card (Pastor feedback, ticket 09)
--
-- Every relationship listed on Check-Ins opens the pair card over the tab, as
-- every card on the Overview does (tickets 07 and 08), and the concern column
-- lists its pairs by name instead of a sealed count. The card is the tab's own
-- page at `?card=`, so it is one read like every page (ADR-0023):
-- `check_ins_card_page` is the Check-Ins document with the card beside it,
-- composed exactly as `overview_card_page` composes the Overview's.
--
-- On Check-Ins the card's band is this week's answer. Where that answer raised a
-- Concern still unresolved, the band is that Concern's, its words under the
-- week's line; any other unresolved Concern on the pair keeps its own band.
-- Which Concern this week's answer raised is the exact join `concern_open`
-- already makes in `relationship_week_answers`: the Concern records the prompt
-- that carried its words, and the prompt belongs to one conversation. So the
-- card is handed, for each of its unresolved Concerns, the conversation that
-- raised it, and the reader matches it against this week's. Never by
-- `raised_at` falling inside the week, which goes wrong on the day a Leader
-- answers last week's abandoned conversation and this week's inside one seven
-- days (`20260921000200_the_overview_and_the_check_ins.sql`).
--
-- Beside the card rather than inside `app.pair_card`, which Follow-Up's card
-- (ticket 10) composes too: only Check-Ins asks which week a Concern came from.
--
-- Nothing here reads a Concern's words. `prompt_id` is the one column of
-- `concern` beyond the history's that the authenticated role may read, granted
-- by that same migration; the words are still reached one at a time through the
-- `concern.view` command, which the page runs as the card opens.
-- ---------------------------------------------------------------------------

create function public.check_ins_card_page(card_relationship_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  doc jsonb := public.check_ins_page();
  ministry uuid;
begin
  if doc ->> 'session' <> 'admin' then return doc; end if;
  ministry := (doc -> 'admin' ->> 'ministry_id')::uuid;
  return doc || jsonb_build_object(
    'card', app.pair_card(ministry, card_relationship_id),
    'card_concern_sequences', coalesce(
      (select jsonb_agg(jsonb_build_object('concern_id', c.id, 'sequence_id', p.sequence_id))
         from public.concern c
         join public.checkin_prompt p
           on p.id = c.prompt_id
        where c.ministry_id = ministry
          and c.relationship_id = card_relationship_id
          and c.resolved_at is null),
      '[]'::jsonb
    )
  );
end;
$$;

revoke execute on function public.check_ins_card_page(uuid) from public, anon, service_role;
grant execute on function public.check_ins_card_page(uuid) to authenticated;
