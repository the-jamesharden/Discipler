-- Suggestions beyond the one-to-one, ticket 01 -- the one-to-two answers are counted
--
-- The one-to-two question is one of Discipler's own on the mentor and mentee
-- form, the first-time question's twin, and like it may be removed by an Admin
-- (Pastor feedback, ticket 13). The editor warns how many people's answers a
-- removal deletes before the second press, and reads that number here, so the
-- answer joins the columns counted.
--
-- Restated whole from `20261014001300_removing_a_question.sql` with one row
-- added to the lateral list. The signature is unchanged, so `create or replace`
-- keeps the grants; they are restated anyway, as every migration here does.
-- ---------------------------------------------------------------------------

create or replace function app.intake_answer_counts(target_ministry_id uuid)
returns table (
  form public.intake_path,
  question_key text,
  people bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with submissions as (
    select f.form, f.person_id, i.id, i.age_band, i.gender, i.first_time, i.one_to_two,
           i.discipleship_goal_id, i.discipleship_goal_other
      from app.intake_submission_forms(target_ministry_id) f
      join public.intake_submission i on i.id = f.intake_submission_id
  )
  select s.form, q.question_key, count(distinct s.person_id)
    from submissions s
   cross join lateral (values
     ('ageBand', s.age_band is not null),
     ('gender', s.gender is not null),
     ('experience', s.first_time is not null),
     ('oneToTwo', s.one_to_two is not null),
     ('goalId', s.discipleship_goal_id is not null or s.discipleship_goal_other is not null),
     ('availability', exists (select 1
                                from public.intake_availability a
                               where a.intake_submission_id = s.id))
   ) as q (question_key, answered)
   where q.answered
   group by s.form, q.question_key
  union all
  select 'discipleship'::public.intake_path, 'side', count(distinct c.person_id)
    from public.consent_record c
   where c.ministry_id = target_ministry_id
     and c.intake_path = 'discipleship'
     and c.declared_side is not null
  having count(*) > 0
  union all
  select null, a.question_key, count(distinct i.person_id)
    from public.intake_answer a
    join public.intake_submission i on i.id = a.intake_submission_id
   where a.ministry_id = target_ministry_id
   group by a.question_key;
$$;

comment on function app.intake_answer_counts(uuid) is
  'How many people have answered each question, per Intake form: what a removal '
  'of that question deletes. The Ministry''s own questions by key, with no form.';

revoke execute on function app.intake_answer_counts(uuid) from public, anon, service_role;
grant execute on function app.intake_answer_counts(uuid) to authenticated;
