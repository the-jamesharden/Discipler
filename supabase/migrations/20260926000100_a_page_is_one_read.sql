-- A page is one read
-- ---------------------------------------------------------------------------
-- Every signed-in page used to fetch its data as a chain of separate requests
-- from the app server to this database: who is signed in, then whether their
-- session is still held, then which Ministry they administer, then the page's
-- own reads one after another, then the shell's badge on top. Each request is a
-- network round trip that costs many times what the statement behind it costs,
-- and a click that fires several at once is the burst that stalls the origin.
--
-- This migration gives each page one function that answers the whole page in
-- one document, `.scratch/a-page-is-one-read/spec.md`. Every one is named for
-- its page and ends in `_page` (`signed_in_admin` is the one exception, for the
-- surfaces that need nothing but the verdict): the name is how the smoke loop in
-- `src/platform/supabase/every-page-function-answers.ts` finds them all, so a
-- function named otherwise is a page nobody checks. Nothing about who may
-- see what changes: every function here is `security invoker`, so a table is
-- read under the same policies as before and an existing definer function is
-- called with the gate it already has. A page function is a batching of reads
-- the caller was already allowed, and a read that came back empty still does.
--
-- Each function answers for the session before it reads a row. A token that
-- verifies but names a session that has been ended
-- (`docs/adr/0016-a-password-change-ends-every-session.md`) reads `signed-out`
-- and nothing else, which is how a page is refused to a stolen session.
--
-- The documents are keyed by the read they replace, with the same columns under
-- the same names, so the parsing on the app side moves without changing.

-- ---------------------------------------------------------------------------
-- 1. The session verdict and the Admin
-- ---------------------------------------------------------------------------
-- The same three answers `resolveAdmin` gave: `signed-out` for no held session,
-- `not-an-admin` for a session that administers nothing, and `admin` with the
-- earliest Admin membership by `created_at`, the Ministry's name, and the
-- Admin's own row on the Roster or null. The Ministry name is read under the
-- membership policy, as the embedded read was, and falls back on the app side.
create function app.page_session()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  membership record;
  own uuid;
begin
  if uid is null or not public.session_is_live() then
    return jsonb_build_object('session', 'signed-out');
  end if;

  select mm.ministry_id, m.name
    into membership
    from public.ministry_member mm
    left join public.ministry m on m.id = mm.ministry_id
   where mm.user_id = uid
     and mm.tier = 'admin'
   order by mm.created_at
   limit 1;

  if not found then
    return jsonb_build_object('session', 'not-an-admin', 'user_id', uid);
  end if;

  select p.id
    into own
    from public.person p
   where p.ministry_id = membership.ministry_id
     and p.user_id = uid
   limit 1;

  return jsonb_build_object(
    'session', 'admin',
    'user_id', uid,
    'admin', jsonb_build_object(
      'ministry_id', membership.ministry_id,
      'ministry_name', membership.name,
      'person_id', own
    )
  );
end;
$$;

revoke execute on function app.page_session() from public, anon, service_role;
grant execute on function app.page_session() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Names for a set of people
-- ---------------------------------------------------------------------------
-- The `person` policies decide which of them the caller may name, as they did
-- for the separate lookup this replaces.
create function app.names_of(people uuid[])
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name))
       from public.person p
      where p.id = any (people)),
    '[]'::jsonb
  );
$$;

revoke execute on function app.names_of(uuid[]) from public, anon, service_role;
grant execute on function app.names_of(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The history a relationship's state is derived from
-- ---------------------------------------------------------------------------
-- The reads the Overview, Care Needed and Check-Ins share: the Ministry's
-- timezone, its relationships, open memberships, weeks, concerns, pauses,
-- answers, open Follow-Up Items, and the names of everyone those rows point at.
-- Read once per page rather than once per surface, so the two tabs that derive
-- the same state cannot read two different moments.
create function app.history_inputs(target_ministry_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with relationships as (
    select r.id, r.created_at, r.accepted_at, r.ended_at
      from public.relationship r
     where r.ministry_id = target_ministry_id
  ),
  members as (
    select m.relationship_id, m.person_id, m.role
      from public.relationship_member m
     where m.ministry_id = target_ministry_id
       and m.ended_at is null
  ),
  concerns as (
    select c.id, c.relationship_id, c.raised_by, c.raised_at, c.resolved_at
      from public.concern c
     where c.ministry_id = target_ministry_id
  ),
  follow_ups as (
    select f.id, f.kind, f.raised_at, f.relationship_id, f.person_id, f.payload
      from public.follow_up_item f
     where f.ministry_id = target_ministry_id
       and f.resolved_at is null
  ),
  wanted as (
    select m.person_id as id from members m
    union
    select c.raised_by from concerns c where c.raised_by is not null
    union
    select f.person_id from follow_ups f where f.person_id is not null
  )
  select jsonb_build_object(
    'timezone', (select m.timezone from public.ministry m where m.id = target_ministry_id),
    'relationships', coalesce((select jsonb_agg(to_jsonb(r)) from relationships r), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(to_jsonb(m)) from members m), '[]'::jsonb),
    'people', app.names_of(array(select w.id from wanted w)),
    'weeks', coalesce(
      (select jsonb_agg(to_jsonb(w)) from public.relationship_weeks(target_ministry_id) w),
      '[]'::jsonb
    ),
    'concerns', coalesce(
      (select jsonb_agg(to_jsonb(c) order by c.raised_at desc) from concerns c),
      '[]'::jsonb
    ),
    'pauses', coalesce(
      (select jsonb_agg(to_jsonb(p)) from public.relationship_pauses(target_ministry_id) p),
      '[]'::jsonb
    ),
    'answers', coalesce(
      (select jsonb_agg(to_jsonb(a)) from public.relationship_week_answers(target_ministry_id) a),
      '[]'::jsonb
    ),
    'follow_ups', coalesce(
      (select jsonb_agg(to_jsonb(f) order by f.raised_at desc) from follow_ups f),
      '[]'::jsonb
    )
  );
$$;

revoke execute on function app.history_inputs(uuid) from public, anon, service_role;
grant execute on function app.history_inputs(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The page functions
-- ---------------------------------------------------------------------------
-- Each begins with the session verdict and returns it alone unless the session
-- administers a Ministry. `/relationships` is the exception: the Leader
-- Dashboard is everybody's, so it answers for any held session.

/** The verdict and the Admin alone: `/`, `/account`, and `resolveAdmin`. */
create function public.signed_in_admin()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select app.page_session();
$$;

create function public.overview_page()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  doc jsonb := app.page_session();
begin
  if doc ->> 'session' <> 'admin' then return doc; end if;
  return doc || jsonb_build_object(
    'history', app.history_inputs((doc -> 'admin' ->> 'ministry_id')::uuid)
  );
end;
$$;

-- The Check-Ins tab reads the week answers and the memberships, and its badge
-- is the Care Needed count: the same document as the Overview serves both.
create function public.check_ins_page()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.overview_page();
$$;

-- Nothing is built behind Suggested Pairs yet; the document is the Admin and
-- the badge's inputs.
create function public.suggested_pairs_page()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.overview_page();
$$;

-- A reveal names one Person; the contact to share for them travels with the
-- page rather than as a second question, and `contact_to_share` keeps its gate.
create function public.follow_up_page(reveal_person_id uuid default null)
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
    'reveal', case
      when reveal_person_id is null then null
      else (select to_jsonb(c) from public.contact_to_share(ministry, reveal_person_id) c limit 1)
    end
  );
end;
$$;

-- The Roster, the person page and the Pair page. The relationships listed are
-- the ones an open membership names, as the separate read asked for them.
create function public.roster_page()
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
    'roster', jsonb_build_object(
      'rows', coalesce(
        (select jsonb_agg(to_jsonb(r)) from public.roster(ministry) r),
        '[]'::jsonb
      ),
      'members', coalesce(
        (select jsonb_agg(jsonb_build_object(
                  'person_id', m.person_id,
                  'relationship_id', m.relationship_id,
                  'role', m.role))
           from public.relationship_member m
          where m.ministry_id = ministry
            and m.ended_at is null),
        '[]'::jsonb
      ),
      'relationships', coalesce(
        (select jsonb_agg(jsonb_build_object('id', r.id, 'accepted_at', r.accepted_at))
           from public.relationship r
          where r.ministry_id = ministry
            and r.id in (select m.relationship_id
                           from public.relationship_member m
                          where m.ministry_id = ministry
                            and m.ended_at is null)),
        '[]'::jsonb
      ),
      'intended_pairings', coalesce(
        (select jsonb_agg(to_jsonb(i)) from public.intended_pairings(ministry) i),
        '[]'::jsonb
      ),
      'held_import_rows', coalesce(
        (select jsonb_agg(to_jsonb(h)) from public.held_import_rows(ministry) h),
        '[]'::jsonb
      )
    )
  );
end;
$$;

-- The person page and the Pair page draw from the Roster's document and are
-- named for themselves, so the edge log tells the three apart and a page that
-- one day reads differently moves nobody else's document.
create function public.person_page()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.roster_page();
$$;

create function public.pair_page()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.roster_page();
$$;

create function public.settings_page()
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
    'settings', (select to_jsonb(s) from public.ministry_settings(ministry) s limit 1)
  );
end;
$$;

-- Intake forms names people only to say who a query string refers to, so it
-- reads names under the `person` policy rather than the whole Roster.
create function public.intake_forms_page()
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
    'groups', coalesce(
      (select jsonb_agg(to_jsonb(g)) from public.ministry_groups(ministry) g),
      '[]'::jsonb
    ),
    'join_requests', coalesce(
      (select jsonb_agg(to_jsonb(j)) from public.group_join_requests(ministry) j),
      '[]'::jsonb
    ),
    'goal_options', coalesce(
      (select jsonb_agg(to_jsonb(o)) from public.discipleship_goal_options(ministry) o),
      '[]'::jsonb
    ),
    'people', app.names_of(array(select p.id from public.person p where p.ministry_id = ministry))
  );
end;
$$;

-- The Leader Dashboard: everything a Leader's relationships show, for any held
-- session, with the Admin beside it for the links the header offers. Where the
-- app looped once per Ministry, per relationship and per person, the same
-- functions are joined laterally here and keep their own gates. The one read
-- that stays outside is the signed URL for a Material's PDF, which is minted by
-- the storage API and has no face in SQL.
create function public.relationships_page()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  doc jsonb := app.page_session();
  uid uuid := (select auth.uid());
  mine uuid[];
  led uuid[];
  ministries uuid[];
begin
  if doc ->> 'session' = 'signed-out' then return doc; end if;

  mine := array(select p.id from public.person p where p.user_id = uid);

  led := array(
    select distinct m.relationship_id
      from public.relationship_member m
     where m.person_id = any (mine)
       and m.role = 'leader'
       and m.ended_at is null
  );

  ministries := array(
    select distinct m.ministry_id
      from public.relationship_member m
     where m.relationship_id = any (led)
       and m.ended_at is null
  );

  return doc || jsonb_build_object('dashboard', jsonb_build_object(
    'mine', to_jsonb(mine),
    'leaderships', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'relationship_id', m.relationship_id,
                'ministry_id', m.ministry_id,
                'person_id', m.person_id,
                'role', m.role))
         from public.relationship_member m
        where m.person_id = any (mine)
          and m.role = 'leader'
          and m.ended_at is null),
      '[]'::jsonb
    ),
    'members', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'relationship_id', m.relationship_id,
                'ministry_id', m.ministry_id,
                'person_id', m.person_id,
                'role', m.role))
         from public.relationship_member m
        where m.relationship_id = any (led)
          and m.ended_at is null),
      '[]'::jsonb
    ),
    'ministries', coalesce(
      (select jsonb_agg(jsonb_build_object('id', mi.id, 'name', mi.name))
         from public.ministry mi
        where mi.id = any (ministries)),
      '[]'::jsonb
    ),
    'material_periods', coalesce(
      (select jsonb_agg(to_jsonb(mp))
         from unnest(ministries) as mi(id),
              lateral public.material_periods(mi.id) mp),
      '[]'::jsonb
    ),
    'pauses', coalesce(
      (select jsonb_agg(to_jsonb(pa))
         from unnest(ministries) as mi(id),
              lateral public.relationship_pauses(mi.id) pa),
      '[]'::jsonb
    ),
    'people', app.names_of(array(
      select distinct m.person_id
        from public.relationship_member m
       where m.relationship_id = any (led)
         and m.ended_at is null
    )),
    'availability', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'relationship_id', r.id,
                'person_id', a.person_id,
                'day', a.day,
                'hour', a.hour))
         from unnest(led) as r(id),
              lateral public.relationship_availability(r.id) a),
      '[]'::jsonb
    ),
    'materials', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', ma.id,
                'body', ma.body,
                'pdf_path', ma.pdf_path,
                'pdf_filename', ma.pdf_filename))
         from public.material ma
        where ma.id in (select mp.material_id
                          from unnest(ministries) as mi(id),
                               lateral public.material_periods(mi.id) mp
                         where mp.ended_at is null
                           and mp.relationship_id = any (led))),
      '[]'::jsonb
    ),
    'contacts', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'ministry_id', who.ministry_id,
                'person_id', who.person_id,
                'full_name', c.full_name,
                'phone', c.phone))
         from (select distinct m.ministry_id, m.person_id
                 from public.relationship_member m
                where m.relationship_id = any (led)
                  and m.ended_at is null) who,
              lateral public.contact_to_share(who.ministry_id, who.person_id) c),
      '[]'::jsonb
    )
  ));
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------
-- Every page function is a signed-in user's and nobody else's. The platform
-- grants execute on a new function in this schema to `anon` and `service_role`
-- by default, so both are revoked, as `session_is_live` revokes them.
revoke execute on function public.signed_in_admin() from public, anon, service_role;
revoke execute on function public.overview_page() from public, anon, service_role;
revoke execute on function public.check_ins_page() from public, anon, service_role;
revoke execute on function public.suggested_pairs_page() from public, anon, service_role;
revoke execute on function public.follow_up_page(uuid) from public, anon, service_role;
revoke execute on function public.roster_page() from public, anon, service_role;
revoke execute on function public.person_page() from public, anon, service_role;
revoke execute on function public.pair_page() from public, anon, service_role;
revoke execute on function public.settings_page() from public, anon, service_role;
revoke execute on function public.intake_forms_page() from public, anon, service_role;
revoke execute on function public.relationships_page() from public, anon, service_role;

grant execute on function public.signed_in_admin() to authenticated;
grant execute on function public.overview_page() to authenticated;
grant execute on function public.check_ins_page() to authenticated;
grant execute on function public.suggested_pairs_page() to authenticated;
grant execute on function public.follow_up_page(uuid) to authenticated;
grant execute on function public.roster_page() to authenticated;
grant execute on function public.person_page() to authenticated;
grant execute on function public.pair_page() to authenticated;
grant execute on function public.settings_page() to authenticated;
grant execute on function public.intake_forms_page() to authenticated;
grant execute on function public.relationships_page() to authenticated;
