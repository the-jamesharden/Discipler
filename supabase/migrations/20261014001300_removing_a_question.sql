-- Removing a question, including one the product uses (Pastor feedback, ticket 13)
-- ---------------------------------------------------------------------------
-- James, 2026-10-12: any question but the name and the mobile number can be
-- removed from either Intake form. Removing takes two presses, says how many
-- people's answers it deletes, and for a question the product reads says plainly
-- what stops working. ADR-0014 is the one removal rule, now for every question
-- and not only a goal option: the live tables lose the answers, and the
-- removal's history event keeps what they said.
--
-- The form itself is a new version without the question, which ticket 11's
-- table already holds. What this file adds is somewhere for each of Discipler's
-- own questions to be unanswered, the reads that say which form a submission
-- answered and how many people answered each question, and the forms on the
-- documents of the surfaces that say what they do without one.

-- ---------------------------------------------------------------------------
-- 1. A submission may not have been asked the age band or the gender
-- ---------------------------------------------------------------------------
-- Null where the form no longer asks it, or where it was asked and the
-- Ministry has since removed the question and its answers. A form that asks
-- either asks it of everybody, so null never means *skipped*.
alter table intake_submission
  alter column age_band drop not null,
  alter column gender drop not null;

comment on column intake_submission.age_band is
  'The age band the Person gave. Null where the form they answered no longer '
  'asks it, or the Ministry removed the question and with it every answer '
  '(ADR-0014). The age rule cannot be applied to somebody without one.';

comment on column intake_submission.gender is
  'The gender the Person gave. Null where the form they answered no longer asks '
  'it, or the Ministry removed the question and with it every answer '
  '(ADR-0014). The gender pairing rules cannot be applied to somebody without '
  'one: both relationship_member triggers let a null through, and Suggested '
  'Pairs says so while the form does not ask.';

-- ---------------------------------------------------------------------------
-- 2. The side may be taken off a consent record, and nothing else may change
-- ---------------------------------------------------------------------------
-- The matching question's answer is stored on the consent records its
-- submission writes, beside the path, because that is where the wizard put it
-- (`20260918000100_the_discipleship_wizard.sql`). Removing the question deletes
-- its answers like any other's, so the one change a consent record now takes is
-- its side going to null. What anybody agreed to, the wording version, when, how
-- they reached the form and which form it was are untouched: an update that
-- changes any of those, or that sets a side rather than clearing one, is still
-- refused. DELETE and TRUNCATE are as they were.
create or replace function app.reject_consent_rewrite()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if old.declared_side is not null
       and new.declared_side is null
       and (to_jsonb(new) - 'declared_side') = (to_jsonb(old) - 'declared_side') then
      return new;
    end if;
  end if;
  raise exception
    'consent_record records what a Person agreed to and when: % is not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;

comment on function app.reject_consent_rewrite() is
  'Refuses every update and truncate of consent_record but one: an update that '
  'clears declared_side and changes nothing else, which is a removed matching '
  'question deleting its answers (Pastor feedback, ticket 13; ADR-0014).';

-- The discipleship path may now have no side: its form no longer asks it. A
-- side still belongs to that path and no other. Written as a CASE for the
-- reason the constraint it replaces gives: an OR over a null path is null, and a
-- check constraint lets null through.
alter table consent_record
  drop constraint consent_record_declared_side_follows_the_path;

alter table consent_record
  add constraint consent_record_declared_side_follows_the_path
    check (
      case
        when declared_side is null then true
        when intake_path = 'discipleship' then true
        else false
      end
    );

-- The column and nothing else, so the grant says what the trigger says.
grant update (declared_side) on consent_record to discipler_command;

create policy consent_record_command_clear_side on consent_record
  for update to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

-- ---------------------------------------------------------------------------
-- 3. A Ministry's own question's answers may be deleted
-- ---------------------------------------------------------------------------
-- `20261014001200_custom_questions.sql` left DELETE to the cascades and to this
-- ticket. The policy it wrote is already `for all` to the command role.
grant delete on intake_answer to discipler_command;

-- ---------------------------------------------------------------------------
-- 4. Which form a submission answered
-- ---------------------------------------------------------------------------
-- A submission is from the groups form where the consent records written with
-- it say so, and from the mentor and mentee form otherwise. A submission whose
-- records name no form -- every one before the wizard, and the tokenized reopen
-- link's -- is the form the Person had last answered when they made it, by
-- their latest consent record by then that names one, which is the form the
-- reopened page drew its questions from (ticket 12); and the mentor and mentee
-- form where none does. A form they answered only afterwards is not it.
--
-- Read by a removal, which deletes the answers given on the form it is removed
-- from and not on the other, and by the counts the editor warns with.
create function app.intake_submission_forms(target_ministry_id uuid)
returns table (
  intake_submission_id uuid,
  person_id uuid,
  submitted_at timestamptz,
  form public.intake_path
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id,
         s.person_id,
         s.submitted_at,
         coalesce(
           (select c.intake_path
              from public.consent_record c
             where c.person_id = s.person_id
               and c.decided_at = s.submitted_at
               and c.intake_path is not null
             order by c.created_at desc, c.id desc
             limit 1),
           (select c.intake_path
              from public.consent_record c
             where c.person_id = s.person_id
               and c.intake_path is not null
               and c.decided_at <= s.submitted_at
             order by c.decided_at desc, c.created_at desc, c.id desc
             limit 1),
           'discipleship'::public.intake_path
         )
    from public.intake_submission s
   where s.ministry_id = target_ministry_id;
$$;

comment on function app.intake_submission_forms(uuid) is
  'Every submission in the Ministry with the Intake form it answered: the groups '
  'form where its consent records say so, otherwise the mentor and mentee form. '
  'A submission whose records name no form takes the form the Person last '
  'answered. Invoker, so the caller''s policies scope it.';

revoke execute on function app.intake_submission_forms(uuid) from public, anon, service_role;
grant execute on function app.intake_submission_forms(uuid) to authenticated, discipler_command;

-- ---------------------------------------------------------------------------
-- 5. How many people a removal would cost
-- ---------------------------------------------------------------------------
-- Per form and question, how many people have an answer on any submission made
-- from that form: the people whose answers a removal deletes, which is the
-- number the editor warns with before the second press. A Ministry's own
-- question is counted by its key whichever form it came from, as a removal
-- deletes it, and carries no form. The email and the choice of group are not
-- here: a removal deletes neither (`removalDeletesAnswers` in
-- `src/domain/intake-form.ts`).
create function app.intake_answer_counts(target_ministry_id uuid)
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
    select f.form, f.person_id, i.id, i.age_band, i.gender, i.first_time,
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

-- ---------------------------------------------------------------------------
-- 6. Intake forms carries the counts
-- ---------------------------------------------------------------------------
-- Restated whole from `20261014001100_the_intake_form_editor.sql`, with
-- `answer_counts` added.
create or replace function public.intake_forms_page()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  doc jsonb := app.page_session();
  ministry uuid;
begin
  if doc ->> 'session' <> 'admin' then return doc; end if;
  ministry := (doc -> 'admin' ->> 'ministry_id')::uuid;
  return doc || jsonb_build_object(
    'groups', coalesce(
      (select jsonb_agg(to_jsonb(g)) from public.ministry_groups(ministry) g),
      '[]'::jsonb
    ),
    'join_requests', coalesce(
      (select jsonb_agg(to_jsonb(j)) from public.group_join_requests(ministry) j),
      '[]'::jsonb
    ),
    'goal_options', coalesce(
      (select jsonb_agg(to_jsonb(o)) from public.discipleship_goal_options(ministry) o),
      '[]'::jsonb
    ),
    'people', app.names_of(array(select p.id from public.person p where p.ministry_id = ministry)),

    'materials', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', m.id,
                'title', m.title,
                'removed', m.removed)
              order by m.title, m.created_at)
         from public.material m
        where m.ministry_id = ministry),
      '[]'::jsonb
    ),

    'group_materials', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'relationship_id', a.relationship_id,
                'material_id', a.material_id,
                'started_at', a.started_at)
              order by a.relationship_id)
         from public.material_assignment a
         join public.relationship r on r.id = a.relationship_id
        where a.ministry_id = ministry
          and a.ended_at is null
          and r.kind = 'group'
          and r.ended_at is null),
      '[]'::jsonb
    ),

    'timezone', (select m.timezone from public.ministry m where m.id = ministry),
    'short_name', (select m.short_name from public.ministry m where m.id = ministry),

    'intake_forms', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'form', latest.form,
                'version', latest.version,
                'definition', latest.definition)
              order by latest.form)
         from (select distinct on (v.form) v.form, v.version, v.definition
                 from public.intake_form_version v
                where v.ministry_id = ministry
                order by v.form, v.version desc) latest),
      '[]'::jsonb
    ),

    'answer_counts', coalesce(
      (select jsonb_agg(to_jsonb(c) order by c.form, c.question_key)
         from app.intake_answer_counts(ministry) c),
      '[]'::jsonb
    )
  );
end;
$$;

revoke execute on function public.intake_forms_page() from public, anon, service_role;
grant execute on function public.intake_forms_page() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Suggested Pairs and Settings carry which of Discipler's questions each
--    form asks
-- ---------------------------------------------------------------------------
-- Each says what it does without a question a form no longer asks. What they
-- are told is the keys of Discipler's own questions on the latest version of
-- each form the Ministry has edited, and nothing else: not the form's words,
-- and not the Ministry's own questions, which nothing that pairs people reads
-- (ticket 12). A form never edited is absent and asks everything.
create function app.intake_forms_asked(target_ministry_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object(
                'form', latest.form,
                'asks', coalesce(
                  (select jsonb_agg(asked.question ->> 'key')
                     from jsonb_array_elements(latest.definition -> 'pages') as page (body)
                    cross join jsonb_array_elements(page.body -> 'questions') as asked (question)
                    where (asked.question ->> 'key') not like 'custom:%'),
                  '[]'::jsonb))
              order by latest.form),
    '[]'::jsonb
  )
    from (select distinct on (v.form) v.form, v.definition
            from public.intake_form_version v
           where v.ministry_id = target_ministry_id
           order by v.form, v.version desc) latest;
$$;

comment on function app.intake_forms_asked(uuid) is
  'Which of Discipler''s own questions the latest version of each Intake form '
  'the Ministry has edited asks, by key. Never the Ministry''s own questions.';

revoke execute on function app.intake_forms_asked(uuid) from public, anon, service_role;
grant execute on function app.intake_forms_asked(uuid) to authenticated;
--
-- `suggested_pairs_page` restated whole from `20261007000100_suggested_pairs.sql`
-- with `intake_forms_asked` added.
create or replace function public.suggested_pairs_page()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  doc jsonb := public.roster_page();
  ministry uuid;
begin
  if doc ->> 'session' <> 'admin' then return doc; end if;
  ministry := (doc -> 'admin' ->> 'ministry_id')::uuid;
  return doc || jsonb_build_object(
    -- The two constraints, off the Ministry row under the membership policy, as
    -- `settings_page()` reads them. Never constants: a Ministry varies both.
    'suggest_gender_match', (select m.suggest_gender_match
                               from public.ministry m
                              where m.id = ministry),
    'suggest_max_age_band_gap', (select m.suggest_max_age_band_gap
                                   from public.ministry m
                                  where m.id = ministry),
    'suggestion_inputs', coalesce(
      (select jsonb_agg(to_jsonb(s)) from public.suggestion_inputs(ministry) s),
      '[]'::jsonb
    ),
    -- What the mentor and mentee form no longer asks is what the tab says it is
    -- doing without (ticket 13).
    'intake_forms_asked', app.intake_forms_asked(ministry)
  );
end;
$$;

revoke execute on function public.suggested_pairs_page() from public, anon, service_role;
grant execute on function public.suggested_pairs_page() to authenticated;

-- `settings_page` restated whole from `20260926000100_a_page_is_one_read.sql`
-- with `intake_forms_asked` added: the Pairing section says when a form no
-- longer asks what its two rules read.
create or replace function public.settings_page()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  doc jsonb := app.page_session();
  ministry uuid;
begin
  if doc ->> 'session' <> 'admin' then return doc; end if;
  ministry := (doc -> 'admin' ->> 'ministry_id')::uuid;
  return doc || jsonb_build_object(
    'settings', (select to_jsonb(s) from public.ministry_settings(ministry) s limit 1),
    'intake_forms_asked', app.intake_forms_asked(ministry)
  );
end;
$$;

revoke execute on function public.settings_page() from public, anon, service_role;
grant execute on function public.settings_page() to authenticated;
