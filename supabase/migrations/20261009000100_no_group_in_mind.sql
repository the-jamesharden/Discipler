-- Group form exits, ticket 01 -- No group in mind
--
-- The group form's step three gains a last option, "I don't have a group in
-- mind". A Person who chooses it lands on the Roster with the group path
-- recorded and no group named, and a Follow-Up Item is raised carrying them, so
-- the decision waiting on an Admin cannot scroll out of view. It is closed by an
-- Admin putting them into a group, which is `group.add_participant` -- the act
-- Manual pairing built for the Roster -- or by resolving it alone.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The Follow-Up Item
-- ---------------------------------------------------------------------------
-- Named for the condition, as every kind is. Raised by the Intake submission and
-- closed by an Admin, never by anything else. It carries the Person and nothing
-- else: which group they might fit is the Admin's decision, and what they
-- answered about themselves is read off their Intake when the list is drawn.
alter type follow_up_kind add value 'group_placement_wanted';

-- Rebuilt rather than added beside, as `20260923000200` did, and on `kind::text`
-- so the value added a statement ago can be named here at all. The new kind
-- carries nothing, and says so rather than falling to the `else`: a payload on
-- it would be a fact nobody reads.
alter table follow_up_item
  drop constraint follow_up_item_payload_matches_kind;

alter table follow_up_item
  add constraint follow_up_item_payload_matches_kind
    check (
      (case kind::text
         when 'pause_expired'
           then payload -> 'periodWeeks' in ('1'::jsonb, '2'::jsonb, '4'::jsonb,
                                             '8'::jsonb, '12'::jsonb)
         when 'swap_requested'
           then payload ->> 'requestedBy' in ('leader', 'participant')
         when 'participant_keyword'
           then jsonb_typeof(payload -> 'keyword') = 'string'
            and length(btrim(payload ->> 'keyword')) > 0
         when 'intended_pairing_refused'
           then jsonb_typeof(payload -> 'intendedPairingId') = 'string'
            and jsonb_typeof(payload -> 'refusal') = 'string'
            and length(btrim(payload ->> 'refusal')) > 0
         when 'group_placement_wanted'
           then payload = '{}'::jsonb
         else true
       end) is true
    );

-- A Person and no relationship. This is what makes the one-open-item index,
-- `follow_up_item_one_open_per_subject` on (ministry, kind, person,
-- relationship) with nulls not distinct, hold one open item per Person: with the
-- relationship always null, a second submission with no group in mind collides
-- with the first rather than filing a second item beside it.
alter table follow_up_item
  add constraint follow_up_item_placement_names_only_a_person
    check (
      kind::text <> 'group_placement_wanted'
      or (person_id is not null and relationship_id is null)
    );

-- ---------------------------------------------------------------------------
-- What the item shows
-- ---------------------------------------------------------------------------
-- Every open `group_placement_wanted` item, with what the Person answered about
-- themselves on their latest Intake submission: gender, age band and the slots
-- they are free. The latest, because that is what the Admin places them on, and
-- because a submission after the one that raised the item is a correction.
--
-- A definer, like `group_join_requests`, because `intake_submission` and
-- `intake_availability` are not what a browser session reads; gated on
-- `app.is_admin_of`, so an Admin of the Ministry and nobody else. The slots
-- travel as the grid's own keys (`tuesday:18`), which the domain reads.
create function public.group_placements_wanted(target_ministry_id uuid)
returns table (
  item_id uuid,
  person_id uuid,
  gender public.gender,
  age_band public.age_band,
  availability text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id,
         f.person_id,
         latest.gender,
         latest.age_band,
         coalesce(
           (select array_agg(a.day::text || ':' || a.hour::text order by a.day, a.hour)
              from public.intake_availability a
             where a.intake_submission_id = latest.id),
           array[]::text[]
         )
    from public.follow_up_item f
    left join lateral (
      select i.id, i.gender, i.age_band
        from public.intake_submission i
       where i.person_id = f.person_id
       order by i.submitted_at desc, i.created_at desc, i.id desc
       limit 1
    ) latest on true
   where f.ministry_id = target_ministry_id
     and f.kind::text = 'group_placement_wanted'
     and f.resolved_at is null
     and app.is_admin_of(target_ministry_id)
   order by f.raised_at, f.id;
$$;

comment on function public.group_placements_wanted(uuid) is
  'Everybody who signed up on the group link with no group in mind and has not '
  'been placed, with the gender, age band and availability of their latest Intake '
  'submission. An Admin of the Ministry and nobody else.';

revoke execute on function public.group_placements_wanted(uuid) from public, anon, service_role;
grant execute on function public.group_placements_wanted(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The Follow-Up tab carries them
-- ---------------------------------------------------------------------------
-- The page's document gains `placements`: the rows above, and the groups the
-- group form offers, which are the groups a Person may be placed in -- accepted,
-- named, unended groups, filtered on the Person's gender beside each item by
-- the app, exactly as the form filters them. Both are read only when an item
-- stands, so a Ministry with none pays for nothing. Everything else in the
-- document is `20260926000100`'s unchanged.
create or replace function public.follow_up_page(reveal_person_id uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  doc jsonb := app.page_session();
  ministry uuid;
  wanted jsonb;
begin
  if doc ->> 'session' <> 'admin' then return doc; end if;
  ministry := (doc -> 'admin' ->> 'ministry_id')::uuid;

  wanted := coalesce(
    (select jsonb_agg(to_jsonb(w)) from public.group_placements_wanted(ministry) w),
    '[]'::jsonb
  );

  return doc || jsonb_build_object(
    'history', app.history_inputs(ministry),
    'reveal', case
      when reveal_person_id is null then null
      else (select to_jsonb(c) from public.contact_to_share(ministry, reveal_person_id) c limit 1)
    end,
    'placements', jsonb_build_object(
      'wanted', wanted,
      'groups', case
        when jsonb_array_length(wanted) = 0 then '[]'::jsonb
        else coalesce(
          (select jsonb_agg(jsonb_build_object(
                    'relationship_id', g.relationship_id,
                    'name', g.name,
                    'declared_gender', g.declared_gender))
             from public.groups_open_to_join(ministry) g),
          '[]'::jsonb
        )
      end
    )
  );
end;
$$;
