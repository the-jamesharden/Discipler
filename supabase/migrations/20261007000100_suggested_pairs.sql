-- Core operating loop, ticket 04 -- Suggested Pairs
--
-- The Suggested Pairs tab has rendered an empty state since the page existed,
-- reading `overview_page()` for its badge and nothing else. The ranking is a pure
-- function in `src/domain/suggestions.ts`; this is what it is fed.
--
-- The Roster's document already says who everyone is, their Participation Status,
-- which side they offered at Intake, their gender, and every open membership with
-- the cap it counts against and whether it has been accepted. Four things the
-- ranking needs are on no document: the age band, the Discipleship Goal, the
-- availability, and when the latest Intake was given. And the pools need the
-- current decision on texts for somebody already Paired, whose Participation
-- Status no longer says whether they consented.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- What each Person's latest Intake said, for suggestion
-- ---------------------------------------------------------------------------
-- One row per Person on the Ministry's Roster who has submitted an Intake, from
-- their most recent submission: the answers being ranked are the ones they last
-- gave, which is how `app.current_gender` already reads *current*. Somebody with
-- no submission has no row, and is in neither pool.
--
-- `security definer` with the Admin test written into it, the shape `roster()`
-- has and for the reason it has it: the current decision on texts is
-- `app.current_consent`, which is deliberately not granted to `authenticated`.
-- Restating that rule here against `consent_record` under the Admin's own policy
-- would be a second definition of *current consent*, and two definitions drift.
-- Everything else read here an Admin can already read under the policies on
-- `intake_submission`, `intake_availability` and `discipleship_goal`, so nothing
-- is disclosed that was not.
--
-- The availability is slot keys, `monday:08`, spelled as the form, the URL and the
-- domain spell them (ADR-0018). The goal is its id and the Ministry's current
-- wording of it, null where the Ministry retired the option they chose.
create function public.suggestion_inputs(target_ministry_id uuid)
returns table (
  person_id uuid,
  intake_submitted_at timestamptz,
  consents_to_texts boolean,
  age_band public.age_band,
  goal_id uuid,
  goal_label text,
  availability text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         latest.submitted_at,
         app.current_consent(p.id, 'sms') is true,
         latest.age_band,
         g.id,
         g.label,
         coalesce(
           (select array_agg(a.day::text || ':' || a.hour::text order by a.day, a.hour)
              from public.intake_availability a
             where a.intake_submission_id = latest.id),
           '{}'::text[]
         )
    from public.person p
   cross join lateral (
     select i.id, i.submitted_at, i.age_band, i.discipleship_goal_id
       from public.intake_submission i
      where i.person_id = p.id
      order by i.submitted_at desc, i.created_at desc, i.id desc
      limit 1
   ) latest
    left join public.discipleship_goal g on g.id = latest.discipleship_goal_id
   where p.ministry_id = target_ministry_id
     and app.is_admin_of(target_ministry_id);
$$;

comment on function public.suggestion_inputs(uuid) is
  'What each Person''s most recent Intake said, as Suggested Pairs ranks it: when '
  'it was given, whether their current decision on texts is yes, their age band, '
  'their Discipleship Goal as id and current wording, and the slots they selected '
  'as monday:08 keys. One row per Person with a submission; none for anyone '
  'without. Definer with the Admin test inside, like public.roster, because the '
  'consent rule is app.current_consent and that is not granted to authenticated.';

revoke execute on function public.suggestion_inputs(uuid) from public, anon, service_role;
grant execute on function public.suggestion_inputs(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The Suggested Pairs page reads for itself
-- ---------------------------------------------------------------------------
-- The Roster's document, so the pools are drawn from exactly the rows the Roster
-- shows and one read stays one read (ADR-0023), with the two pairing settings and
-- the inputs above beside it. The history rides in the Roster's document already,
-- which is what the shell's badge is counted from.
--
-- `create or replace`, because the return type does not change: the function was
-- an alias of `overview_page()`, and every key the old reader took from it --
-- the session verdict, the Admin, the history -- is in this document too.
create or replace function public.suggested_pairs_page()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  doc jsonb := public.roster_page();
  ministry uuid;
begin
  if doc ->> 'session' <> 'admin' then return doc; end if;
  ministry := (doc -> 'admin' ->> 'ministry_id')::uuid;
  return doc || jsonb_build_object(
    -- The two constraints, off the Ministry row under the membership policy, as
    -- `settings_page()` reads them. Never constants: a Ministry varies both.
    'suggest_gender_match', (select m.suggest_gender_match
                               from public.ministry m
                              where m.id = ministry),
    'suggest_max_age_band_gap', (select m.suggest_max_age_band_gap
                                   from public.ministry m
                                  where m.id = ministry),
    'suggestion_inputs', coalesce(
      (select jsonb_agg(to_jsonb(s)) from public.suggestion_inputs(ministry) s),
      '[]'::jsonb
    )
  );
end;
$$;

-- Restated rather than assumed. `create or replace` keeps the grants of the
-- function it replaces, and a page function open to `anon` is the drift the
-- smoke loop exists to catch.
revoke execute on function public.suggested_pairs_page() from public, anon, service_role;
grant execute on function public.suggested_pairs_page() to authenticated;
