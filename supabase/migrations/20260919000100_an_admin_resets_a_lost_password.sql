-- ---------------------------------------------------------------------------
-- An Admin resets a lost password: the Roster row says who holds an account
-- ---------------------------------------------------------------------------
--
-- The login page has told anybody who has lost their password to ask whoever runs
-- Discipler at their church to reset it since ticket 24, and nothing in the product
-- let that person do it. Ticket 28 is the reset itself, and almost all of it lives
-- above this file: the password is Supabase Auth's, the event is one
-- `ministry_event` row of a kind that needs no schema, and the two refusals are
-- codes in the domain.
--
-- What the database is asked for is one column on the Roster row. The reset is
-- offered on a Person's row and only where that Person holds an account -- a button
-- that is always present and refuses most of the time teaches an Admin that the
-- product does not know its own state -- so the row has to be able to say whether
-- they do.
--
-- Derived, like the two columns ticket 27 added beside it, and not stored a second
-- time. `person.user_id` is where an account is recorded and it is set by exactly
-- two paths -- a Leader accepting an Invitation Link, and provisioning a Ministry's
-- first Admin -- so a boolean kept alongside it would be a second answer to a
-- question that already has one.
--
-- `is not null` and not the id itself. The Roster is a list, and a page carrying
-- every account identifier on it would be handing out the argument to the one call
-- that can change any of those credentials. The reset surface reads the account for
-- the single Person an Admin has asked about, through the policies on `person`,
-- which is the shape `liveIntakeLink` already uses for a token.
--
-- Dropped and recreated rather than replaced, because the result is widening by a
-- column and Postgres refuses to change an existing function's return type in
-- place. The same move ticket 27 made.
drop function public.roster(uuid);

create function public.roster(target_ministry_id uuid)
returns table (
  person_id uuid,
  full_name text,
  participation_status public.participation_status,
  eligible_to_lead boolean,
  declared_side public.declared_side,
  first_time boolean,
  holds_an_account boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         p.full_name,
         public.participation_status(p),
         p.eligible_to_lead,
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
         p.user_id is not null
    from public.person p
   where p.ministry_id = target_ministry_id
     and app.is_admin_of(target_ministry_id)
   order by p.full_name;
$$;

comment on function public.roster(uuid) is
  'One Ministry''s Roster as the Admin surface shows it: who is on it, each '
  'Person''s derived Participation Status, whether an Admin has marked them '
  'eligible to lead, which side they last offered to stand on at Intake, whether '
  'their latest submission said this is their first time, and whether they hold an '
  'account that could be reset. No contact details -- a number is reached through '
  'public.contact_to_share and nowhere else -- and no account identifiers: the '
  'reset surface reads the one Person''s user_id it needs through the policies on '
  'person.';

revoke execute on function public.roster(uuid) from public, anon;
grant execute on function public.roster(uuid) to authenticated;
