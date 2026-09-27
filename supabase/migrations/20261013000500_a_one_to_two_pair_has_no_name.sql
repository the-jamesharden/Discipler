-- A 1:2 pair has no name (Roles per pairing, ticket 05).
--
-- James, 2026-09-27: a 1:2 pair keeps no name. Until now the Pair popup built
-- one in the browser, `{First} with {First} & {First}` ("Claire with Ana & Sam"),
-- and posted it as the ordinary name, with nothing to mark it as generated. The
-- manual-pairing spec said that name was never shown, yet every text named the
-- pair by it, the public Group Intake Link offered the pair by it, and Admin
-- screens asked about it by it. From now on the popup posts none and the
-- forming command keeps none; this clears the ones already stored, so the texts
-- name each pair by its people and it leaves the link, which offers only a group
-- with a name (`groups_open_to_join`).
--
-- Nothing marks a generated name, so it is recognised by the formula: the name
-- equals the formula applied to the people the relationship was formed with,
-- one Discipler and two Disciples, read from its `relationship.created` history,
-- with the Disciples in either order. First names are split out of `full_name`
-- as the popup split them: trimmed, runs of whitespace made one, the first word.
-- A name an Admin typed is left alone, a name on a Group of the same three people
-- included, unless it is word for word what the popup would have built. So is a
-- name on a relationship formed any other way, and one whose people have been
-- renamed since, which the formula no longer describes.
--
-- History keeps the old name: `relationship.created` recorded it, and
-- `ministry_event` is append-only. Nothing new is recorded. An Admin's rename is
-- recorded as `relationship.group_configured`, with who made it; this is no
-- Admin's act, and there is nobody to name.
--
-- Ids are compared as text, so a payload holding anything but a uuid matches
-- nobody instead of failing the migration.
with formed_as_one_to_two as (
  select e.subject_id                        as relationship_id,
         e.ministry_id,
         e.payload -> 'leaderIds' ->> 0      as leader_id,
         e.payload -> 'participantIds' ->> 0 as one_id,
         e.payload -> 'participantIds' ->> 1 as other_id
    from public.ministry_event e
   where e.type = 'relationship.created'
     and e.subject_type = 'relationship'
     and jsonb_typeof(e.payload -> 'leaderIds') = 'array'
     and jsonb_typeof(e.payload -> 'participantIds') = 'array'
     and jsonb_array_length(e.payload -> 'leaderIds') = 1
     and jsonb_array_length(e.payload -> 'participantIds') = 2
),
first_names as (
  select f.relationship_id,
         f.ministry_id,
         split_part(regexp_replace(btrim(l.full_name), '\s+', ' ', 'g'), ' ', 1) as leader,
         split_part(regexp_replace(btrim(a.full_name), '\s+', ' ', 'g'), ' ', 1) as one,
         split_part(regexp_replace(btrim(b.full_name), '\s+', ' ', 'g'), ' ', 1) as other
    from formed_as_one_to_two f
    join public.person l on l.id::text = f.leader_id
    join public.person a on a.id::text = f.one_id
    join public.person b on b.id::text = f.other_id
)
update public.relationship r
   set name = null
  from first_names n
 where r.id = n.relationship_id
   and r.ministry_id = n.ministry_id
   and r.name in (n.leader || ' with ' || n.one || ' & ' || n.other,
                  n.leader || ' with ' || n.other || ' & ' || n.one);
