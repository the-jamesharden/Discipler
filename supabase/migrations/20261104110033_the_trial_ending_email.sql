-- ---------------------------------------------------------------------------
-- The trial-ending email (Exponential launch, ticket 33)
-- ---------------------------------------------------------------------------

-- Which Admins were told a trial is ending, one row each, so a tick after a send that
-- half failed goes only to whoever was missed, and for longer than the email service's
-- own day of remembering. The watch looks across every church, so it sits on the trusted
-- connection in the `ministry_setup` shape, and nothing here is about the payment.
create table trial_ending_email (
  stripe_subscription_id text not null,
  user_id                uuid not null references auth.users (id) on delete cascade,
  -- Not `ministry_id`, which is the promise of a policy that scopes the row.
  church                 uuid not null references ministry (id) on delete cascade,
  sent_at                timestamptz not null,

  primary key (stripe_subscription_id, user_id)
);

create index trial_ending_email_per_church on trial_ending_email (church);

alter table trial_ending_email enable row level security;
alter table trial_ending_email force  row level security;

revoke all on trial_ending_email from anon, authenticated, service_role, discipler_command;

comment on table trial_ending_email is
  'Which Admins have been emailed that a Subscription''s trial is ending. Operator-only; '
  'read and written by the scheduled tick''s watch.';

-- ---------------------------------------------------------------------------
-- The Billing page's one read
-- ---------------------------------------------------------------------------

-- What Discipler itself knows for `/settings/billing` and its restart page: who is asking,
-- what the tab bar's badge reads, and the clock its dates and "your next check-in day" are
-- on. The plan, the card and the bills are Stripe's, read on the server each time.
create function public.billing_page()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  doc jsonb := app.history_page();
  ministry uuid;
begin
  if doc ->> 'session' <> 'admin' then return doc; end if;
  ministry := (doc -> 'admin' ->> 'ministry_id')::uuid;
  return doc || jsonb_build_object(
    'settings', (select to_jsonb(s) from public.ministry_settings(ministry) s limit 1)
  );
end;
$$;

revoke execute on function public.billing_page() from public, anon, service_role;
grant execute on function public.billing_page() to authenticated;
