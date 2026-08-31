# 17 — Inbound keyword commands: PAUSE, RESUME, SWAP

**What to build:** A Leader can pause their check-ins for a season, come back early, or ask to be matched with someone else — each by texting one word, with no Admin approval and no difficult conversation. A relationship that is not working reaches the Admin without the Leader having to raise it face to face.

The keyword set is `STOP`, `HELP`, `PAUSE`, `RESUME`, and `SWAP`. Keywords are read before a reply is interpreted as a check-in answer. `START` is carrier-level re-opt-in only and carries no relationship meaning.

**Target resolution is by eligibility for the requested action.** Exactly one eligible relationship applies directly; more than one opens a numbered menu; none draws a plain reply saying so. `PAUSE` considers active unpaused relationships, `RESUME` considers paused ones only, `SWAP` considers all live relationships including `Paused` and including `Awaiting Leader Acceptance` — where it reads as a decline, giving a Leader matched with someone they know is wrong a way to say so other than silence. **The target is never inferred from Check-In Sequence position.**

`PAUSE` always opens a Keyword Exchange carrying the target and the duration in one confirmation — *"Pause check-ins with Emily for 2 weeks? Reply YES to confirm, or reply 1, 4, 8, or 12 for a different number of weeks."* Both written and numeric forms are accepted. The confirmation is the accidental-tap protection.

At most one Keyword Exchange is open per Person; a second keyword replaces the first. **The most recent prompt owns the next reply**, so an exchange opened mid-sequence takes it while the check-in question stays unanswered with its reminder clock running. An unanswered exchange expires after twenty-four hours **with no reminder** — re-prompting someone about a request they abandoned is nagging — and expiry raises and changes nothing. Clarifications follow the same cap as a check-in: two, then stop re-prompting and keep listening until expiry.

A keyword resolving to the relationship whose check-in question is currently open **withdraws that pending question**, so a pause never accrues silence against itself. A bare exact keyword during the Concern detail step is still a keyword; the concern and badge are already recorded and the detail request ages out normally.

`RESUME` resumes immediately and releases the Starter Message, and a relationship resumed early never reaches expiry, so no expiry follow-up item is raised for it. `SWAP` records a request and raises a follow-up item showing the Leader, the relationship, and that a different Participant is being asked for — it changes no state, moves nobody, ends nothing, coexists with `Paused`, and never clears itself.

**No inbound message falls through to silence.** A recognized keyword from a Participant is acknowledged and raises an Admin follow-up item — a Participant texting `PAUSE` is most often someone who wants out and has no other route. Unrecognized free text from a Participant draws one rate-limited acknowledgement pointing them to their Ministry and raises nothing; an item for every "thanks!" would bury the Care Needed view.

Participants are told nothing when their Leader pauses. This is deliberate silence: the Participant's relationship has not changed, they have never received a check-in, and the Admin is already in the loop.

**Blocked by:** 12

**Status:** done

- [x] One eligible relationship applies the keyword directly with no menu
- [x] Several eligible relationships open a numbered menu and apply only after selection
- [x] No eligible relationship draws a plain reply and changes nothing
- [x] Eligibility is per command, proven by a Leader with one paused and two active relationships resolving `RESUME` without a menu
- [x] The target is never resolved from Check-In Sequence position
- [x] `PAUSE` confirms target and duration in one exchange, accepting written and numeric forms
- [x] A keyword mid-sequence takes the next reply; the check-in question stays unanswered and its reminder still fires
- [x] At most one Keyword Exchange is open per Person; a second keyword replaces the first
- [x] An unanswered exchange expires at twenty-four hours with no reminder and raises nothing
- [x] After two clarifications a valid reply is still honored until expiry
- [x] A keyword withdraws the pending check-in question on the relationship it resolves to, which never ages into Stalled — *ticket 12 settled this as general rather than the Keyword Exchange's and built it for `relationship.pause`; a keyword route inherits it rather than rebuilding it*
- [x] A bare keyword during the Concern detail step is treated as a keyword, leaving the concern and badge intact
- [x] `RESUME` resumes immediately, releases the Resume Message, and raises no expiry item
- [x] `SWAP` raises a follow-up item showing Leader, relationship, and the request, changing no state and coexisting with `Paused`
- [x] `SWAP` is accepted on an unaccepted relationship and reads as a decline
- [x] `START` from an opted-out Person restores messaging and resumes no relationship
- [x] A recognized keyword from a Participant raises a follow-up item; unrecognized free text does not and is acknowledged at most once per window
- [x] No message is sent to Participants when their Leader pauses

## Comments

### Settled 2026-08-31 — both open questions, answered while building

**A Participant reaches `SWAP` through the same keyword on the same inbound route.**
One word, either side, one command. A Participant is sent no Invitation Link and does
not decline a match, so `SWAP` is the only way they can say the pairing is wrong
without going silent — and silence is the ambiguity the care rules already struggle
to read. Eligibility for `SWAP` was already *all live relationships*, so a
Participant's holds needed no new rule, only a snapshot that reads both sides of a
membership rather than the leader side alone.

**The `swap_requested` item says which side asked**, in `payload.requestedBy`, with a
check constraint repeating it. The Admin's next move differs: unpair and re-pair the
Participant, or release the Leader from the relationship. It is the role held *in the
relationship named* rather than a property of the Person — a dual-role Person asking
to swap out of the relationship they are discipled in is a Participant here whatever
else they lead.

`PAUSE` and `RESUME` stay a Leader's. A Participant receives no check-ins, so there is
nothing of theirs to suspend; theirs reach an Admin as `participant_keyword`, which is
where somebody who wants out and has no other route is heard.

### Settled 2026-08-31 — four things the ticket did not state

- **`HELP` replies and changes nothing.** The ticket names it in the keyword set and
  gives it no behaviour. It answers with the keyword list and a pointer to the
  Ministry, carrying the `Discipler:` A2P prefix that `docs/product-rules.md` requires
  on the `HELP` response. It replaces no exchange and withdraws no question — asking
  what the words are abandons nothing.
- **The acknowledgement window is twenty-four hours.** The ticket says *rate-limited*
  and no more. Twenty-four hours matches the reminder and the exchange rather than
  introducing a third duration.
- **The acknowledgement answers a Leader too, not only a Participant.** The bullets
  name a Participant; the rule they sit under is *no inbound message falls through to
  silence*, and a Leader with no open question texting their Ministry's number is as
  unheard as anybody else. Widened deliberately, and cheap to narrow again — it is one
  condition in one place. Flagged rather than assumed.
- **A Person with a standing opt-out is answered by nothing but `START`.** Found while
  building: the outbound queue refuses a message to somebody who has opted out, so an
  acknowledgement composed for them rolls the whole transaction back — their text
  fails outright rather than reaching nobody quietly. Every route below `START` needs
  an answer Discipler is not allowed to send.

### Fixed 2026-08-31 — three defects the review caught

All three were in this ticket's own code, all three are covered by tests that fail
without the fix:

- **A menu renumbered itself when one of its relationships ended.** The re-read of an
  exchange's printed options inner-joined open memberships, and ending a relationship
  closes every membership in it — so the entry vanished and every line below it moved
  up. A Leader shown `1. Emily 2. Sarah 3. David` whose Emily relationship an Admin
  then ended would reply `2` meaning Sarah and swap David. The join no longer filters
  on the membership being open, and takes the open one where there is one.
- **A reply from somebody with no SMS consent aborted the whole command.** The guard
  tested the opt-out only, but the outbound queue's floor is both halves — and
  `app.sender_of_inbound` resolves any Person by number, so somebody imported onto
  the Roster who never completed Intake can reach the webhook. Every reply composed
  for them was refused, which rolled the transaction back and would have had the
  delivery vendor retry the identical failure. `InboundSnapshot.mayBeTexted` now
  carries both halves.
- **A resume died when anyone in the relationship had opted out.** Opting out ends no
  relationship, so a Participant who texted `STOP` is still an open member; the
  Resume Message composed for them was refused and took the Leader's resume with it.
  Members carry `reachable`, and the message is sent to the ones Discipler may reach
  while still naming everybody. *The Admin's `relationship.resume` route has the same
  defect and is not fixed here* — it needs the same field on a snapshot five commands
  share, and that is ticket 12's to close.

### Amended 2026-08-30 — a Participant may swap

Settled while reviewing ticket 12. A Participant is sent no Invitation Link and does
not decline a match (see ticket 06's amendment); what they may ask for instead is a
**swap**. This ticket currently frames `SWAP` as a Leader's keyword throughout, and
`swap_requested` is raised by nobody today.

Two things to settle when this is picked up: whether a Participant reaches `SWAP`
through the same keyword on the same inbound route — they receive no check-ins, so
nothing in the Check-In Rhythm is holding a conversation with them — and whether the
`swap_requested` item needs to say which side asked, since the Admin's next move
differs: unpair and re-pair the Participant, or release the Leader from the
relationship. Neither is inferred here.

### Amended 2026-08-30 — two rules this ticket inherits rather than builds

Ticket 12 settled both, so they are recorded here to stop this ticket re-deciding
them:

- **A resume sends the Resume Message**, not the Starter Message. The checkbox
  above is corrected; `docs/product-rules.md` and `CONTEXT.md` carry the rule.
- **A Pause takes back the question that was out**, and that is general rather
  than the Keyword Exchange's. It is built in the domain for every route into a
  Pause, so a `PAUSE` keyword gets it by going through `relationship.pause`.

And one this ticket still owns: **a Leader cannot pause anything today.** *A
leader may pause a relationship they lead* is settled in `docs/product-rules.md`
and only the Admin route exists.
