-- ===========================================================================
-- Other on the Intake goal (Pastor feedback 2026-10, ticket 06)
-- ===========================================================================
-- The goal question gains *Other*, the last option on every Ministry's form,
-- which opens a short box the Person types into. It is not one of the
-- Ministry's own options: there is no `discipleship_goal` row for it, an Admin
-- cannot rename, move or remove it, and what somebody typed belongs to their
-- submission and to nothing else.
--
-- Two people who typed the same thing share a goal for Suggested Pairs, exactly
-- as two people who picked the same option do. *The same* is decided in
-- `src/domain/suggestions.ts` and recorded in ADR-0001's amendment; this file only
-- stores the words and hands them to the two readers that show them.

-- ---------------------------------------------------------------------------
-- The typed answer, on the submission
-- ---------------------------------------------------------------------------
-- Beside `discipleship_goal_id` rather than in place of it, because the two are
-- different kinds of answer: one points at an option the Ministry owns and is
-- blanked when the Ministry removes it (ADR-0014), and the other is the Person's
-- own words, which no edit to the list can touch.
--
-- Never both. The goal is one choice, and a submission holding an option and a
-- typed answer would be two. Neither is also a real state, as it always was: the
-- group path asks no goal, and a removed option leaves its answers blank.
--
-- Stored as the domain reads it -- trimmed, its inner runs of whitespace
-- collapsed, and never empty -- so a box left blank cannot arrive as an answer.
-- The check holds the part a second reader could get wrong, empty or padded, and
-- leaves what counts as whitespace inside to `readWording`: Postgres and
-- JavaScript disagree at the edges of Unicode about it, and a check stricter than
-- the domain would turn somebody's odd keystroke into a failed submission.
alter table intake_submission
  add column discipleship_goal_other text,
  add constraint intake_submission_goal_other_is_wording check (
    discipleship_goal_other is null
    or (discipleship_goal_other <> '' and discipleship_goal_other = btrim(discipleship_goal_other))
  ),
  add constraint intake_submission_goal_is_one_choice check (
    discipleship_goal_id is null or discipleship_goal_other is null
  );

comment on column intake_submission.discipleship_goal_other is
  'What the Person typed after choosing Other on the goal question, as they typed '
  'it less surrounding and repeated whitespace. Null where they chose one of the '
  'Ministry''s options, or the form asked no goal. Never set beside '
  'discipleship_goal_id: the goal is one choice. Read by Suggested Pairs, which '
  'counts two equal texts as a shared goal (ADR-0001), and shown on the person '
  'page; never on the Roster row.';

-- ---------------------------------------------------------------------------
-- The Roster carries the goal, for the person page
-- ---------------------------------------------------------------------------
-- The person page reads one row of the Roster (there is no single-Person
-- reader), so the answer reaches it here: the Ministry's current wording of the
-- option they chose, or the words they typed. The Roster row itself shows
-- neither, and `app/roster/page.tsx` is where that is kept true.
--
-- Read off the latest submission, as `suggestion_inputs` reads it, and not off
-- the latest one that answered. A null on the latest submission is either the
-- group path, which asked nothing, or a removed option, and in both cases the
-- goal being ranked is no goal at all: falling back to an older answer would
-- show an Admin a goal that is not the one Suggested Pairs is using.
--
-- Dropped and recreated rather than replaced, because the result widens by two
-- columns and Postgres refuses to change an existing function's return type in
-- place. The same move `20261010000100_open_to_being_one_of_two.sql` made.
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
  gender public.gender,
  goal_label text,
  goal_other text
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
         app.current_gender(p.id),
         g.label,
         latest.discipleship_goal_other
    from public.person p
    left join lateral (
      select i.discipleship_goal_id, i.discipleship_goal_other
        from public.intake_submission i
       where i.person_id = p.id
       order by i.submitted_at desc, i.created_at desc, i.id desc
       limit 1
    ) latest on true
    left join public.discipleship_goal g on g.id = latest.discipleship_goal_id
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
  'email, the gender on their most recent Intake submission, and the goal on it '
  'as the Ministry''s current wording of the option or the words they typed '
  'after Other. The contact details are for an Admin and reach a screen only '
  'through the Admin test here (ADR-0021); a Leader session still reaches a '
  'number only through public.contact_to_share. The gender leaves by the same '
  'Admin test and is there for the pairing surface alone, which greys a Disciple '
  'who does not match what a relationship declares; NULL is never asked, never a '
  'mismatch. The one-to-two answer is there for the pairing surfaces alone too, '
  'shown beside a name and used to filter or rank nobody. The goal is for the '
  'person page and the pair card, never the Roster row. No account identifiers: '
  'the reset surface reads the one Person''s user_id it needs through the '
  'policies on person.';

-- Restated rather than assumed: a dropped function takes its grants with it.
revoke execute on function public.roster(uuid) from public, anon;
grant execute on function public.roster(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Suggested Pairs ranks on it
-- ---------------------------------------------------------------------------
-- One column more, so dropped and recreated for the reason the Roster is.
-- `suggested_pairs_page()` calls it by name inside plpgsql, which holds no
-- dependency on its return type, so the page needs no change.
drop function public.suggestion_inputs(uuid);

create function public.suggestion_inputs(target_ministry_id uuid)
returns table (
  person_id uuid,
  intake_submitted_at timestamptz,
  consents_to_texts boolean,
  age_band public.age_band,
  goal_id uuid,
  goal_label text,
  goal_other text,
  availability text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         latest.submitted_at,
         app.current_consent(p.id, 'sms') is true,
         latest.age_band,
         g.id,
         g.label,
         latest.discipleship_goal_other,
         coalesce(
           (select array_agg(a.day::text || ':' || a.hour::text order by a.day, a.hour)
              from public.intake_availability a
             where a.intake_submission_id = latest.id),
           '{}'::text[]
         )
    from public.person p
   cross join lateral (
     select i.id, i.submitted_at, i.age_band, i.discipleship_goal_id, i.discipleship_goal_other
       from public.intake_submission i
      where i.person_id = p.id
      order by i.submitted_at desc, i.created_at desc, i.id desc
      limit 1
   ) latest
    left join public.discipleship_goal g on g.id = latest.discipleship_goal_id
   where p.ministry_id = target_ministry_id
     and app.is_admin_of(target_ministry_id);
$$;

comment on function public.suggestion_inputs(uuid) is
  'What each Person''s most recent Intake said, as Suggested Pairs ranks it: when '
  'it was given, whether their current decision on texts is yes, their age band, '
  'their Discipleship Goal as id and current wording or as the words they typed '
  'after Other, and the slots they selected as monday:08 keys. One row per Person '
  'with a submission; none for anyone without. Definer with the Admin test '
  'inside, like public.roster, because the consent rule is app.current_consent '
  'and that is not granted to authenticated.';

revoke execute on function public.suggestion_inputs(uuid) from public, anon, service_role;
grant execute on function public.suggestion_inputs(uuid) to authenticated;
