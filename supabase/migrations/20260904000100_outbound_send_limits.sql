-- Ticket 11a -- Outbound send limits
--
-- An Admin who clicks Nudge twenty times causes at most one message. **The limit is
-- enforced at the sending layer, not at the button.** A disabled button is a
-- courtesy; the limit is the rule, and any future feature that sends a message
-- inherits it without exception.
--
-- The reason is not tidiness. Discipler's entire participant-facing surface is SMS:
-- a Ministry that over-messages its own congregation gets its number
-- carrier-flagged, and every relationship in that Ministry goes dark at once.
--
-- The limits themselves are not here. They are pilot starting values to be tuned
-- from pilot data, they are the same for every Ministry until something decides
-- otherwise, and putting them in a column would be answering a question ticket 22
-- has not asked. They live as one named configuration in `src/domain/nudge-limits.ts`.

-- ---------------------------------------------------------------------------
-- What the ceiling governs
-- ---------------------------------------------------------------------------

-- Two values because the rule needs exactly two. The caps govern nudges
-- specifically; the Check-In Rhythm is self-limiting by construction and needs no
-- separate ceiling, and a Welcome Message answers a form the Person just filled in.
--
-- A later ticket that has to tell a Welcome Message from a reminder widens this
-- enum. Nothing here needs to, and a taxonomy invented ahead of a rule that reads it
-- is a taxonomy nothing keeps honest.
create type outbound_message_kind as enum ('nudge', 'other');

-- Defaulted, so every path that enqueues today keeps enqueuing exactly what it did.
-- Only a caller that means to send a nudge says so.
alter table outbound_message
  add column kind outbound_message_kind not null default 'other';

comment on column outbound_message.kind is
  'Whether the nudge ceiling governs this message. Only nudges are metered: the '
  'Check-In Rhythm is self-limiting by construction and needs no separate ceiling.';

-- The caps are counted **per recipient Person** -- a ministry-conduct rule about
-- what a congregant actually receives -- while ticket 20's hold is counted per
-- phone number, because a phone holds one conversation at a time however many
-- people are reachable on it. The two limiters sit on the same queue and must not
-- be confused.
--
-- A nudge naming no Person could be counted against neither, so it is refused here
-- rather than discovered later: an unmetered nudge path is the one thing this
-- ticket exists to prevent. Safe against `person_id`'s `on delete set null`
-- because nothing in Discipler deletes a Person -- history is why they stay.
alter table outbound_message
  add constraint outbound_message_nudge_names_a_person
    check (kind <> 'nudge' or person_id is not null);

-- ---------------------------------------------------------------------------
-- What the sending layer reads before every nudge
-- ---------------------------------------------------------------------------

-- Sent-only and partial, because that is the only question ever asked of it: which
-- nudges actually reached this Person. A withheld message never arrived and a
-- message ticket 20 is holding behind an open conversation has not arrived yet, so
-- neither one spent any of the budget -- which is what *a held message consumes no
-- nudge budget* comes to in an index.
create index outbound_message_nudge_sent_idx
  on outbound_message (ministry_id, person_id, sent_at desc)
  where kind = 'nudge' and sent_at is not null;
