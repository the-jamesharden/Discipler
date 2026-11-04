-- ---------------------------------------------------------------------------
-- The church-plant application (Exponential launch, ticket 19)
-- ---------------------------------------------------------------------------

-- One row per church that said "Yes, we are" on "Set up your account", written in the
-- transaction that opens the church, so a church is never opened with its application
-- lost. It stays undecided until an operator approves or declines it, and a decision
-- once made is not changed, so this row is the history of it.
--
-- The answers are as they were typed, and the launch date and the attendance are free
-- text because the page asks for them that way. The caps are what one email carries of
-- each (`EMAIL_LINE_LONGEST` and `EMAIL_QUOTED_LONGEST` in `src/domain/email.ts`).
create table church_plant_application (
  id                 uuid primary key default gen_random_uuid(),
  ministry_id        uuid not null unique references ministry (id) on delete cascade,
  launch_date        text not null
    constraint church_plant_application_launch_date_fits check (char_length(launch_date) between 1 and 200),
  sending_church     text not null
    constraint church_plant_application_sending_church_fits check (char_length(sending_church) between 1 and 200),
  average_attendance text not null
    constraint church_plant_application_attendance_fits check (char_length(average_attendance) between 1 and 200),
  lead_pastor        text not null
    constraint church_plant_application_lead_pastor_fits check (char_length(lead_pastor) between 1 and 200),
  anything_else      text
    constraint church_plant_application_anything_else_fits check (char_length(anything_else) <= 5000),
  applied_at         timestamptz not null,
  decision           text
    constraint church_plant_application_decision_is_known check (decision in ('approved', 'declined')),
  decided_at         timestamptz,

  constraint church_plant_application_decision_says_when
    check ((decision is null) = (decided_at is null))
);

-- `list` asks for the ones still waiting, whichever church they belong to.
create index church_plant_application_waiting on church_plant_application (applied_at)
  where decision is null;

alter table church_plant_application enable row level security;
alter table church_plant_application force  row level security;

revoke all on church_plant_application from anon, authenticated, service_role, discipler_command;

-- Written once by provisioning, in the transaction that opens the church, on the
-- connection that writes the church's first rows. The operator's `list` reads across
-- churches on that same trusted connection, as the Setup Link does. A decision is made
-- as `discipler_command`, inside the church's billing lock, beside the claim on its card.
grant select on church_plant_application to discipler_command;
grant update (decision, decided_at) on church_plant_application to discipler_command;

create policy church_plant_application_command_read on church_plant_application
  for select to discipler_command
  using (ministry_id = app.command_ministry_id());
create policy church_plant_application_command_decide on church_plant_application
  for update to discipler_command
  using (ministry_id = app.command_ministry_id())
  with check (ministry_id = app.command_ministry_id());

comment on table church_plant_application is
  'A church''s answers to the church-plant questions at sign-up, and what the operator '
  'decided. Written by provisioning; decided as `discipler_command`; never reaches a browser.';
