-- ---------------------------------------------------------------------------
-- "Set up your account" (Exponential launch, ticket 17)
-- ---------------------------------------------------------------------------

-- When the person pressed "Email me a code" for this phone, which is the time of the
-- consent the church's opening records. `code_sent_at` cannot say so, because every
-- send replaces it. A resend keeps this, and another phone on the attempt moves it,
-- since the consent is for that number. There is exactly one when there is a phone.
--
-- An attempt that already named a phone has no such time to carry, and guessing one
-- for a consent record is the wrong way round, so those attempts are ended and the
-- person passes the check again. They live for an hour at most, and sign-up has never
-- been open on production.
delete from pending_signup where phone is not null;

alter table pending_signup
  add column agreed_at timestamptz,
  add constraint pending_signup_a_phone_was_agreed_to check ((phone is null) = (agreed_at is null));

comment on column pending_signup.agreed_at is
  'When "Email me a code" was pressed for the phone on this attempt: the time of the '
  'Admin''s consent, written to `consent_record` when the church opens.';

-- ---------------------------------------------------------------------------
-- What a self-signed-up church chose
-- ---------------------------------------------------------------------------

-- One row per self-signed-up church, and none for a church opened any other way. A
-- church may leave at the payment step and come back another day, by the reminder or
-- by signing in, so what it chose cannot live only in the address. Nothing about the
-- password is here, nor anywhere in sign-up's tables.
create table church_signup (
  ministry_id      uuid primary key references ministry (id) on delete cascade,
  billing_cycle    text not null
    constraint church_signup_cycle_is_known check (billing_cycle in ('month', 'year')),
  -- As the address carried it, whether or not it applied. The payment step checks it
  -- again when it is used, because the offer may have ended by then.
  carried_code     text
    constraint church_signup_code_is_short check (char_length(carried_code) <= 64),
  -- `HEARD_ABOUT_US` in `src/domain/sign-up-account.ts`, which holds the words.
  heard_from       text
    constraint church_signup_heard_from_is_known check (
      heard_from in ('instagram', 'online_google', 'a_friend', 'another_ministry', 'conferences', 'other_media')
    ),
  reminder_sent_at timestamptz,
  reminders_off_at timestamptz
);

alter table church_signup enable row level security;
alter table church_signup force  row level security;

revoke all on church_signup from anon, authenticated, service_role, discipler_command;

-- Written once by provisioning, in the transaction that opens the church, on the
-- connection that writes the church's first rows. After that it is a church's own row,
-- read and updated as `discipler_command`.
grant select on church_signup to discipler_command;
grant update (reminder_sent_at, reminders_off_at) on church_signup to discipler_command;

create policy church_signup_command_read on church_signup
  for select to discipler_command
  using (ministry_id = app.command_ministry_id());
create policy church_signup_command_remind on church_signup
  for update to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

comment on table church_signup is
  'What a self-signed-up church chose on "Set up your account", for the payment step and '
  'its reminder to read. Written by provisioning; read and updated as `discipler_command`.';
