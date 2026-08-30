-- Ticket 11 -- Nudge reveals contact details
--
-- `Nudge` sends nothing. It reveals the Participant's number so the Admin can reach
-- them directly, because Discipler's job is to say who needs a call, not to make it.
-- See `docs/adr/0010-nudge-reveals-a-number-and-sends-nothing.md`.
--
-- The reveal is a read a browser session performs, and that is the whole difficulty.
-- The sending layer already resolves contact-sharing consent, in
-- `OutboundQueue.contactToShare`, on the trusted connection the queue is drained on.
-- An Admin looking at a Follow-Up Item is not that connection and cannot borrow it:
-- `app.current_consent` is deliberately not granted to `authenticated`, so a signed-in
-- session has no way to ask the question the rule is made of.
--
-- What it *can* do today is read `person.phone` directly -- `authenticated` holds
-- `select on person` -- which answers without consulting consent at all. This function
-- is the path that does consult it. Revoking the column grant is not done here: the
-- Leader Dashboard (ticket 15) shows the phone number of everyone in a relationship,
-- so which surfaces may read the column unmediated is that ticket's question and not
-- this one's. Recorded rather than assumed.

-- ---------------------------------------------------------------------------
-- The reveal
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER for exactly the reason `app.current_consent` is one: the rule reads
-- tables the caller may not read, and the surface that legitimately asks is the one
-- that performs a visibility check first. `app.is_member_of` is that check, and it
-- reads `auth.uid()` -- a session fact, not a role fact, so it still answers for the
-- caller inside a definer function rather than for the owner.
--
-- Ministry membership, not relationship leadership. An Admin is ministry-wide and the
-- Care Needed view is an Admin surface; a narrower check would be inventing a rule
-- this ticket does not state.
create function public.contact_to_share(target_person_id uuid)
returns table (full_name text, phone text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.full_name, p.phone
    from public.person p
   where p.id = target_person_id
     and app.is_member_of(p.ministry_id)
     -- A number that is not there is not a number withheld, but the caller cannot
     -- tell the difference and does not need to: both mean "you cannot call them".
     and p.phone is not null
     -- The *current* decision, not whether one was ever given. A Person who granted
     -- contact sharing and later withdrew it has two records, and the older one must
     -- not answer for them. `is true` because NULL -- never asked -- is also "do not".
     and app.current_consent(p.id, 'contact_sharing') is true
$$;

comment on function public.contact_to_share(uuid) is
  'The contact details an Admin in this Person''s Ministry may see, or no row where '
  'the Person has not currently agreed to share them. The only consent-respecting '
  'path to a number from a browser session.';

revoke execute on function public.contact_to_share(uuid) from public;
grant execute on function public.contact_to_share(uuid) to authenticated;
