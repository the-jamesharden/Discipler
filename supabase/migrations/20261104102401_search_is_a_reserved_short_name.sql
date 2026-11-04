-- Search reads its names from `/search` (Exponential launch, ticket 24), so `search`
-- joins the short names a Ministry may not take: every top-level route is one, so a
-- short name can never be read as a page of Discipler's own. The same list is
-- `RESERVED_SHORT_NAMES` in `src/domain/short-name.ts`, and a test there fails when a
-- top-level route is added without it.
--
-- `ministry_short_name_is_not_a_route` calls this function, and a check is evaluated
-- on every update of the row. A Ministry already holding `search` would be unable to
-- save anything once it is reserved, so the migration refuses to run rather than
-- leave one in that state; renaming it is a decision for a person.
do $$
begin
  if exists (select 1 from public.ministry where short_name = 'search') then
    raise exception 'A Ministry holds the short name search. Give it another before reserving search for search.';
  end if;
end;
$$;

create or replace function app.short_name_is_reserved(candidate text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select candidate = any (array[
    'account', 'api', 'auth', 'check-ins', 'cron', 'follow-up', 'groups', 'help',
    'intake', 'intake-forms', 'invitation', 'join', 'login', 'material', 'materials',
    'overview', 'relationships', 'roster', 'search', 'settings', 'setup', 'signup', 'sms',
    'stripe', 'suggested-pairs'
  ]);
$$;

-- `create or replace` keeps the grants the function already has; said again so this
-- file reads whole.
revoke execute on function app.short_name_is_reserved(text) from public, anon, authenticated;
grant execute on function app.short_name_is_reserved(text) to discipler_command, service_role;
