-- Manual pairing, ticket 08 -- The Ministry's groups on the Pair document
--
-- The Pair popup is about to list the groups an Admin could put somebody into,
-- and grey the ones that Person cannot join (`.scratch/manual-pairing/spec.md`,
-- *Joining an existing group*). The document it reads carries candidates,
-- genders, the gender-match setting and Materials, and nothing about groups.
--
-- `groups_open_to_join` is not this read. That one feeds the Intake form's
-- dropdown for somebody with no session: accepted, named groups only. An Admin
-- is shown every group that is open, named or not, accepted or not.
--
-- Nothing on any screen changes here, as nothing did in ticket 01.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The groups somebody could be put into
-- ---------------------------------------------------------------------------
-- Every open relationship with two or more Disciples, which takes in a 1:2 pair
-- and leaves out a one-to-one.
--
-- *Two or more* is the live count of open participant memberships and never
-- `kind`, which is a capacity declaration and says nothing about who is in the
-- relationship today (ADR-0004). A relationship formed as a group that is down
-- to one Disciple is not listed.
--
-- `ended_at is null` is stated although the count already implies it: ending a
-- relationship closes its memberships in the same transaction, so an ended or
-- cancelled one has no open Disciples to count. The count is a consequence of
-- that invariant and this line is the rule.
--
-- What each row carries is what the popup says about a group: its name, its
-- declaration, its state when it is not running, who leads it, how many
-- Disciples it has, and everybody in it in either role, so the popup can leave
-- out a group the Person is already in without a second read. The name is whatever the column holds, null included: nothing is
-- backfilled or guessed here, and how an unnamed row is labelled is the
-- popup's. `declared_gender` null is *mixed*, as it is on the column.
--
-- `state` is null while the group is running, `awaiting_leader_acceptance`
-- where nobody has accepted it, and `paused` where a Pause stands on it.
-- Awaiting wins over paused, the order `deriveRelationshipState` settles the two
-- in: a relationship nobody has accepted has nothing running to pause. A Pause
-- whose period has run out still stands until somebody resumes it, as it does on
-- every other surface.
--
-- The Pauses are handed in rather than asked for again. They already ride in
-- this same document under `history.pauses`, from `public.relationship_pauses`,
-- and `pair_page()` passes that list here, so *paused* on a group row and
-- *paused* on the Overview are one evaluation of one question and cannot
-- disagree inside one document.
--
-- `security invoker`, like `app.history_inputs` beside it: the rows come back
-- under the caller's own policies on `relationship`, `relationship_member` and
-- `person`, so another Ministry's group is not a row this can return whatever
-- argument it is handed. `pair_page()` hands it the Ministry the session
-- administers, and only when the session is an Admin's.
--
-- Ordered by name, then formation, then id. The id is what makes the order
-- total: two unnamed groups formed in one statement share everything else, and
-- a list a test or a screen reads twice has to read the same way twice.
create function app.pair_groups(target_ministry_id uuid, standing_pauses jsonb)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'name', r.name,
        'declared_gender', r.declared_gender,
        'state', case
          when r.accepted_at is null then 'awaiting_leader_acceptance'
          when r.id in (select (p ->> 'relationship_id')::uuid
                          from jsonb_array_elements(standing_pauses) p) then 'paused'
        end,
        'disciple_count', live.disciple_count,
        'member_ids', live.member_ids,
        'leaders', coalesce(
          (select jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name)
                            order by p.full_name, p.id)
             from public.person p
            where p.id in (select l.person_id
                             from public.relationship_member l
                            where l.relationship_id = r.id
                              and l.role = 'leader'
                              and l.ended_at is null)),
          '[]'::jsonb
        )
      )
      order by r.name nulls last, r.created_at, r.id
    ),
    '[]'::jsonb
  )
    from public.relationship r
   cross join lateral (
     select count(distinct m.person_id) filter (where m.role = 'participant') as disciple_count,
            jsonb_agg(distinct m.person_id order by m.person_id) as member_ids
       from public.relationship_member m
      where m.relationship_id = r.id
        and m.ended_at is null
   ) live
   where r.ministry_id = target_ministry_id
     and r.ended_at is null
     and live.disciple_count >= 2;
$$;

comment on function app.pair_groups(uuid, jsonb) is
  'The groups an Admin could put somebody into, for the Pair document: every '
  'open relationship in this Ministry with two or more open participant '
  'memberships, 1:2 pairs included, accepted or not, named or not. The count is '
  'live and never the relationship''s kind (ADR-0004). Each carries its name as '
  'the column holds it, its declared gender with null meaning mixed, its state '
  'when it is not running, its leaders, its count of Disciples, and everybody '
  'in it in either role. The state is awaiting_leader_acceptance, paused or '
  'null, awaiting first; paused is decided against the standing Pauses handed '
  'in, which are the ones history.pauses carries in the same document. '
  'Invoker, so the rows are the ones the caller''s policies show.';

revoke execute on function app.pair_groups(uuid, jsonb) from public, anon, service_role;
grant execute on function app.pair_groups(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- The Pair page carries them
-- ---------------------------------------------------------------------------
-- A third key beside the two ticket 01 added, so it is still one page read
-- (`docs/adr/0023-a-page-is-one-read.md`): the groups travel in the document
-- the popup already reads, and no request is added beside it. `roster_page()`
-- and `person_page()` are not touched, so the Roster's own document is what it
-- was.
--
-- `create or replace`, because the return type does not change. The first two
-- keys are restated exactly as `20260929000100` left them.
create or replace function public.pair_page()
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
    -- Whether the absolute gender match on a one-to-one is enforced, which is
    -- whether the form may offer Mixed for one. The trigger is what enforces
    -- it; this is so the form does not offer what the trigger would refuse.
    'suggest_gender_match', (select m.suggest_gender_match
                               from public.ministry m
                              where m.id = ministry),

    -- Every Material the Ministry holds, removed ones included, in title order:
    -- the rows `materials_page()` builds, with the columns a select needs. The
    -- reader keeps a removed one off the list, as the Materials tab's does.
    'materials', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', m.id,
                'title', m.title,
                'removed', m.removed)
              order by m.title, m.created_at)
         from public.material m
        where m.ministry_id = ministry),
      '[]'::jsonb
    ),

    -- The groups somebody could be put into: running, paused or still awaiting
    -- their leader, and never an ended or cancelled one.
    'groups', app.pair_groups(ministry, doc -> 'history' -> 'pauses')
  );
end;
$$;

-- Restated rather than assumed. `create or replace` keeps the grants of the
-- function it replaces, and a page function open to `anon` is the drift the
-- smoke loop exists to catch.
revoke execute on function public.pair_page() from public, anon, service_role;
grant execute on function public.pair_page() to authenticated;
