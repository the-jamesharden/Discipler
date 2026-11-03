-- ---------------------------------------------------------------------------
-- The Help menu's contact, bug and feature form (Exponential launch, ticket 25)
-- ---------------------------------------------------------------------------
--
-- Two tables and one shape. A signed-in Admin's submission is stored with the church,
-- and written as `discipler_command` for that one church. Anybody else's belongs to no
-- church, so it is operator-only, like a pending sign-up.
--
-- **Nothing a page can read holds a submission.** There is no grant to `authenticated`
-- on either table and no policy for it, and no page function reads them: support reads
-- the email, and the operator reads the row on the trusted connection.
--
-- Rows are kept for as long as `SUPPORT_SUBMISSIONS` in `src/domain/launch-terms.ts`
-- says, which the privacy policy promises, then the tick deletes them on the trusted
-- connection. The limits on the message and the address are the email's own, in
-- `src/domain/email.ts`, and hold here too so no writer can keep what could not be sent.

create table support_submission (
  id           uuid primary key default gen_random_uuid(),
  ministry_id  uuid not null references ministry (id) on delete cascade,
  -- The Admin's account, from the session. Counted against the hourly limit, and not
  -- a foreign key, because a row that outlives the account still has to be deleted on
  -- its own day.
  submitted_by uuid not null,
  kind         text not null
    constraint support_submission_kind_is_known check (kind in ('support', 'bug', 'feature')),
  message      text not null
    constraint support_submission_message_fits check (char_length(message) between 1 and 5000),
  -- What they typed, to write back to. No account has an email of its own yet.
  reply_to     text not null
    constraint support_submission_reply_to_fits check (char_length(reply_to) <= 254),
  -- A path with its IDs taken out, and a browser's own description of itself. Never
  -- what was on the page.
  page_address text
    constraint support_submission_page_address_fits check (char_length(page_address) <= 200),
  browser      text
    constraint support_submission_browser_fits check (char_length(browser) <= 200),
  submitted_at timestamptz not null,
  -- Null until it has reached the mail vendor, and the tick sends what is still null.
  emailed_at   timestamptz,

  constraint support_submission_only_a_bug_attaches
    check (kind = 'bug' or (page_address is null and browser is null))
);

create index support_submission_by_sender on support_submission (submitted_by, submitted_at);
create index support_submission_by_age on support_submission (submitted_at);
create index support_submission_waiting on support_submission (submitted_at) where emailed_at is null;
create index support_submission_of_a_church on support_submission (ministry_id);

alter table support_submission enable row level security;
alter table support_submission force  row level security;

revoke all on support_submission from anon, authenticated, service_role, discipler_command;

-- `select` because counting against the limit and `returning id` both need it, and
-- only ever this church's. No update and no delete: those are the operator's.
grant select, insert on support_submission to discipler_command;

create policy support_submission_command_read on support_submission
  for select to discipler_command
  using (ministry_id = app.command_ministry_id());
create policy support_submission_command_add on support_submission
  for insert to discipler_command
  with check (ministry_id = app.command_ministry_id());

comment on table support_submission is
  'What a signed-in Admin sent through the Help menu''s form. Readable by nobody in the '
  'app; deleted by the tick once it is older than the privacy policy promises to keep it.';

-- The `ministry_setup` shape: it belongs to no church, so there is no policy to scope
-- it with and no policy at all, and every API role is refused.
create table signed_out_support_submission (
  id             uuid primary key default gen_random_uuid(),
  -- SHA-256 of a namespaced key, made in `src/platform/supabase/support-submissions.ts`,
  -- because counting needs only that two came from the same network.
  network_digest text not null
    constraint signed_out_support_submission_network_is_sha256 check (network_digest ~ '^[0-9a-f]{64}$'),
  kind           text not null
    constraint signed_out_support_submission_kind_is_known check (kind in ('support', 'bug', 'feature')),
  message        text not null
    constraint signed_out_support_submission_message_fits check (char_length(message) between 1 and 5000),
  reply_to       text not null
    constraint signed_out_support_submission_reply_to_fits check (char_length(reply_to) <= 254),
  page_address   text
    constraint signed_out_support_submission_page_address_fits check (char_length(page_address) <= 200),
  browser        text
    constraint signed_out_support_submission_browser_fits check (char_length(browser) <= 200),
  submitted_at   timestamptz not null,
  emailed_at     timestamptz,

  constraint signed_out_support_submission_only_a_bug_attaches
    check (kind = 'bug' or (page_address is null and browser is null))
);

create index signed_out_support_submission_by_network on signed_out_support_submission (network_digest, submitted_at);
create index signed_out_support_submission_by_age on signed_out_support_submission (submitted_at);
create index signed_out_support_submission_waiting on signed_out_support_submission (submitted_at) where emailed_at is null;

alter table signed_out_support_submission enable row level security;
alter table signed_out_support_submission force  row level security;

revoke all on signed_out_support_submission from anon, authenticated, service_role, discipler_command;

comment on table signed_out_support_submission is
  'What somebody not signed in as an Admin sent through the support form, behind Turnstile '
  'and a limit per network. Operator-only; deleted by the tick like support_submission.';
