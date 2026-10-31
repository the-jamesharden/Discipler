-- ---------------------------------------------------------------------------
-- The shared numbers (Exponential launch, ticket 06)
-- ---------------------------------------------------------------------------
--
-- Each church no longer gets its own number. Discipler keeps one shared set of
-- Discipler-owned numbers, and every church sends from it:
--
-- * a (phone, church) pair is given one shared number the first time that church
--   texts that phone, and keeps it;
-- * a phone held in two churches is given a different number for each, so its
--   replies never mix and a `STOP` to one church's number leaves the other's
--   texts running;
-- * a reply is placed by the sender's phone as before, and where that phone is in
--   more than one church, by the number it was sent to.
--
-- It replaces `ministry.sending_number` (`20260909000100`), one number per church,
-- which an operator had to provision before a church could send. A church now
-- texts the moment it exists, with no operator step.
--
-- The data step keeps every (phone, church) Discipler knows today on the number it
-- hears from today: the three numbers in use join the shared set, and each church's
-- people are given its number. It is checked before the old column is dropped.

-- ---------------------------------------------------------------------------
-- The set: Discipler's, not any church's
-- ---------------------------------------------------------------------------

-- Operator-only, in the `ministry_setup` shape: it belongs to no church, and it is
-- added to by whoever runs Discipler when volume needs another number
-- (`scripts/shared-number.ts`). Nothing in a session reads it.
create table shared_number (
  phone     text primary key
    constraint shared_number_is_e164 check (phone ~ '^\+[1-9][0-9]{1,14}$'),
  added_at  timestamptz not null default now()
);

alter table shared_number enable row level security;
alter table shared_number force  row level security;

revoke all on shared_number from anon, authenticated, service_role, discipler_command;

comment on table shared_number is
  'The Discipler-owned numbers every church sends from, in E.164. Operator-only: '
  'added by `scripts/shared-number.ts` once the number is in the Messaging Service, '
  'and read only through `app.sending_number_for` and the capacity watch.';

-- ---------------------------------------------------------------------------
-- Who hears from which number
-- ---------------------------------------------------------------------------

-- One row per (church, phone), written the first time that church texts that
-- phone and never changed: a person always hears from the same number. A fact, so
-- nothing updates or deletes it; a church deleted takes its rows with it.
create table sending_number_assignment (
  ministry_id     uuid not null references ministry (id) on delete cascade,
  -- The phone texted, in E.164, as `outbound_message.to_phone` holds it. A phone
  -- and not a Person: a number is one conversation, whoever on it was asked
  -- (ADR-0005), and an Admin texted from no Person row hears from it too.
  phone           text not null
    constraint sending_number_assignment_phone_is_e164
      check (phone ~ '^\+[1-9][0-9]{1,14}$'),
  sending_number  text not null references shared_number (phone),
  -- When that church first texted that phone, on the sending layer's clock.
  assigned_at     timestamptz not null,

  primary key (ministry_id, phone),
  -- A phone in two churches hears from two numbers. Held here and not only by the
  -- function that picks one, so no later writer can give two churches the same
  -- number for one phone -- which would put their replies in one thread and let a
  -- `STOP` to one church silence the other.
  constraint sending_number_assignment_one_church_per_number_per_phone
    unique (phone, sending_number)
);

-- How many pairs each number carries, which is what the least-loaded pick and the
-- capacity watch both count.
create index sending_number_assignment_by_number
  on sending_number_assignment (sending_number);

alter table sending_number_assignment enable row level security;
alter table sending_number_assignment force  row level security;

-- No browser grant: it holds every phone a church has texted, and no browser grant
-- reaches `person.phone` either (ADR-0021). The sending layer reads its own
-- church's rows; every write goes through `app.sending_number_for`.
revoke all on sending_number_assignment from anon, authenticated, service_role, discipler_command;

grant select on sending_number_assignment to discipler_command;
create policy sending_number_assignment_command_read on sending_number_assignment
  for select to discipler_command
  using (ministry_id = app.command_ministry_id());

comment on table sending_number_assignment is
  'Which shared number each phone hears from for each church, given the first time '
  'that church texts it and kept. Unique per (phone, number), so a phone in two '
  'churches hears from two numbers.';

-- ---------------------------------------------------------------------------
-- When support@ was told the set was near capacity
-- ---------------------------------------------------------------------------

-- Operator-only history for the capacity watch (`src/service/shared-number-capacity.ts`):
-- one row per concern per size of the set, so support@ is told once, and told
-- again only after a number has been added and the bigger set fills up too.
create table shared_number_capacity_alert (
  id                          uuid primary key default gen_random_uuid(),
  concern                     text not null
    constraint shared_number_capacity_alert_concern
      check (concern in ('recipients', 'one_phone')),
  raised_at                   timestamptz not null,
  -- The load it was raised on, as the watch read it.
  numbers                     integer not null check (numbers >= 0),
  recipients                  integer not null check (recipients >= 0),
  most_churches_on_one_phone  integer not null check (most_churches_on_one_phone >= 0),

  constraint shared_number_capacity_alert_once_per_size unique (concern, numbers)
);

alter table shared_number_capacity_alert enable row level security;
alter table shared_number_capacity_alert force  row level security;

revoke all on shared_number_capacity_alert from anon, authenticated, service_role, discipler_command;

-- ---------------------------------------------------------------------------
-- The data step: every (phone, church) stays on the number it hears from today
-- ---------------------------------------------------------------------------

-- Each church's own number joins the shared set. On production these are the
-- three in use: +13185316138 (Example Ministry), +15674303906 (SAU BCM) and
-- +14129606955 (Anthem). Dated from the first church that sent from it.
insert into shared_number (phone, added_at)
select m.sending_number, min(m.created_at)
  from ministry m
 where m.sending_number is not null
 group by m.sending_number
on conflict (phone) do nothing;

-- Every phone a church knows -- each Person's, and every number it has queued a
-- text to, which is where an Admin texted from no Person row appears -- is given
-- the number that church sends from today. Removed people are included: should
-- they be restored, they hear from the number they always did.
--
-- Oldest church first, so where two churches ever shared one number (none on
-- production), the older keeps it for a shared phone and the younger's pair is
-- left to be given a number of its own on its next text.
insert into sending_number_assignment (ministry_id, phone, sending_number, assigned_at)
select known.ministry_id, known.phone, m.sending_number, known.first_known_at
  from (
    select ministry_id, phone, min(at) as first_known_at
      from (
        select p.ministry_id, p.phone, p.created_at as at
          from person p
         where p.phone is not null
        union all
        select o.ministry_id, o.to_phone, o.enqueued_at
          from outbound_message o
         where o.to_phone is not null
      ) every_phone
     where phone ~ '^\+[1-9][0-9]{1,14}$'
     group by ministry_id, phone
  ) known
  join ministry m on m.id = known.ministry_id
 where m.sending_number is not null
 order by m.created_at, known.ministry_id, known.phone
on conflict do nothing;

-- Checked, not assumed, before the column it came from is dropped: every phone a
-- church with its own number knows now hears from that number, unless another
-- church already held that number for the same phone. Anything else stops the
-- migration with nothing applied.
do $$
declare
  missing integer;
begin
  select count(*) into missing
    from ministry m
    join (
      select ministry_id, phone from person where phone is not null
      union
      select ministry_id, to_phone from outbound_message where to_phone is not null
    ) known on known.ministry_id = m.id
   where m.sending_number is not null
     and known.phone ~ '^\+[1-9][0-9]{1,14}$'
     and not exists (
       select 1 from sending_number_assignment a
        where a.ministry_id = m.id and a.phone = known.phone
          and a.sending_number = m.sending_number
     )
     and not exists (
       select 1 from sending_number_assignment a
        where a.phone = known.phone and a.sending_number = m.sending_number
          and a.ministry_id <> m.id
     );

  if missing > 0 then
    raise exception 'the shared numbers: % (phone, church) pairs would move off the number they hear from today', missing;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- The number a church sends to a phone from
-- ---------------------------------------------------------------------------

-- The number the church this connection acts for texts `recipient` from: the one it
-- was given, or, the first time, the least-loaded shared number this phone does not
-- already hear from for another church. Null when there is none left for this
-- phone, which the sending layer leaves on the queue until a number is added.
-- `at` is the drain's clock, the moment the pair is first texted.
--
-- Security definer because the pick has to see every church's pairs, and nothing
-- acting for one church may read another's. It returns one number and nothing
-- about who else holds it.
create function app.sending_number_for(recipient text, at timestamptz)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  acting_for uuid := app.command_ministry_id();
  chosen text;
begin
  if acting_for is null then
    raise exception 'app.sending_number_for needs the church it acts for';
  end if;

  select a.sending_number into chosen
    from public.sending_number_assignment a
   where a.ministry_id = acting_for and a.phone = recipient;
  if found then
    return chosen;
  end if;

  -- One pick per phone at a time, across churches: two churches texting one person
  -- for the first time in the same moment must not both choose the number neither
  -- has used yet. The unique constraint would refuse the second; this makes it
  -- wait and choose another instead. Held to the end of the transaction.
  perform pg_advisory_xact_lock(hashtext('sending_number_for'), hashtext(recipient));

  -- Again under the lock, for a drain of this church that got here first.
  select a.sending_number into chosen
    from public.sending_number_assignment a
   where a.ministry_id = acting_for and a.phone = recipient;
  if found then
    return chosen;
  end if;

  -- The least-loaded, so the set fills evenly and one number is not carrying every
  -- church; the oldest first among equals, so the pick is the same every time.
  select s.phone into chosen
    from public.shared_number s
    left join public.sending_number_assignment load on load.sending_number = s.phone
   where not exists (
           select 1 from public.sending_number_assignment mine
            where mine.phone = recipient and mine.sending_number = s.phone
         )
   group by s.phone, s.added_at
   order by count(load.phone), s.added_at, s.phone
   limit 1;

  if chosen is null then
    return null;
  end if;

  insert into public.sending_number_assignment (ministry_id, phone, sending_number, assigned_at)
  values (acting_for, recipient, chosen, at);

  return chosen;
end;
$$;

revoke execute on function app.sending_number_for(text, timestamptz) from public, anon, authenticated, service_role;
grant execute on function app.sending_number_for(text, timestamptz) to discipler_command;

-- ---------------------------------------------------------------------------
-- A reply is placed by the number it was sent to, where the phone is in two churches
-- ---------------------------------------------------------------------------

-- As `20261012000100` left it within one church: a Person when exactly one Person
-- on the Roster holds the number, or, where nobody on the Roster holds it, exactly
-- one removed Person does. What changes is across churches. Before, a phone held in
-- two churches resolved to nobody; now the number it texted names the church, and
-- the rule above is applied inside that church. A phone in one church resolves as
-- it always did, whatever number it texted.
--
-- `texted_number` is Twilio's `To`. Null where a caller has none, which places a
-- phone in one church and nobody else.
drop function app.sender_of_inbound(text);

create function app.sender_of_inbound(candidate_phone text, texted_number text)
returns table (ministry_id uuid, person_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with held as (
    select p.ministry_id,
           p.id,
           exists (select 1
                     from public.person_removal r
                    where r.person_id = p.id
                      and r.restored_at is null) as removed
      from public.person p
     where p.phone = candidate_phone
  ),
  churches as (select count(distinct h.ministry_id) as n from held h),
  addressed as (
    select h.*
      from held h, churches c
     where c.n = 1
        or exists (select 1
                     from public.sending_number_assignment a
                    where a.ministry_id = h.ministry_id
                      and a.phone = candidate_phone
                      and a.sending_number = texted_number)
  ),
  on_the_roster as (select count(*) as n from addressed where not removed)
  select h.ministry_id, h.id
    from addressed h, on_the_roster o
   where case
           when o.n > 0 then not h.removed and o.n = 1
           else (select count(*) from addressed) = 1
         end;
$$;

revoke execute on function app.sender_of_inbound(text, text) from public, anon, authenticated, service_role;
grant execute on function app.sender_of_inbound(text, text) to discipler_command;

-- ---------------------------------------------------------------------------
-- The number per church goes
-- ---------------------------------------------------------------------------

-- Carried into the shared set and the pairs above, and read by nothing any more.
alter table ministry drop column sending_number;

-- A Setup Link no longer names a number, since the church it opens sends from the
-- shared set. The links already issued keep the number they named, as the history
-- of how those churches were opened.
alter table ministry_setup alter column sending_number drop not null;

comment on column ministry_setup.sending_number is
  'The number a link issued before the shared numbers named for its church. Null on '
  'every link since: a church opened today sends from the shared set (`shared_number`).';
