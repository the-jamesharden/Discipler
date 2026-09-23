-- Suggestions beyond the one-to-one, ticket 01 -- Open to being one of two
--
-- Intake asks one more question of both sides: would you be discipled alongside
-- one other person, and would you disciple two people together. The answer is for
-- the Admin making the pairing and binds nothing (James, 2026-09-18): it is shown
-- beside a name on the pairing surfaces, and it filters nobody and ranks nobody
-- on either of them. ADR-0001 is not amended, for that reason.
--
-- Built as the twin of `intake_submission.first_time`, from the same migration
-- (`20260918000100_the_discipleship_wizard.sql`): nullable, where null means the
-- form did not ask and never a refusal, and read by the Roster as the latest
-- submission that answered.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- The answer, as words
-- ---------------------------------------------------------------------------
-- Two words rather than a boolean, and the same two the form carries on the wire.
-- The screen words the question as a statement to agree with -- *open to being
-- mentored alongside another mentee if needed* -- so a column spelled yes/no
-- would be read against a question that is not on the row. `first_time` made the
-- same choice on the wire and became a boolean here; this one stays words all the
-- way down, so a row is legible without the screen that asked it.
create type one_to_two_answer as enum ('open_to_one_to_two', 'one_to_one_only');

alter table intake_submission
  add column one_to_two one_to_two_answer;

comment on column intake_submission.one_to_two is
  'Whether the Person said they are open to a 1:2 -- being discipled alongside '
  'one other person, or discipling two people together, depending on the side '
  'they declared. Shown per candidate by the pairing surfaces and read by nothing '
  'else: it filters nobody and ranks nobody. Null means the form did not ask, '
  'and is never a refusal.';

-- ---------------------------------------------------------------------------
-- The Roster row carries it
-- ---------------------------------------------------------------------------
-- Dropped and recreated rather than replaced, because the result widens by one
-- column and Postgres refuses to change an existing function's return type in
-- place. The same move `20260929000100_what_the_pair_screen_reads.sql` made.
--
-- Read as the latest submission where the answer is not null, exactly as
-- `first_time` is: the commonest later submission is the tokenized link an Admin
-- sends to correct a number, which asks nothing about this, and a null there must
-- not erase an answer already given.
drop function public.roster(uuid);

create function public.roster(target_ministry_id uuid)
returns table (
  person_id uuid,
  full_name text,
  participation_status public.participation_status,
  declared_side public.declared_side,
  first_time boolean,
  one_to_two public.one_to_two_answer,
  holds_an_account boolean,
  phone text,
  email text,
  gender public.gender
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
         (select i.one_to_two
            from public.intake_submission i
           where i.person_id = p.id
             and i.one_to_two is not null
           order by i.submitted_at desc, i.created_at desc
           limit 1),
         p.user_id is not null,
         p.phone,
         p.email,
         app.current_gender(p.id)
    from public.person p
   where p.ministry_id = target_ministry_id
     and app.is_admin_of(target_ministry_id)
   order by p.full_name;
$$;

comment on function public.roster(uuid) is
  'One Ministry''s Roster as the Admin surface shows it: who is on it, each '
  'Person''s derived Participation Status, which side they last offered to stand '
  'on at Intake, whether their latest submission said this is their first time, '
  'whether their latest submission that asked said they are open to a 1:2, '
  'whether they hold an account that could be reset, their phone number and '
  'email, and the gender on their most recent Intake submission. The contact '
  'details are for an Admin and reach a screen only through the Admin test here '
  '(ADR-0021); a Leader session still reaches a number only through '
  'public.contact_to_share. The gender leaves by the same Admin test and is '
  'there for the pairing surface alone, which greys a Disciple who does not '
  'match what a relationship declares; NULL is never asked, never a mismatch. '
  'The one-to-two answer is there for the pairing surfaces alone too, shown '
  'beside a name and used to filter or rank nobody. No account identifiers: the '
  'reset surface reads the one Person''s user_id it needs through the policies '
  'on person.';

-- Restated rather than assumed: a dropped function takes its grants with it.
revoke execute on function public.roster(uuid) from public, anon;
grant execute on function public.roster(uuid) to authenticated;
