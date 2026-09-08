-- Ticket 36 -- The Roster of Disciplers and Disciples
--
-- Two things the Roster reads change here, and both are decisions James took in
-- the review of 2026-09-07 rather than tidying.
--
-- The Roster shows every Person's phone number and email. Ticket 31 kept contact
-- details off it on the reading that a number is reached one Person at a time
-- through the consent check; the product owner reversed that for the Admin
-- surface: the Admin uploaded these details or the Person typed them at Intake,
-- and a Roster that hides them from the one person who holds them is a Roster
-- an Admin keeps a spreadsheet beside. See
-- `docs/adr/0021-the-roster-shows-contact-details.md`. Nothing about SMS
-- disclosure changes -- no message carries a number, and a Leader session still
-- reaches one only through `public.contact_to_share`.
--
-- The eligibility to lead feature is removed whole. A Discipler is a fact -- they
-- lead somebody, or they signed up as a leader on the Intake form, or an import
-- paired them as one -- and pairing them is the pastor's acceptance. A flag an
-- Admin set ahead of that was a plan nothing read, and the product owner asked
-- for it to go rather than be renamed. The history rows that recorded it being
-- set stay, as every historical event does.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The column goes
-- ---------------------------------------------------------------------------
-- Dropped rather than left unread. A column nothing reads is a column somebody
-- reads again by accident, and the grant list below is what a browser session may
-- see of `person`: recreated without it, so the two cannot disagree.
--
-- `public.roster` reads the column, so it is dropped first and recreated below.
drop function public.roster(uuid);

alter table person drop column eligible_to_lead;

revoke select on person from authenticated;

grant select (id, ministry_id, full_name, created_at, user_id, email)
  on person to authenticated;

-- ---------------------------------------------------------------------------
-- The Roster carries contact details
-- ---------------------------------------------------------------------------
-- Dropped and recreated rather than replaced, because the result widens by two
-- columns and Postgres refuses to change an existing function's return type in
-- place. The same move ticket 27 and ticket 28 made.
--
-- The phone comes out of a security definer function and not out of a column
-- grant, deliberately. `authenticated` still holds no SELECT on `person.phone`:
-- the Admin test inside this function is what lets a number reach a screen, so a
-- Leader session -- which may read the Person rows it leads -- reads no number
-- here or anywhere but `public.contact_to_share`.
create function public.roster(target_ministry_id uuid)
returns table (
  person_id uuid,
  full_name text,
  participation_status public.participation_status,
  declared_side public.declared_side,
  first_time boolean,
  holds_an_account boolean,
  phone text,
  email text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         p.full_name,
         public.participation_status(p),
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
         p.user_id is not null,
         p.phone,
         p.email
    from public.person p
   where p.ministry_id = target_ministry_id
     and app.is_admin_of(target_ministry_id)
   order by p.full_name;
$$;

comment on function public.roster(uuid) is
  'One Ministry''s Roster as the Admin surface shows it: who is on it, each '
  'Person''s derived Participation Status, which side they last offered to stand '
  'on at Intake, whether their latest submission said this is their first time, '
  'whether they hold an account that could be reset, and their phone number and '
  'email. The contact details are for an Admin and reach a screen only through '
  'the Admin test here (ADR-0021); a Leader session still reaches a number only '
  'through public.contact_to_share. No account identifiers: the reset surface '
  'reads the one Person''s user_id it needs through the policies on person.';

revoke execute on function public.roster(uuid) from public, anon;
grant execute on function public.roster(uuid) to authenticated;

comment on column person.phone is
  'Readable by an Admin of the Ministry through public.roster (ADR-0021) and on '
  'the command connection, which sends the messages. Not readable by any other '
  'browser session: a Leader reaches a number only through '
  'public.contact_to_share, which answers only where the Person currently '
  'consents to contact sharing.';
