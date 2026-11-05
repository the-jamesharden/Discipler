-- Ask Discipler, the AI guide (Exponential launch, ticket 31)
--
-- Additive and safe to push ahead of the code: one column with a default, two new
-- tables, two new functions, and one new key on the page session.
--
-- **One row is one question and its answer.** A chat is the rows of one sign-in: the
-- `session_id` on the token stays the same while the Admin stays signed in, and a new
-- sign-in has a new one, so a fresh chat needs no row and no button to start it.
--
-- None of this is ministry history and none of it writes a `ministry_event`. A chat
-- says nothing about the church, is deleted after a fixed time, and is its author's.

-- ---------------------------------------------------------------------------
-- Whether this Admin has tucked the bubble away
-- ---------------------------------------------------------------------------

-- On the membership because it is about one Admin, as the setup meter's bookmark is.
alter table ministry_member
  add column ask_discipler_tucked boolean not null default false;

comment on column ministry_member.ask_discipler_tucked is
  'Whether this Admin has tucked Ask Discipler into its tab on the right edge.';

-- Column by column, so the command connection still cannot change who is an Admin. The
-- policy `ministry_member_command_setup_seen` already holds an update to this church's
-- Admins.
grant update (ask_discipler_tucked) on ministry_member to discipler_command;

-- ---------------------------------------------------------------------------
-- The chats
-- ---------------------------------------------------------------------------

create table ask_discipler_question (
  id          uuid primary key default gen_random_uuid(),
  ministry_id uuid not null references ministry (id) on delete cascade,
  user_id     uuid not null,
  -- The `session_id` claim on the token the question came with. Not a foreign key:
  -- a session is Auth's to end, and a chat outlives it until its day comes.
  session_id  uuid not null,
  -- The limit is `LONGEST_QUESTION` in `src/domain/ask-discipler.ts`, held here too so
  -- no writer can keep more than the box lets anybody type.
  question    text not null
    constraint ask_discipler_question_fits check (char_length(question) between 1 and 1000),
  -- Null while it is being answered, and for good when the model was paid for and gave no
  -- whole answer, which still counts toward the day. A failure before the model was paid
  -- for deletes the row, which is what stops it counting.
  answer      text,
  asked_at    timestamptz not null,
  answered_at timestamptz,

  constraint ask_discipler_question_member_fk
    foreign key (ministry_id, user_id) references ministry_member (ministry_id, user_id)
    on delete cascade
);

-- The day's count, and one sign-in's chat.
create index ask_discipler_question_by_author on ask_discipler_question (user_id, asked_at);
create index ask_discipler_question_by_chat on ask_discipler_question (user_id, session_id, asked_at);
-- The tick's deleting.
create index ask_discipler_question_by_age on ask_discipler_question (asked_at);
create index ask_discipler_question_of_a_church on ask_discipler_question (ministry_id);

alter table ask_discipler_question enable row level security;
alter table ask_discipler_question force  row level security;

revoke all on ask_discipler_question from anon, authenticated, service_role, discipler_command;

-- **Their own and nobody else's, even inside their own church.** Another Admin of the
-- church cannot read it, and there is no page that lists anybody's chats.
grant select on ask_discipler_question to authenticated;

create policy ask_discipler_question_read_own on ask_discipler_question
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Writes arrive on the trusted connection for one church, named first, and the store
-- names the author on every statement. The tick's deleting is the operator's.
grant select, insert, delete on ask_discipler_question to discipler_command;
grant update (answer, answered_at) on ask_discipler_question to discipler_command;

create policy ask_discipler_question_command on ask_discipler_question
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

comment on table ask_discipler_question is
  'One question an Admin asked Ask Discipler, and its answer. Readable only by its author, '
  'never listed, and deleted by the tick once older than AI_GUIDE_CHAT_KEPT_DAYS.';

-- ---------------------------------------------------------------------------
-- The months the gateway stopped answering
-- ---------------------------------------------------------------------------

-- So support@ is emailed once when the monthly spend cap is reached, however many
-- Admins go on asking. It belongs to no church, so it takes the `ministry_setup` shape.
create table ask_discipler_spend_stop (
  -- `2026-11`, in UTC, the boundary the gateway's budgets reset on.
  month      text primary key
    constraint ask_discipler_spend_stop_month_is_a_month check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  stopped_at timestamptz not null
);

alter table ask_discipler_spend_stop enable row level security;
alter table ask_discipler_spend_stop force  row level security;

revoke all on ask_discipler_spend_stop from anon, authenticated, service_role, discipler_command;

comment on table ask_discipler_spend_stop is
  'Each UTC month the AI Gateway refused Ask Discipler for spending, so support@ hears once.';

-- ---------------------------------------------------------------------------
-- The chat, read when it is opened
-- ---------------------------------------------------------------------------

-- Where a day starts for a church, in the church's own zone: "you can ask again
-- tomorrow" means its tomorrow, like every other day Discipler counts.
create function app.start_of_local_day(at timestamptz, zone text)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select pg_catalog.timezone(zone, pg_catalog.date_trunc('day', pg_catalog.timezone(zone, at)))
$$;

revoke execute on function app.start_of_local_day(timestamptz, text) from public, anon, service_role;
grant execute on function app.start_of_local_day(timestamptz, text) to authenticated, discipler_command;

-- A document, as a page is (ADR-0023), read when the chat is opened and at no other
-- time, so a page that is only looked at makes no extra call. Security invoker, so the
-- rows come through the policy above; the session names the chat, so no argument can
-- name somebody else's.
--
-- `chat` holds what was answered. A question still being answered in another tab has
-- no answer to show, and counts in `asked_today` because it holds a place in the day.
create function public.ask_discipler_page()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  doc jsonb := app.page_session();
  ministry uuid;
  zone text;
  uid uuid := (select auth.uid());
  this_session uuid := nullif((select auth.jwt()) ->> 'session_id', '')::uuid;
begin
  if doc ->> 'session' <> 'admin' then return doc; end if;
  ministry := (doc -> 'admin' ->> 'ministry_id')::uuid;
  select m.timezone into zone from public.ministry m where m.id = ministry;

  return doc || jsonb_build_object(
    'chat', coalesce(
      (select jsonb_agg(jsonb_build_object('id', q.id, 'question', q.question, 'answer', q.answer)
                        order by q.asked_at, q.id)
         from public.ask_discipler_question q
        where q.user_id = uid
          and q.session_id = this_session
          and q.answer is not null),
      '[]'::jsonb
    ),
    'asked_today', coalesce(
      (select jsonb_agg(jsonb_build_object('asked_at', q.asked_at) order by q.asked_at, q.id)
         from public.ask_discipler_question q
        where q.user_id = uid
          and q.ministry_id = ministry
          and q.asked_at >= app.start_of_local_day(now(), zone)),
      '[]'::jsonb
    )
  );
end;
$$;

revoke execute on function public.ask_discipler_page() from public, anon, service_role;
grant execute on function public.ask_discipler_page() to authenticated;

-- ---------------------------------------------------------------------------
-- The page session
-- ---------------------------------------------------------------------------

-- The newest definition (`20261104103000_whats_new_dismissals.sql`), with
-- `ask_discipler_tucked` added to `admin` and nothing else changed.
create or replace function app.page_session()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  membership record;
  own record;
begin
  if uid is null or not public.session_is_live() then
    return jsonb_build_object('session', 'signed-out');
  end if;

  select mm.ministry_id, m.name, mm.ask_discipler_tucked
    into membership
    from public.ministry_member mm
    left join public.ministry m on m.id = mm.ministry_id
   where mm.user_id = uid
     and mm.tier = 'admin'
   order by mm.created_at
   limit 1;

  if not found then
    return jsonb_build_object('session', 'not-an-admin', 'user_id', uid);
  end if;

  select p.id, p.full_name
    into own
    from public.person p
   where p.ministry_id = membership.ministry_id
     and p.user_id = uid
   limit 1;

  return jsonb_build_object(
    'session', 'admin',
    'user_id', uid,
    'admin', jsonb_build_object(
      'ministry_id', membership.ministry_id,
      'ministry_name', membership.name,
      'person_id', own.id,
      'full_name', own.full_name,
      'whats_new_dismissed', (
        select coalesce(jsonb_agg(d.entry_id order by d.entry_id), '[]'::jsonb)
          from public.whats_new_dismissal d
         where d.ministry_id = membership.ministry_id
           and d.user_id = uid
      ),
      'ask_discipler_tucked', membership.ask_discipler_tucked
    ),
    'billing', (select to_jsonb(s) from app.billing_state_of(membership.ministry_id) s),
    'setup', app.setup_meter_of(membership.ministry_id)
  );
end;
$$;

revoke execute on function app.page_session() from public, anon, service_role;
grant execute on function app.page_session() to authenticated;
