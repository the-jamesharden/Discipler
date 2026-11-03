-- ---------------------------------------------------------------------------
-- The churches opened before Stripe are billed outside it (Exponential launch,
-- ticket 03)
-- ---------------------------------------------------------------------------
--
-- Every church that exists when this runs is one that opened before Discipler took
-- a payment, so none of them holds a subscription or could: each is settled by hand,
-- and without the flag each would read as having no access as soon as the texting
-- gate ships (ticket 05). On production those are SAU BCM, Anthem Community Church
-- and Example Ministry, the only three.
--
-- By that fact and not by name, because a name is a thing an Admin can change.
-- Self sign-up is the first way a church can arrive that is meant to pay, and it
-- ships after this, so no church that should pay can be caught by it.
--
-- A file of its own, so its one statement can be run and checked by
-- `tests/integration/billing-records.test.ts`.
insert into ministry_billing (ministry_id, billed_outside_stripe)
select id, true from ministry
on conflict (ministry_id) do update set billed_outside_stripe = true;
