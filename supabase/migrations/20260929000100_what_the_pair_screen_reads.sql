-- Manual pairing, ticket 01 -- What the Pair screen reads
--
-- The pairing form is about to grey a Disciple who does not match the
-- declaration, offer or withhold Mixed for a one-to-one, and fill a Material
-- select (`.scratch/manual-pairing/spec.md`). It can do none of the three from
-- the document it reads today: `pair_page()` is the Roster's document under
-- another name, and the Roster's document carries no gender, no Ministry
-- setting and no Materials.
--
-- The page-function migration named the Pair page for itself so that "a page
-- that one day reads differently moves nobody else's document". This is that
-- day. Nothing on any screen changes here.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The Roster carries each Person's gender
-- ---------------------------------------------------------------------------
-- On the Roster's own function rather than only on the Pair page's document,
-- deliberately: one shape stays one shape, and a second projection of the same
-- rows is how two readers eventually disagree.
--
-- Dropped and recreated rather than replaced, because the result widens by one
-- column and Postgres refuses to change an existing function's return type in
-- place. The same move tickets 27, 28 and 36 made.
--
-- The gender comes out of `app.current_gender`, so the Roster and the triggers
-- that enforce the match read one definition of *current*: the most recent
-- submission, and null where there has never been one. It leaves through the
-- Admin test inside this function, exactly as the phone and email do under
-- ADR-0021, and it is less disclosing than the number beside it. No column
-- grant on `intake_submission` is added.
drop function public.roster(uuid);

create function public.roster(target_ministry_id uuid)
returns table (
  person_id uuid,
  full_name text,
  participation_status public.participation_status,
  declared_side public.declared_side,
  first_time boolean,
  holds_an_account boolean,
  phone text,
  email text,
  gender public.gender
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         p.full_name,
         public.participation_status(p),
         (select c.declared_side
            from public.consent_record c
           where c.person_id = p.id
             and c.declared_side is not null
           order by c.decided_at desc, c.created_at desc
           limit 1),
         (select i.first_time
            from public.intake_submission i
           where i.person_id = p.id
             and i.first_time is not null
           order by i.submitted_at desc, i.created_at desc
           limit 1),
         p.user_id is not null,
         p.phone,
         p.email,
         app.current_gender(p.id)
    from public.person p
   where p.ministry_id = target_ministry_id
     and app.is_admin_of(target_ministry_id)
   order by p.full_name;
$$;

comment on function public.roster(uuid) is
  'One Ministry''s Roster as the Admin surface shows it: who is on it, each '
  'Person''s derived Participation Status, which side they last offered to stand '
  'on at Intake, whether their latest submission said this is their first time, '
  'whether they hold an account that could be reset, their phone number and '
  'email, and the gender on their most recent Intake submission. The contact '
  'details are for an Admin and reach a screen only through the Admin test here '
  '(ADR-0021); a Leader session still reaches a number only through '
  'public.contact_to_share. The gender leaves by the same Admin test and is '
  'there for the pairing surface alone, which greys a Disciple who does not '
  'match what a relationship declares; NULL is never asked, never a mismatch. '
  'No account identifiers: the reset surface reads the one Person''s user_id it '
  'needs through the policies on person.';

revoke execute on function public.roster(uuid) from public, anon;
grant execute on function public.roster(uuid) to authenticated;

-- `public.roster` is a definer function and runs as its owner, so its owner is
-- who calls `app.current_gender`. Both are owned by `postgres`, the role these
-- migrations run as, and an owner holds execute on what it owns: the grant
-- changes nothing today. It is written down so that the Roster's dependence on
-- it is stated somewhere a reader of the grants will find it.
--
-- Still revoked from `public` and `anon`, and still not granted to
-- `authenticated`: a browser session calling this would be probing any Person's
-- gender in any Ministry, which is what the function's own comment says it
-- exists to prevent. Restated rather than assumed, now that a function a
-- browser session may call reads through it.
grant execute on function app.current_gender(uuid) to postgres;
revoke execute on function app.current_gender(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The Pair page reads for itself
-- ---------------------------------------------------------------------------
-- The Roster's document with two keys beside it, so the Pair page goes on
-- taking its candidates from the same rows the Roster shows and one read stays
-- one read (`docs/adr/0023-a-page-is-one-read.md`). `person_page()` stays an
-- alias of `roster_page()`: only this page's document moves.
--
-- `security invoker`, like every page function. The setting is read under the
-- membership policy on `ministry` and the Materials under the Admin's own
-- policy on `material`, as `settings_page()` and `materials_page()` read them.
--
-- `create or replace`, because the return type does not change and the grants
-- on the function it replaces are the ones it keeps.
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
    )
  );
end;
$$;

-- Restated rather than assumed. `create or replace` keeps the grants of the
-- function it replaces, and a page function open to `anon` is the drift the
-- smoke loop exists to catch.
revoke execute on function public.pair_page() from public, anon, service_role;
grant execute on function public.pair_page() to authenticated;
