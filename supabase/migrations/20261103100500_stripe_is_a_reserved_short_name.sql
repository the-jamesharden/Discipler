-- The Stripe webhook is served at `/stripe/webhook` (Exponential launch, ticket 03),
-- so `stripe` joins the short names a Ministry may not take, as `help` did in
-- `20261101200000_help_is_a_reserved_short_name.sql` and for the same reason. The
-- same list is `RESERVED_SHORT_NAMES` in `src/domain/short-name.ts`.
do $$
begin
  if exists (select 1 from public.ministry where short_name = 'stripe') then
    raise exception 'A Ministry holds the short name stripe. Give it another before reserving stripe for the webhook.';
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
    'overview', 'relationships', 'roster', 'settings', 'setup', 'sms', 'stripe',
    'suggested-pairs'
  ]);
$$;

-- `create or replace` keeps the grants the function already has; said again so this
-- file reads whole.
revoke execute on function app.short_name_is_reserved(text) from public, anon, authenticated;
grant execute on function app.short_name_is_reserved(text) to discipler_command, service_role;
