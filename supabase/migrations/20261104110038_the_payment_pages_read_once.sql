-- ---------------------------------------------------------------------------
-- The pages about paying ask one question (ADR-0023, from the review of wave 4)
-- ---------------------------------------------------------------------------

-- Whether a Subscription of this church ever really began: its card or bank account was
-- confirmed, and it was not merely an opening that ended with nothing saved. As `everBegan`
-- in `src/service/open-trial.ts` reads it from Stripe. Not granted to a browser's role:
-- it takes any church, and `app.church_signup_of` is what scopes it.
create function app.subscription_ever_began(target_ministry_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.billing_event e
      left join public.trial_opening o on o.stripe_subscription_id = e.stripe_subscription_id
     where e.ministry_id = target_ministry_id
       and e.subscription_status is not null
       and not e.awaiting_payment_method
       and (o.stripe_subscription_id is null
            or o.settled_at is not null
            or e.subscription_status in ('trialing', 'active', 'past_due'))
  );
$$;

revoke execute on function app.subscription_ever_began(uuid) from public, anon, authenticated, service_role;
grant execute on function app.subscription_ever_began(uuid) to discipler_command;

-- What a church chose when it signed itself up, for its own Admins, or null. `church_signup`
-- has no browser grant, and the Admin test is what scopes this: a page function reads it
-- through the Admin's session, and any other church gets nothing.
create function app.church_signup_of(target_ministry_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'billing_cycle', s.billing_cycle,
    'carried_code', s.carried_code,
    'timezone', m.timezone,
    'reminders_off', s.reminders_off_at is not null,
    'began', app.subscription_ever_began(s.ministry_id)
  )
    from public.church_signup s
    join public.ministry m on m.id = s.ministry_id
   where s.ministry_id = target_ministry_id
     and app.is_admin_of(target_ministry_id);
$$;

revoke execute on function app.church_signup_of(uuid) from public, anon, service_role;
grant execute on function app.church_signup_of(uuid) to authenticated;

-- The newest definition (20261104110033) with `church_signup` added, for the way back to
-- the payment step that Billing offers a church with no Subscription.
create or replace function public.billing_page()
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
    'settings', (select to_jsonb(s) from public.ministry_settings(ministry) s limit 1),
    'church_signup', app.church_signup_of(ministry)
  );
end;
$$;

-- `/settings/billing/restart` draws the same document, with a function of its own so the
-- edge log names the page that was loaded.
create function public.restart_page()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.billing_page();
$$;

revoke execute on function public.restart_page() from public, anon, service_role;
grant execute on function public.restart_page() to authenticated;

-- `/`, which sends an Admin who left at the payment step back to it.
create function public.home_page()
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
    'church_signup', app.church_signup_of((doc -> 'admin' ->> 'ministry_id')::uuid)
  );
end;
$$;

revoke execute on function public.home_page() from public, anon, service_role;
grant execute on function public.home_page() to authenticated;

-- `/signup/payment` draws the same document.
create function public.payment_step_page()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.home_page();
$$;

revoke execute on function public.payment_step_page() from public, anon, service_role;
grant execute on function public.payment_step_page() to authenticated;
