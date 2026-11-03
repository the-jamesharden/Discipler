-- ---------------------------------------------------------------------------
-- A trial waits for its payment method (Exponential launch, ticket 04)
-- ---------------------------------------------------------------------------
--
-- The Subscription is created on the server with its trial, and the Payment Element
-- then confirms its setup intent. Stripe reads it as `trialing` from creation, before
-- that, and a church that leaves the payment step sends no texts (spec, Self sign-up
-- and Billing). So the history now also keeps whether the setup intent was still
-- unconfirmed at each re-read, and `app.billing_state_of` reads it.
--
-- Additive for every row already there: no church has a Subscription yet, and the
-- rows ticket 03 could have recorded were confirmed by nothing and waiting for nothing.
-- `alter table` fires none of the append-only triggers.

alter table billing_event
  add column awaiting_payment_method boolean not null default false;

comment on column billing_event.awaiting_payment_method is
  'The Subscription''s setup intent had not been confirmed at this re-read, so no '
  'card or bank account has been saved for it.';

-- As `20261103100300_billing_records.sql` left it, with two more readings:
--
-- * trialing with its setup intent unconfirmed has not finished starting, and has no
--   access, like `incomplete`;
-- * a Subscription that ended that way never began, and its church is one with no
--   subscription, not one whose subscription ended (Stripe leaves the setup intent in
--   place when the Subscription ends).
create or replace function app.billing_state_of(target uuid)
returns table (
  standing                text,
  has_access              boolean,
  trial_ends_at           timestamptz,
  current_period_ends_at  timestamptz,
  cancels_at              timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select read.standing,
         read.standing in ('outside_stripe', 'trialing', 'active', 'past_due'),
         read.trial_ends_at,
         read.current_period_ends_at,
         read.cancels_at
    from (
      select case
               when coalesce(b.billed_outside_stripe, false) then 'outside_stripe'
               when e.subscription_status is null then 'no_subscription'
               when e.awaiting_payment_method and e.subscription_status = 'trialing' then 'incomplete'
               when e.awaiting_payment_method
                and e.subscription_status in ('canceled', 'incomplete_expired') then 'no_subscription'
               when e.subscription_status in ('incomplete', 'trialing', 'active', 'past_due')
                 then e.subscription_status
               else 'ended'
             end as standing,
             e.trial_ends_at,
             e.current_period_ends_at,
             e.cancels_at
        from (select 1) one
        left join public.ministry_billing b on b.ministry_id = target
        left join lateral (
          select h.subscription_status, h.awaiting_payment_method, h.trial_ends_at,
                 h.current_period_ends_at, h.cancels_at
            from public.billing_event h
           where h.ministry_id = target
             and h.subscription_status is not null
           order by h.position desc
           limit 1
        ) e on true
       where target = app.command_ministry_id() or app.is_admin_of(target)
    ) read;
$$;
