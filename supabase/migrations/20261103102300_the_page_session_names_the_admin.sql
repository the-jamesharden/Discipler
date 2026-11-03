-- The page session names the Admin (Exponential launch, ticket 23)
--
-- The top nav draws a circle with the Admin's initials on every Admin page, and
-- opens to their name. That name comes out of the one read the page already makes
-- (`docs/adr/0023-a-page-is-one-read.md`): every page function starts from
-- `app.page_session()`, so one more field here reaches them all and no page makes a
-- second request.
--
-- Additive, as a change to a page function must be: `full_name` joins `admin`, read
-- from the row `person_id` already comes from, under the same policies, and the
-- columns the running code reads are untouched. It is null where `person_id` is null,
-- an Admin membership for somebody the Roster does not hold. Nothing else changes.

create or replace function app.page_session()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  membership record;
  own record;
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

  select p.id, p.full_name
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
      'person_id', own.id,
      'full_name', own.full_name
    ),
    'billing', (select to_jsonb(s) from app.billing_state_of(membership.ministry_id) s)
  );
end;
$$;

revoke execute on function app.page_session() from public, anon, service_role;
grant execute on function app.page_session() to authenticated;
