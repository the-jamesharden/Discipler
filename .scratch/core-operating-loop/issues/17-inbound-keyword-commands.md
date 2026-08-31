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

**Status:** ready-for-agent

- [ ] One eligible relationship applies the keyword directly with no menu
- [ ] Several eligible relationships open a numbered menu and apply only after selection
- [ ] No eligible relationship draws a plain reply and changes nothing
- [ ] Eligibility is per command, proven by a Leader with one paused and two active relationships resolving `RESUME` without a menu
- [ ] The target is never resolved from Check-In Sequence position
- [ ] `PAUSE` confirms target and duration in one exchange, accepting written and numeric forms
- [ ] A keyword mid-sequence takes the next reply; the check-in question stays unanswered and its reminder still fires
- [ ] At most one Keyword Exchange is open per Person; a second keyword replaces the first
- [ ] An unanswered exchange expires at twenty-four hours with no reminder and raises nothing
- [ ] After two clarifications a valid reply is still honored until expiry
- [ ] A keyword withdraws the pending check-in question on the relationship it resolves to, which never ages into Stalled — *ticket 12 settled this as general rather than the Keyword Exchange's and built it for `relationship.pause`; a keyword route inherits it rather than rebuilding it*
- [ ] A bare keyword during the Concern detail step is treated as a keyword, leaving the concern and badge intact
- [ ] `RESUME` resumes immediately, releases the Resume Message, and raises no expiry item
- [ ] `SWAP` raises a follow-up item showing Leader, relationship, and the request, changing no state and coexisting with `Paused`
- [ ] `SWAP` is accepted on an unaccepted relationship and reads as a decline
- [ ] `START` from an opted-out Person restores messaging and resumes no relationship
- [ ] A recognized keyword from a Participant raises a follow-up item; unrecognized free text does not and is acknowledged at most once per window
- [ ] No message is sent to Participants when their Leader pauses

## Comments

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
