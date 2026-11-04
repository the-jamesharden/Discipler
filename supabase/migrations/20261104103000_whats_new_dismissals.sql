-- Each Admin dismisses What's new for themselves (Exponential launch, ticket 30)
--
-- The entries are a file in the repo, so the only thing the database holds is which of
-- them this Admin has closed. A dismissal is a preference and not an act of ministry,
-- so it writes no `ministry_event`, and it goes with the membership it belongs to.
--
-- Additive, as a change to a page function must be (ADR-0023): one key joins `admin`
-- in `app.page_session()`, read under this table's own policy, so every Admin page
-- knows the state with no second request. Nothing else in the function changes.

create table whats_new_dismissal (
  ministry_id  uuid not null references ministry (id) on delete cascade,
  user_id      uuid not null,
  -- An entry's `id` in `app/help/whats-new.ts`. The route stores only an id the file
  -- holds; the file is not the database's to check against.
  entry_id     text not null check (entry_id <> ''),
  dismissed_at timestamptz not null,

  primary key (ministry_id, user_id, entry_id),

  constraint whats_new_dismissal_member_fk
    foreign key (ministry_id, user_id) references ministry_member (ministry_id, user_id)
    on delete cascade
);

alter table whats_new_dismissal enable row level security;
alter table whats_new_dismissal force  row level security;

revoke all on whats_new_dismissal from anon, authenticated, service_role;

grant select on whats_new_dismissal to authenticated;

-- Their own and nobody else's, even inside their own church: what another Admin has
-- closed is nothing anybody's page needs.
create policy whats_new_dismissal_read_own on whats_new_dismissal
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Writes arrive through the command boundary, like every other. Insert only: there is
-- no undoing a dismissal in the product.
grant select, insert on whats_new_dismissal to discipler_command;

create policy whats_new_dismissal_command on whats_new_dismissal
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

-- The newest definition (`20261104102600_the_setup_meter.sql`), with
-- `whats_new_dismissed` added to `admin` and nothing else changed.
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
      'full_name', own.full_name,
      'whats_new_dismissed', (
        select coalesce(jsonb_agg(d.entry_id order by d.entry_id), '[]'::jsonb)
          from public.whats_new_dismissal d
         where d.ministry_id = membership.ministry_id
           and d.user_id = uid
      )
    ),
    'billing', (select to_jsonb(s) from app.billing_state_of(membership.ministry_id) s),
    'setup', app.setup_meter_of(membership.ministry_id)
  );
end;
$$;

revoke execute on function app.page_session() from public, anon, service_role;
grant execute on function app.page_session() to authenticated;
