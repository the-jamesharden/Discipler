-- Custom questions (Pastor feedback, ticket 12)
-- ---------------------------------------------------------------------------
-- James, 2026-10-12: a Ministry adds questions of its own to either Intake form
-- -- short text, long text, one choice, several choices or yes/no. Their answers
-- show to an Admin on the person page and on the pair card and group card, under
-- the person they belong to, and are never used for matching.
--
-- The questions themselves live in the form's versioned document
-- (`intake_form_version.definition`, `20261014001100_the_intake_form_editor.sql`),
-- keyed `custom:<id>` beside Discipler's own. What is new here is where their
-- answers are kept and the reads that show them.
--
-- Nothing that pairs, ranks or filters people reads them: not `suggestion_inputs`,
-- not `roster`, not the pairing rules. A test asserts it of the functions as they
-- stand (`tests/integration/custom-questions.test.ts`).

-- ---------------------------------------------------------------------------
-- 1. The answers
-- ---------------------------------------------------------------------------
-- One row per question answered on one submission. A table of its own rather
-- than columns on `intake_submission`, which has one per question Discipler
-- asks: a Ministry's questions are its own and come and go with its form.
--
-- `answer` is what the question's kind stores, and never the wording of a
-- choice: the words typed (a string), the id of the one choice (a string), the
-- ids of the several (an array), or yes and no (a boolean). A choice is pointed
-- at by its id, so rewording it keeps every answer (ADR-0014). What each kind
-- stores is the domain's (`src/domain/own-answers.ts`); the check here holds the
-- shapes to the three it can be.
--
-- Kept per question key so that ticket 13, which removes a question with the
-- answers it deletes, counts them in one query.
create table intake_answer (
  id                   uuid primary key default gen_random_uuid(),
  ministry_id          uuid not null references ministry (id) on delete cascade,
  intake_submission_id uuid not null references intake_submission (id) on delete cascade,
  question_key         text not null check (question_key ~ '^custom:[0-9A-Za-z-]{1,64}$'),
  answer               jsonb not null check (jsonb_typeof(answer) in ('string', 'array', 'boolean')),
  created_at           timestamptz not null default now(),

  constraint intake_answer_once unique (intake_submission_id, question_key)
);

create index intake_answer_question_idx on intake_answer (ministry_id, question_key);

comment on table intake_answer is
  'The answers to a Ministry''s own Intake questions, one row per question on one '
  'submission. Shown to an Admin and never matched on: nothing that pairs, ranks '
  'or filters people reads this table. Appended with the submission and never '
  'changed; a later submission is a later set of rows.';

comment on column intake_answer.answer is
  'What the question''s kind stores: the words typed, the id of the one choice, '
  'the ids of the several, or true and false for yes and no. Never a choice''s '
  'wording, which lives in the form and may be reworded.';

-- An answer is what somebody said on a date, as the submission it belongs to is.
-- DELETE is left to the cascades and to ticket 13's removal.
create function app.reject_intake_answer_rewrite()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'intake_answer is what somebody said: % is not permitted', tg_op
    using errcode = 'restrict_violation';
end;
$$;

create trigger intake_answer_no_update
  before update on intake_answer
  for each row execute function app.reject_intake_answer_rewrite();

create trigger intake_answer_no_truncate
  before truncate on intake_answer
  for each statement execute function app.reject_intake_answer_rewrite();

alter table intake_answer enable row level security;
alter table intake_answer force row level security;

-- Admin-only, like the submission it belongs to. A Leader sees the people they
-- lead, not the answers those people gave.
create policy intake_answer_read_own_ministry on intake_answer
  for select to authenticated
  using (app.is_admin_of(ministry_id));

revoke all on intake_answer from anon, authenticated, service_role;
grant select on intake_answer to authenticated;
grant select, insert, delete on intake_answer to service_role;
-- Written with the submission, and read back to prefill the reopened page.
grant select, insert on intake_answer to discipler_command;

create policy intake_answer_command on intake_answer
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

-- ---------------------------------------------------------------------------
-- 2. The two reads every surface showing them shares
-- ---------------------------------------------------------------------------
-- The latest saved version of each of the Ministry's two forms, which is what
-- names an answer's question and its choices in the words they carry now. A form
-- never edited has no row and asks none of the Ministry's own questions. The
-- same read `intake_forms_page` makes under `intake_forms`.
create function app.intake_forms_now(target_ministry_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object(
                'form', latest.form,
                'version', latest.version,
                'definition', latest.definition)
              order by latest.form),
    '[]'::jsonb
  )
    from (select distinct on (v.form) v.form, v.version, v.definition
            from public.intake_form_version v
           where v.ministry_id = target_ministry_id
           order by v.form, v.version desc) latest;
$$;

-- The answers on one submission, by question key.
create function app.own_answers(target_submission_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('key', a.question_key, 'answer', a.answer)
              order by a.question_key),
    '[]'::jsonb
  )
    from public.intake_answer a
   where a.intake_submission_id = target_submission_id;
$$;

revoke execute on function app.intake_forms_now(uuid) from public, anon, service_role;
revoke execute on function app.own_answers(uuid) from public, anon, service_role;
grant execute on function app.intake_forms_now(uuid) to authenticated;
grant execute on function app.own_answers(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The pair card and the group card
-- ---------------------------------------------------------------------------
-- Restated whole from `20261014000800_the_group_card.sql`, with each person's
-- answers off the same latest submission their age band and goal come from
-- (`own_answers`), and the forms that word them (`intake_forms`). Everything it
-- returned before it still returns. The Overview, Check-Ins and Follow-Up compose
-- it by name, so all three show the answers.
create or replace function app.pair_card(target_ministry_id uuid, target_relationship_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'relationship_id', r.id,
    'name', r.name,
    -- Said on a Group's card (ticket 08): null where it declared none, which
    -- for a Group is mixed. Immutable since formation, so it is what the Group
    -- has always been.
    'declared_gender', r.declared_gender,
    'created_at', r.created_at,
    'accepted_at', r.accepted_at,

    -- One row per open membership. Who leads and who is discipled, and their
    -- names, come from the history the page already holds; these are the
    -- details the history does not carry.
    'people', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'person_id', m.person_id,
                'age_band', latest.age_band,
                'goal', g.label,
                'goal_other', latest.discipleship_goal_other,
                'own_answers', coalesce(app.own_answers(latest.id), '[]'::jsonb),
                'phone', c.phone,
                'email', c.email))
         from public.relationship_member m
         left join lateral (
           select i.id, i.age_band, i.discipleship_goal_id, i.discipleship_goal_other
             from public.intake_submission i
            where i.person_id = m.person_id
            order by i.submitted_at desc, i.created_at desc, i.id desc
            limit 1
         ) latest on true
         left join public.discipleship_goal g
           on g.id = latest.discipleship_goal_id
         left join public.pair_card_contacts(target_ministry_id, target_relationship_id) c
           on c.person_id = m.person_id
        where m.ministry_id = target_ministry_id
          and m.relationship_id = r.id
          and m.ended_at is null),
      '[]'::jsonb
    ),

    -- The Ministry's forms as they stand, which word the answers above.
    'intake_forms', app.intake_forms_now(target_ministry_id),

    -- The period running now: the Material, or none yet, and since when.
    'material', (
      select jsonb_build_object('title', mat.title, 'started_at', a.started_at)
        from public.material_assignment a
        left join public.material mat
          on mat.id = a.material_id
       where a.ministry_id = target_ministry_id
         and a.relationship_id = r.id
         and a.ended_at is null
       order by a.started_at desc
       limit 1
    ),

    -- Every reading of a Concern on this pair that is still unresolved, newest
    -- first, with the reader's name where they are on this Roster and whether
    -- it was the signed-in Admin's own. A resolved
    -- Concern's readings are left out: its words are gone and the card says
    -- nothing of it.
    'readings', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'concern_id', v.concern_id,
                'viewed_at', v.viewed_at,
                'viewer_name', reader.full_name,
                'by_this_reader', coalesce(v.viewed_by = (select auth.uid()), false))
              order by v.viewed_at desc, v.id)
         from public.concern_viewing v
         join public.concern c
           on c.id = v.concern_id
          and c.ministry_id = v.ministry_id
         left join public.person reader
           on reader.user_id = v.viewed_by
          and reader.ministry_id = v.ministry_id
        where v.ministry_id = target_ministry_id
          and c.relationship_id = r.id
          and c.resolved_at is null),
      '[]'::jsonb
    ),

    -- The signed-in Admin's own name, for the reading that opening the card
    -- records after this document is read.
    'reader_name', (
      select p.full_name
        from public.person p
       where p.ministry_id = target_ministry_id
         and p.user_id = (select auth.uid())
       limit 1
    )
  )
    from public.relationship r
   where r.id = target_relationship_id
     and r.ministry_id = target_ministry_id
     and r.ended_at is null;
$$;

revoke execute on function app.pair_card(uuid, uuid) from public, anon, service_role;
grant execute on function app.pair_card(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Follow-Up's card about a Person on no pair
-- ---------------------------------------------------------------------------
-- Restated whole from `20261014001000_follow_up_opens_the_card.sql`, with each
-- subject's answers and the forms that word them, for the reason the pair card
-- carries them: the card draws a subject as it draws a person on a pair. And
-- with who has read the Concerns still unresolved on a relationship that has
-- ended, whose card is theirs alone.
create or replace function app.follow_up_card(target_ministry_id uuid, card_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with named as (
    -- The item the card is named by, where it is named by an item.
    select f.person_id, f.relationship_id
      from public.follow_up_item f
     where f.ministry_id = target_ministry_id
       and f.id = card_id
  ),
  standing as (
    select distinct f.person_id
      from public.follow_up_item f
     where f.ministry_id = target_ministry_id
       and f.resolved_at is null
       and f.person_id is not null
       and (f.relationship_id = card_id or f.id = card_id)
  )
  select jsonb_build_object(
    'subjects', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'person_id', s.person_id,
                'age_band', latest.age_band,
                'goal', g.label,
                'goal_other', latest.discipleship_goal_other,
                'own_answers', coalesce(app.own_answers(latest.id), '[]'::jsonb),
                'phone', c.phone,
                'email', c.email))
         from standing s
         left join lateral (
           select i.id, i.age_band, i.discipleship_goal_id, i.discipleship_goal_other
             from public.intake_submission i
            where i.person_id = s.person_id
            order by i.submitted_at desc, i.created_at desc, i.id desc
            limit 1
         ) latest on true
         left join public.discipleship_goal g
           on g.id = latest.discipleship_goal_id
         left join lateral public.person_card_contacts(target_ministry_id, s.person_id) c
           on true),
      '[]'::jsonb
    ),

    'intake_forms', app.intake_forms_now(target_ministry_id),

    'earlier', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', f.id,
                'kind', f.kind,
                'payload', f.payload,
                'raised_at', f.raised_at,
                'resolved_at', f.resolved_at,
                'person_name', who.full_name,
                'resolver_name', resolver.full_name)
              order by f.raised_at desc, f.id)
         from public.follow_up_item f
         left join public.person who
           on who.id = f.person_id
          and who.ministry_id = f.ministry_id
         left join public.person resolver
           on resolver.user_id = f.resolved_by
          and resolver.ministry_id = f.ministry_id
        where f.ministry_id = target_ministry_id
          and f.resolved_at is not null
          and (f.relationship_id = card_id
               or exists (
                 select 1 from named n
                  where n.person_id = f.person_id
                     or n.relationship_id = f.relationship_id
               ))),
      '[]'::jsonb
    ),

    'earlier_concerns', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'id', c.id,
                'raised_at', c.raised_at,
                'raised_by_name', raiser.full_name,
                'resolved_at', c.resolved_at,
                'resolver_name', resolver.full_name)
              order by c.raised_at desc, c.id)
         from public.concern c
         left join public.person raiser
           on raiser.id = c.raised_by
          and raiser.ministry_id = c.ministry_id
         left join public.person resolver
           on resolver.user_id = c.resolved_by
          and resolver.ministry_id = c.ministry_id
        where c.ministry_id = target_ministry_id
          and c.relationship_id = card_id
          and c.resolved_at is not null),
      '[]'::jsonb
    ),

    -- For a relationship that has ended with Concerns still unresolved, which
    -- `app.pair_card` no longer opens: ending a pair resolves none of them, so
    -- the card of their own is where they are read and resolved. Who has read
    -- them, as `app.pair_card` says it, and the signed-in Admin's own name.
    'readings', coalesce(
      (select jsonb_agg(jsonb_build_object(
                'concern_id', v.concern_id,
                'viewed_at', v.viewed_at,
                'viewer_name', reader.full_name,
                'by_this_reader', coalesce(v.viewed_by = (select auth.uid()), false))
              order by v.viewed_at desc, v.id)
         from public.concern_viewing v
         join public.concern c
           on c.id = v.concern_id
          and c.ministry_id = v.ministry_id
         left join public.person reader
           on reader.user_id = v.viewed_by
          and reader.ministry_id = v.ministry_id
        where v.ministry_id = target_ministry_id
          and c.relationship_id = card_id
          and c.resolved_at is null),
      '[]'::jsonb
    ),

    'reader_name', (
      select p.full_name
        from public.person p
       where p.ministry_id = target_ministry_id
         and p.user_id = (select auth.uid())
       limit 1
    )
  );
$$;

revoke execute on function app.follow_up_card(uuid, uuid) from public, anon, service_role;
grant execute on function app.follow_up_card(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The person page
-- ---------------------------------------------------------------------------
-- The person page's own document (`person_page`, the Roster's) with that one
-- Person's answers beside it, off their latest submission, and the forms that
-- word them. Its own function, as `overview_card_page` is, because the Roster's
-- document is not asked to take a parameter every alias of it would have to pass
-- along -- and because the Roster row never shows these answers, so the Roster's
-- document does not carry them. `person_page()` stays for the code that still
-- calls it until this ships (ADR-0023).
create function public.person_intake_page(intake_person_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  doc jsonb := public.person_page();
  ministry uuid;
begin
  if doc ->> 'session' <> 'admin' then return doc; end if;
  ministry := (doc -> 'admin' ->> 'ministry_id')::uuid;
  return doc || jsonb_build_object(
    'own_answers', coalesce(
      (select app.own_answers(latest.id)
         from (select i.id
                 from public.intake_submission i
                where i.ministry_id = ministry
                  and i.person_id = intake_person_id
                order by i.submitted_at desc, i.created_at desc, i.id desc
                limit 1) latest),
      '[]'::jsonb
    ),
    'intake_forms', app.intake_forms_now(ministry)
  );
end;
$$;

revoke execute on function public.person_intake_page(uuid) from public, anon, service_role;
grant execute on function public.person_intake_page(uuid) to authenticated;
