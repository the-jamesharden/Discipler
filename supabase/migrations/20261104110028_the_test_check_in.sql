-- The test check-in (Exponential launch, ticket 28; ADR-0031)
--
-- An Admin can send a real check-in to their own phone to see what their Leaders get.
-- It has its own table and state machine, so it names no relationship and reaches no
-- Meeting Response, no Concern and no count. Its texts are ordinary `outbound_message`
-- rows, through the same recipient check and texting gate as every other text.
--
-- Additive and safe to push ahead of the code: a new table, one nullable column, one new
-- function, and the Check-Ins page with one more key on what it answers.

create type test_check_in_ending as enum (
  'completed',
  'timed_out',
  'gave_way',
  'replaced',
  'opted_out'
);

create table test_check_in (
  id                  uuid primary key,
  ministry_id         uuid not null references ministry (id) on delete cascade,
  person_id           uuid not null references person (id) on delete cascade,
  -- The account, because the daily limit is per Admin.
  sent_by             uuid not null references auth.users (id) on delete cascade,
  phone               text not null,
  opened_at           timestamptz not null,
  -- The question last texted and when, which is what a reply is read against and what
  -- the hour runs from.
  question            text not null check (question in ('met', 'satisfaction', 'concern_detail')),
  asked_at            timestamptz not null,
  clarifications_sent integer not null default 0 check (clarifications_sent >= 0),
  -- Who `[name]` stands for, and the sentences it opened with: one test reads one way
  -- from first to last, whatever a Save does meanwhile, as `checkin_sequence.words` does.
  subject             text not null,
  words               jsonb not null,
  -- What it was answered, for the Test row on Check-Ins. What a concern's detail said is
  -- not kept: this is an Admin trying the product, and there is nobody to tell.
  met                 boolean,
  satisfaction        text check (satisfaction in ('outstanding', 'good', 'okay', 'concern')),
  ended_at            timestamptz,
  ended_how           test_check_in_ending,
  constraint test_check_in_an_ending_says_how check ((ended_at is null) = (ended_how is null))
);

comment on table test_check_in is
  'A check-in an Admin texted to their own phone. Counted nowhere, and naming no '
  'relationship. See docs/adr/0031-the-test-check-in-texts-an-admin.md.';

-- One open test on a phone in a church, which is what lets a reply have one meaning.
create unique index test_check_in_one_open_per_phone
  on test_check_in (ministry_id, phone)
  where ended_at is null;

-- What the reply router asks first on every inbound text, across churches.
create index test_check_in_open_by_phone
  on test_check_in (phone)
  where ended_at is null;

create index test_check_in_open_by_person
  on test_check_in (person_id)
  where ended_at is null;

-- The daily limit and the Check-Ins row, newest first.
create index test_check_in_sent_by_idx on test_check_in (ministry_id, sent_by, opened_at desc);
create index test_check_in_week_idx on test_check_in (ministry_id, opened_at desc);

alter table test_check_in enable row level security;
alter table test_check_in force row level security;

-- The Check-Ins tab reads a test through the page's one read. Not its words, its phone
-- or which question it is on, which no page draws.
revoke all on test_check_in from anon, authenticated, service_role;
grant select (id, ministry_id, person_id, opened_at, asked_at, met, satisfaction, ended_at, ended_how)
  on test_check_in to authenticated;
grant select, insert, update on test_check_in to discipler_command;

create policy test_check_in_read_own_ministry on test_check_in
  for select to authenticated
  using (app.is_admin_of(ministry_id));

create policy test_check_in_command on test_check_in
  for all to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

-- ---------------------------------------------------------------------------
-- A test that ends takes its unsent texts with it
-- ---------------------------------------------------------------------------

-- Nothing is texted when a test ends, and that includes a question still waiting on
-- Twilio's daily limit or a new church's week, which would otherwise arrive after the
-- test could take its answer. Null on every other text.
alter table outbound_message
  add column test_check_in_id uuid references test_check_in (id) on delete set null;

comment on column outbound_message.test_check_in_id is
  'The test check-in this text belongs to. Only so that a test that ends can close its '
  'unsent texts; what a test has been asked is on its own row.';

create index outbound_message_unsent_test_idx
  on outbound_message (test_check_in_id)
  where test_check_in_id is not null and sent_at is null and withheld_at is null;

comment on column outbound_message.withheld_reason is
  'Why the sending layer refused this message: the recipient opted out, lost SMS '
  'consent or was removed between enqueue and send, has no phone, the church held no '
  'access to texting when a drain reached it, or the test check-in it belonged to had '
  'ended. Final: a withheld row is never sent. Codes, never prose.';

-- ---------------------------------------------------------------------------
-- The reply router asks about a test first
-- ---------------------------------------------------------------------------

-- Whose open test this phone is answering, if it is answering one. Before
-- `app.sender_of_inbound`, which resolves to nobody for a phone two people on one Roster
-- share: their test's replies would otherwise be dropped. A phone in two churches is
-- answering the church whose shared number it texted, as there.
--
-- Whether its hour is up is the domain's to say, against the injected clock.
create function app.sender_of_open_test(candidate_phone text, texted_number text, lapsed_by timestamptz)
returns table (ministry_id uuid, person_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select t.ministry_id, t.person_id
    from public.test_check_in t
   where t.phone = candidate_phone
     and t.ended_at is null
     and t.asked_at > lapsed_by
     and (
       (select count(*) from public.test_check_in other
         where other.phone = candidate_phone and other.ended_at is null and other.asked_at > lapsed_by) = 1
       and (
         texted_number is null
         or not exists (select 1
                          from public.sending_number_assignment a
                         where a.phone = candidate_phone
                           and a.sending_number = texted_number)
         or exists (select 1
                      from public.sending_number_assignment a
                     where a.ministry_id = t.ministry_id
                       and a.phone = candidate_phone
                       and a.sending_number = texted_number)
       )
       or exists (select 1
                    from public.sending_number_assignment a
                   where a.ministry_id = t.ministry_id
                     and a.phone = candidate_phone
                     and a.sending_number = texted_number)
     );
$$;

revoke execute on function app.sender_of_open_test(text, text, timestamptz) from public, anon, authenticated, service_role;
grant execute on function app.sender_of_open_test(text, text, timestamptz) to discipler_command;

-- ---------------------------------------------------------------------------
-- Check-Ins shows them, apart
-- ---------------------------------------------------------------------------

-- The history it always answered, with the latest tests beside it. Enough for ten Admins
-- at the daily limit for a week; past that the oldest drop off this one list, which
-- counts nothing. Which of them fall in this week is
-- `isoWeekOf`'s to say in the reader, as for every row on the tab. `app.history_page`
-- is untouched, because a test is in nothing the Overview or Follow-Up derives from.
create or replace function public.check_ins_page()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  doc jsonb := app.history_page();
begin
  if doc ->> 'session' <> 'admin' then return doc; end if;
  return doc || jsonb_build_object(
    'test_check_ins', coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'id', latest.id,
                  'full_name', latest.full_name,
                  'opened_at', latest.opened_at,
                  'asked_at', latest.asked_at,
                  'met', latest.met,
                  'satisfaction', latest.satisfaction,
                  'ended_at', latest.ended_at,
                  'ended_how', latest.ended_how
                )
                order by latest.opened_at desc
              )
         from (select t.id, p.full_name, t.opened_at, t.asked_at, t.met, t.satisfaction, t.ended_at, t.ended_how
                 from public.test_check_in t
                 join public.person p on p.id = t.person_id
                where t.ministry_id = (doc -> 'admin' ->> 'ministry_id')::uuid
                order by t.opened_at desc
                limit 210) latest),
      '[]'::jsonb
    )
  );
end;
$$;

revoke execute on function public.check_ins_page() from public, anon, service_role;
grant execute on function public.check_ins_page() to authenticated;
