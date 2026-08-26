# Discipler — Settled and Working Product Decisions

This file distinguishes settled product rules from working decisions that still need to be pressure-tested.

`/grill-with-docs` should not silently rewrite settled decisions. If a conflict appears, surface it explicitly.

## Settled: Relationship Types

Discipler supports:

- one-to-one discipleship relationships
- group discipleship relationships

A group leader fills the same operational leadership role that a mentor fills in a one-to-one relationship where the workflow is otherwise the same.

The product should share underlying business logic across the two relationship types and change wording or participant structure only when necessary.

## Settled: Pastor Control

The pastor can view the full roster.

The pastor can manually create one-to-one relationships.

The pastor can manually create groups by selecting multiple participants for a leader.

Suggested pairings do not remove the pastor's ability to pair people manually.

## Settled: Suggested Pairing

Suggested one-to-one pairings are based on a simple mathematical comparison of overlapping availability slots among currently eligible, unpaired mentors and mentees.

The system should not make the algorithm more complex unless a future approved requirement requires it.

Suggested pairings are derived recommendations, not permanent assignments.

When manual or other pairing activity changes the available roster, incompatible suggestions must disappear and the remaining suggestions must be recalculated.

## Settled: Materials

Pastors must be able to assign discipleship materials to specific people.

Pastors must be able to see which people are assigned which materials.

The system must preserve material assignment history over time.

Material assignment data must be usable later to evaluate long-term satisfaction and performance associated with materials.

## Settled: Twilio as Relationship-State Input

Relationship state is defined by the Twilio rhythm and the meeting responses.

The Twilio rhythm is not merely a notification layer; it is a primary source of operational ministry data.

## Settled: Two-Week Silence Care Rule

If two consecutive weekly check-ins are sent without any response, the affected relationship must be flagged on the pastor dashboard.

Additionally, each relationship card displays the number of weeks since its last submitted check-in. The card shows nothing in that position during any week the relationship has responded.

This rule is derived directly from the stored message/response history.

> **Supersedes:** an earlier settled rule requiring *three* unanswered response-required messages. That threshold meant a pastor heard nothing for twenty-one days, which is longer than the window in which a stalling relationship can still be recovered. The threshold is now two weeks. Do not reintroduce the three-message rule.

## Settled: Historical Data

Discipler must preserve week-by-week ministry history.

New events must not overwrite older unanswered messages, meeting outcomes, material assignments, or other historical facts.

A late reply should be applied to the most recent unanswered compatible question rather than falsely rewriting an older week.

## Settled: Care Needed View

The pastor dashboard must have a distinct view/tab that surfaces every current person, group, or relationship that needs pastoral attention according to approved rules.

## Settled: Ministry Intelligence

The same historical data used for relationship state and pastoral care should also power Ministry Intelligence.

Ministry Intelligence should include:

- trends
- material performance
- satisfaction
- response rate
- age response patterns
- gender response patterns
- quarterly ministry health

Demographic analysis should use approved intake/profile data joined with historical ministry response data.

## Settled: Concern Handling

Individual concerns should flow to the pastor through the normal care workflow.

Aggregated concern analysis should not be generated automatically.

If the pastor explicitly requests aggregation, Discipler may summarize recurring concerns and common areas of need.

## Settled: Integrations Do Not Replace Consent

Imported or synchronized data from another church-management system does not itself constitute participant consent.

## Resolved: Former Working Decisions

Three items were carried into the grilling session as working decisions to be pressure-tested. All three are now resolved and recorded above:

- **Secondary pair acceptance** — restored, not removed. See *Leader Acceptance Activates a Relationship*.
- **Launch modes** — removed entirely. See *No Launch Modes, No Kickoff in the Product*.
- **Event scope** — a kickoff is not modeled in the product at all.

## Settled: Tenant Isolation in Ministry Intelligence

Ministry Intelligence operates strictly inside one ministry's own data.

Discipler must not pool response, satisfaction, or material data across ministries, even in aggregate or anonymized form. Cross-ministry comparison would produce more statistically useful material insight, and it is rejected anyway: it breaks the data contract a ministry entered into, and tenant isolation outranks analytical value.

## Settled: Material Insight Is Descriptive, Not Inferential

Discipler does not perform significance testing and must not present material findings as statistically significant.

At the close of each calendar quarter, Discipler produces a report describing what the ministry's own history shows — response rates, satisfaction distributions, and the observed percentage difference between materials in use during that period. There is one reporting cadence, and it is quarterly; material comparison appears inside the quarterly report and simply says nothing useful until a material has enough weeks behind it. A visible difference between ten relationships reporting `outstanding` and ten reporting `okay` is a real and reportable difference; it is reported as an observation, never as a claim about cause or significance.

## Settled: Roster Membership Is Not Consent

Roster membership, intake completion, and pairing eligibility are three separate facts and must be modeled separately.

A person imported from Planning Center or uploaded by an admin appears on the roster with status `No Intake Submitted`. They cannot be paired, cannot receive a check-in, and are not assumed to want to participate. Only completing intake moves a person to `Ready to Pair`.

## Settled: Consent Is Recorded, Versioned, and Enforced at Send Time

Intake records SMS consent and contact-sharing consent independently, each with its own timestamp, alongside the version of the consent language the person actually saw.

Discipler includes another person's phone number in a message only where the recipient's consent record permits that sharing. Consent is checked when the message is sent, not assumed from enrollment.

## Settled: The Relationship Is the Core Primitive

There is no separate group concept. A discipleship relationship is one leader and N participants. A one-to-one relationship is N=1; a group is N>1. Two participants meeting with one leader is not a third kind of thing — it is a relationship with N=2.

This gives the product one state machine, one check-in cadence, and one dispatch path. Check-in copy branches on how many participants a relationship has, never on a group-versus-one-to-one distinction. Any design that reintroduces a separate group entity is a regression against this rule.

## Settled: Suggestion Constraints

Gender matching is an absolute constraint. It is a safeguarding policy, and manual pairing cannot override it. A ministry that wants mixed-gender relationships disables the rule deliberately in settings.

The age constraint governs suggestion only. A leader more than ten years younger than a participant is not suggested for them, but an admin may pair across that gap manually. Fixed at ten years for V1.

See `docs/adr/0001-pairing-suggestion-inputs.md`.

## Settled: Leaders May Hold Multiple Relationships

A leader may lead more than one discipleship relationship at a time. Nothing in the model may assume a person has exactly one active relationship.

## Settled: Leader Acceptance Activates a Relationship

An admin creating a relationship does not activate it. The relationship enters `Awaiting Leader Acceptance` and stays there until its leader accepts.

The leader receives an SMS invitation link, sees on the leader dashboard who they have been matched with, sets a password, and accepts. Acceptance activates the relationship, releases the Starter Message to everyone in it, and is the timestamped record that the leader agreed to take it on.

A relationship awaiting acceptance sends nothing to participants and accrues no silence against the leader. If it is still unaccepted after two days, Discipler reminds the leader; after five days, the admin dashboard surfaces it along with how long it has been waiting.

> **Supersedes:** an earlier working decision that removed secondary acceptance entirely on the grounds that intake already constitutes agreement to be paired. Acceptance is retained because it does three things that a silent activation does not: it brings the leader into the product for a first meaningful action, it gives password creation an immediate reason, and it produces a defensible record that this specific leader agreed to this specific relationship. The earlier objection — that an acceptance gate merely duplicates an already-active relationship — does not apply, because the relationship is not active until acceptance.

## Settled: Contact Details Are Never Sent Over SMS

Discipler does not put a person's phone number in a text message.

A leader learns who they are responsible for through the invitation link and sees contact details on the leader dashboard, alongside the availability overlay and assigned materials. This reads as more professional than an unsolicited phone number by text, and it draws the leader into the product they will be using.

## Settled: One Admin Tier, One Leader Tier

V1 has exactly two levels of access. Every admin sees all of their ministry's data; a ministry may have as many admins as it wants, and they are equivalent. Leaders see only their own relationships, through the leader dashboard.

`Coordinator`, `staff`, `pastor team`, and similar words all name the admin role. They are not separate roles and must not become separate permission tiers in V1.

## Settled: Password at Launch, One-Time Codes Later

Leaders authenticate with a password, created during acceptance and required before they can accept. Phone one-time codes are a post-launch addition.

The cost of this is understood and accepted: until one-time codes ship, a leader who loses both their session and their password requires a manual reset.

## Settled: Relationships End; History Does Not

`Ended` is a terminal relationship state carrying a recorded reason: completed, leader exited, participant exited, or closed by an admin.

Ending a relationship preserves its history untouched. Everyone in it returns to the roster as `Ready to Pair` unless they have opted out. Ended relationships leave the dashboard's active counts but remain in longitudinal reporting — a relationship that ran five months and finished well is an outcome, not a deletion.

## Settled: Concern Text Is Handled Differently From Every Other Record

Raw concern text is never presented as a browsable list, never exported, and never quoted in a report. Reports count concerns; they do not reproduce them.

An admin reaches concern text one person at a time, from the Follow-Up tab or that relationship's own history. Resolving a concern clears its text by default, so a ministry does not accumulate a permanent file of people's most difficult weeks through inaction alone.

## Settled: No Launch Modes, No Kickoff in the Product

Acceptance is the launch. There are no configurable launch modes.

A kickoff gathering is something a church does in a room. Discipler does not model it, schedule it, or track attendance for it. Any kickoff support a ministry receives is material provided outside the product.

> **Supersedes:** the earlier working decision offering direct notification, kickoff event, or both as configurable launch modes. Leader acceptance now activates relationships, which made the launch-mode concept describe something the model no longer does.

## Settled: V1 Scope

V1 is the operating loop and nothing else: intake, roster, suggestions, acceptance, the sequential check-in rhythm, and care surfacing.

Three capabilities are deliberately deferred. The **Planning Center API** — V1 ships CSV upload, which delivers most of the value without OAuth, People sync, and reconciliation. The **quarterly report** — it produces nothing meaningful until a ministry has multiple quarters behind it, so a pilot cannot exercise it. The **material assignment interface** — assignments are configured during pilot support instead.

Deferring the report defers the *interface*, never the data. The week-by-week history that a report will one day read must be complete and correct from the first week of the pilot, because it cannot be reconstructed later.

## Settled: No Interface Action Bypasses Messaging Limits

Every outbound message passes a recipient-level check before it sends. Cooldowns and per-recipient rate limits are enforced at the sending layer, not at the button.

An admin who clicks `Nudge` twenty times causes at most one message. This is not a UI concern to be solved with a disabled button — a disabled button is a courtesy, and the limit is the rule. Any future feature that sends a message inherits this without exception.

The reason is that Discipler's entire participant-facing surface is SMS. A ministry that over-messages its own congregation gets its number carrier-flagged, and every relationship in that ministry goes dark at once.

## Settled: Clarification Attempts Are Capped, Listening Is Not

Discipler sends at most two clarifying re-prompts per check-in question. After that it stops re-prompting but continues to accept a valid reply until the sequence advances past that question.

The person is never locked out of answering; only Discipler's side of the conversation is capped.

## Settled: Native Intake

The intake form is a native Discipler form, not a third-party form. The availability grid, versioned consent capture, and tokenized prefill are all impossible in a generic form product, and all three are load-bearing.

## Settled: Suggestion Tie-Breaking

Candidates with identical availability overlap and the same Discipleship Goal are ordered by who has waited longest since completing intake.

The ordering must be stable — a list that reshuffles between page loads teaches an admin not to trust it — and longest-waiting is the tie-break that quietly serves the person who has been overlooked.

## Settled: Audited Actions

Four actions carry a durable record of who performed them and when:

1. concern text viewed
2. concern resolved or cleared
3. relationship ended
4. participant data exported

Not every interaction is audited. These four are the ones a ministry would need to answer for if someone ever asked, and they exist to protect the ministry as much as the participant.

## Settled: Material Assignment

A relationship works through one material at a time. Concurrent materials would make "satisfaction while using this material" unattributable, which is the only reason the assignment history is kept.

Material is assigned to the **relationship**, never to a person. A leader in two relationships may be working through two different things.

An assignment has a start date and an open end. Assigning a new material closes the previous one; materials may be swapped or removed at any time. Periods never overlap and never leave gaps.

When a material changes mid-week, the week belongs to whichever material was assigned **at the moment the check-in was answered**, because that is the meeting being reported on. A week is never split across two materials.

## Settled: Nudge Limits

Three limits govern admin-initiated nudges, enforced per recipient at the sending layer:

1. a cooldown between nudges to the same person
2. a daily cap
3. a weekly ceiling as an absolute backstop

Starting values for the pilot: one nudge per recipient per 12 hours, at most 2 per day, at most 4 per week. Tune from pilot data.

These govern nudges specifically, not all messaging. The check-in rhythm is self-limiting by construction — one sequence per week, advancing only on reply, one reminder per question, and at most two clarifications — so it needs no separate ceiling.

## Settled: Required Intake Fields

Required: name, phone number, availability, gender, Discipleship Goal, SMS consent, contact-sharing consent.

Optional: email address.

Gender and Discipleship Goal are required because both feed suggestion — gender is an absolute constraint, so a missing value would make a person unsuggestable entirely.

There is one intake form. Gender is a required field on that same form, selected by the person while they complete it, and it feeds the pairing eligibility and suggestion rules from there. There is no separate gender intake form and no separate gender intake workflow.

Age is collected as an **age range**, not an exact age or date of birth.

## Settled: On-Demand Concern Aggregation Is Not in V1

Summarizing recurring concern themes requires a body of concerns that two pilot ministries will not have for months, and it is the one capability in the product that involves machine-summarizing sensitive disclosures. It is deferred to be built deliberately later rather than shipped thin.

## Settled: Stalled Has Two Conditions

A relationship becomes `Stalled` when either is true:

1. **Gone silent** — two consecutive weekly check-ins with no response
2. **Responding, not meeting** — three consecutive `2` replies

The second condition exists because a leader who answers promptly every week to say they did not meet is fully responsive and never silent, so the first condition never fires while the relationship quietly dies.

Three weeks rather than two, because a run of busy weeks is ordinary life. `docs/non-goals.md` is explicit that a missed meeting is not wrongdoing, and this threshold must not be tightened into a punishment.

The care item states which condition fired. "Responding, not meeting — 3 weeks" and "gone silent — 2 weeks" call for completely different conversations, and an admin must know which one they are walking into before they pick up the phone.

## Settled: Participation Is Dated, Never Deleted

When someone leaves a relationship that continues without them, their membership receives an end date. Their past check-in weeks stay attached to that relationship exactly as recorded, and they return to the roster as `Ready to Pair` unless they have opted out.

A relationship dropping from three participants to one changes nothing structurally. It is still one relationship, now with one participant, and the check-in copy switches from the relationship's name to the person's name on its own.

## Settled: An Unaccepted Relationship Holds Its People

Everyone in a relationship leaves the suggestion pool the moment it is created, before acceptance. Suggesting them elsewhere would let two admins double-book the same person.

The hold is bounded rather than indefinite: the leader is reminded after two days, the relationship surfaces on the admin dashboard after five, and an admin can cancel an unaccepted relationship at any point, returning everyone to `Ready to Pair` immediately. A person is never held by a timeout nobody noticed.

## Settled: Age Ranges

Intake offers six ranges: 18–24, 25–34, 35–44, 45–54, 55–64, 65+.

The age constraint is restated over them: **a leader is not suggested for a participant more than one band above them.** A leader in 25–34 is suggested for participants up to 35–44, but not 45–54.

This is coarser than the ten-year gap it replaces, and deliberately so — Discipler no longer holds exact ages, and a rule must not imply more precision than the data behind it. It remains explainable in one sentence, which the suggestion ADR requires of every input, and manual pairing still overrides it.

## Settled: Pause Is Leader-Controlled, Bounded, and Visible

A leader may pause a relationship they lead. The transition to `Paused` is immediate and requires no admin approval.

A pause runs for exactly one of five periods: 1 week, 2 weeks, 4 weeks, 8 weeks, or 12 weeks. The default is 2 weeks and the maximum is 12. No other duration is permitted.

Weekly check-ins for that relationship are suppressed for the duration of the pause, and no silence accrues against it while it is paused.

Pausing never removes, archives, ends, or hides a relationship. Membership is unchanged and nobody returns to the suggestion pool. The relationship stays on the leader's list of relationships, visibly marked `Paused`, and stays on the admin dashboard, visibly marked `Paused` and distinguishable from Healthy, Stalled, and Ended.

`Paused` masks the relationship's underlying derived state; it does not rewrite the history behind it. No new unanswered check-ins accrue during a pause, and the pause does not answer the old ones. On resume the underlying state resurfaces, so a relationship that was `Stalled` when it was paused is `Stalled` again on resume and stays there until an answered check-in clears that condition. **Resuming never sets `Healthy` on its own.**

A leader may resume early by replying `RESUME`. That resume is also immediate, requires no admin approval, and releases the Starter Message. A relationship resumed early never reaches its pause expiry, so no follow-up item is created for it.

A leader selects the duration in a single confirmation exchange rather than in the original message. Discipler replies naming the relationship and the default — *"Pause check-ins with Emily for 2 weeks? Reply YES to confirm, or reply 1, 4, 8, or 12 for a different number of weeks."* — and both written and numeric forms of the reply are accepted. The confirmation exists so that a stray tap never pauses anything, and it means the common case costs a leader two texts.

> **Supersedes:** an earlier settled rule making `START` the early-resume keyword. `START` is now carrier-level re-opt-in only and carries no domain meaning; `RESUME` resumes a paused relationship. See **Settled: Keyword Routing and Eligibility** for the reasoning.

> **Supersedes:** `docs/reference/mentor-experience.md` and `docs/reference/mentee-experience.md`, which describe a fixed four-week pause that resumes automatically when it ends. The duration is now a choice among five values, and expiry no longer resumes anything. Those files are historical evidence and are not edited; the conflict is recorded here.

## Settled: An Expired Pause Requires Admin Review

When the selected pause period expires, the relationship does not return to Active. It remains `Paused`, and the expiry creates or surfaces a follow-up item for the admin.

The admin must be able to see that the relationship was paused, which period was selected, that the period has expired, that the relationship has not resumed, and that admin review is required.

Expiry is not equivalent to Resolved, Active, or Ended, and it sends nothing. The Starter Message is released on resume, never on expiry.

The admin decides what happens next: resuming the relationship, which releases the Starter Message and lets the underlying derived state resurface, or ending it with a recorded reason. The follow-up item clears only when the admin acts.

## Settled: A Swap Request Is a Request, Not a State Transition

`SWAP` is a leader's request to be released from a specific relationship and matched with a different participant. Discipler records the request against that relationship and creates a follow-up item for the admin.

Receiving a swap request does not end the relationship, remove the leader, remove the participant, return anyone to the pairing pool, create a replacement relationship, reassign anybody, or set the relationship to `Ended`. It is not a relationship-state transition. The relationship holds its existing state — including `Paused` — and remains intact until an admin acts.

The admin must be able to see which leader requested the swap, which relationship the request concerns, that the leader is asking for a different participant, and that the relationship remains intact while awaiting a decision.

Recording the request never clears the follow-up item. The admin resolves it either by ending the relationship with a recorded reason or by resolving the request and leaving the relationship in place. Reassignment and replacement need no separate action: ending a relationship returns everyone to `Ready to Pair`, and the admin pairs from the roster as usual.

## Settled: Keyword Routing and Eligibility

`PAUSE`, `RESUME`, and `SWAP` act on a single relationship. A leader may hold several, and an inbound message carrying only a keyword does not say which.

Discipler resolves the target by **eligibility for the requested action**:

- If exactly one relationship is eligible, the command applies to it with no further exchange.
- If more than one is eligible, Discipler replies with a numbered menu of those relationships and waits for a selection.
- If none is eligible, Discipler replies plainly stating so and does nothing.

Eligibility is defined per command:

| Keyword | Eligible relationships |
|---|---|
| `PAUSE` | Active and not already paused |
| `RESUME` | Paused only |
| `SWAP` | All live relationships, including `Paused` and including `Awaiting Leader Acceptance` |

Because eligibility is per command, ambiguity is rarer than the raw relationship count suggests: a leader holding three relationships of which one is paused resolves a `RESUME` with no menu at all.

**Discipler must never infer the target relationship from Check-In Sequence position.** The sequence position disambiguates a check-in *answer*; it must not be borrowed to disambiguate a keyword, because `RESUME` and `SWAP` normally arrive with no open sequence and the two cases would then behave differently for no reason a leader could predict.

`SWAP` is eligible on an unaccepted relationship because from that state it reads as a decline. Without it a leader who has been matched with someone they know is wrong has no way to say so — their only option is a silence indistinguishable from being on holiday, which is exactly the ambiguity the five-day follow-up item asks the admin to resolve.

## Settled: `START` Is Carrier-Level Only

`START` is the carrier-level re-opt-in that reverses `STOP` and restores messaging to a person, as `docs/reference/` describes. It carries no relationship-level meaning.

The keyword set is `STOP`, `HELP`, `PAUSE`, `RESUME`, and `SWAP`.

Three reasons the resume keyword was renamed rather than the collision arbitrated. `START` is a carrier-reserved word: carriers and the delivery vendor act on it before Discipler's webhook is consulted, so any domain meaning attached to it is contingent on vendor configuration that may later have to change. Arbitrating by opt-out state — carrier re-opt-in today, relationship resume tomorrow, same word — produces a rule that cannot be explained to a leader in one sentence. And making `START` do both at once would release a Starter Message to third parties as a side effect of someone fixing their own opt-out.

## Settled: One Keyword Exchange, Recency Wins

A keyword prompt and an unanswered check-in question can be outstanding at the same time, and a numbered reply could answer either.

**The most recent prompt owns the next inbound reply.** A keyword exchange opened mid-sequence takes the reply; the check-in question stays unanswered with its next-day reminder clock still running, and the sequence resumes its ordinary handling afterwards.

At most one keyword exchange is open per person at a time; a second keyword replaces the first.

An unanswered keyword exchange expires after twenty-four hours **with no reminder**, and expiry raises nothing and changes nothing. A check-in question is Discipler's question and is worth re-sending once; a keyword exchange is something the leader initiated, and re-prompting someone about a request they abandoned is nagging.

Clarification handling inside a keyword exchange is identical to a check-in: at most two re-prompts, then Discipler stops re-prompting but keeps listening until the exchange expires. A leader who mistypes twice and replies correctly nineteen hours later still gets their pause — they asked for it and never withdrew the request.

A keyword arriving where a relationship's check-in question is currently open **withdraws that pending question** rather than leaving it to age. Otherwise pausing a relationship would contribute to it being flagged `Stalled` on resume, which is precisely what the pause rules exist to prevent.

A bare, exact keyword is still a keyword during the concern detail step. The `C` is already recorded and the badge already raised, so nothing is lost by treating it as one, and the alternative records `PAUSE` as the text of someone's hardest week while ignoring a request to step back. Prose containing the word is unaffected — matching is whole-message.

## Settled: No Inbound Message Falls Through to Silence

A participant has no dashboard and no account, so texting back is the only channel they have. Every inbound message resolves to something.

- A **recognized keyword from a participant** is acknowledged and raised as an admin follow-up item. A participant texting `PAUSE` is most often someone who wants out and has no other route; dropping it is the one outcome that clearly fails them.
- **Unrecognized free text from a participant** receives one acknowledgement pointing them to their ministry, rate-limited so a participant in a back-and-forth is not auto-replied to repeatedly. It raises no follow-up item. Raising one for every "thanks!" would bury the Care Needed view and train an admin to ignore it.
- A **keyword with no eligible relationship** receives a plain reply stating the situation.

## Settled: Participants Are Not Told When a Leader Pauses

A pause is between a leader and their ministry. The participant's relationship has not changed, they are not returned to the pool, and they have never received a check-in — so a message saying their check-ins are paused would be explaining the absence of something they never knew existed.

The admin sees the pause on the dashboard and receives a follow-up item when the period expires, so a human is in the loop on the timeline that matters and can decide whether the participant should hear from someone.

This is deliberate silence rather than an oversight, and it is a candidate for pilot feedback rather than settled forever.

## Settled: Every Message Is the Ministry's Voice

A participant should feel they are interacting with their church, not with a software vendor layered between them and their ministry.

Every outbound message is the ministry speaking. Discipler is the delivery mechanism and never the speaker: it does not refer to itself by name in message copy, and no message is phrased as reporting to a third party about the ministry.

Every message carries the ministry name as a prefix — `ABC Church: Hi James! Did you meet with David this week? Reply 1 for yes, 2 for no.` — with no exceptions, including menus, confirmations, reminders, and acknowledgements. A lone next-day reminder is the message most likely to be read out of context and least able to afford being unattributed. Where a prefix would tip a message into a second segment, the message is shortened; the attribution is not dropped.

Each ministry sends from its own number for the pilot. Sending identity is modeled as a property of the Ministry from the first line of code, even while every ministry could resolve to the same number, because retrofitting that touches every message path.

## Settled: The A2P Compliance Prefix Is a Stated Exception

A2P messaging compliance requires identifying that a message is sent through Discipler. This directly contradicts the rule above, and the exception is recorded here so that it is not later removed as a violation of it.

`Discipler:` stacks in front of the ministry prefix — `Discipler: ABC Church: …` — on:

- opt-in messaging
- the first message Discipler ever sends a person
- the first message after a silence gap
- the `HELP` response

The two prefixes stack rather than substitute because they answer different questions — who is speaking, and what service is delivering it — and collapsing them loses one. On the messages where a participant most needs to see their church's name, dropping the ministry prefix would be the worst possible trade.

A Starter Message that runs to two segments is accepted rather than trimming compliance language; carriers reassemble it and the recipient sees one message.

**This has not been reviewed by a lawyer or checked against a live campaign registration.** A2P brand and campaign requirements come from the carriers and the registry, they change, and they are not something to accept on an agent's judgment. Review alongside `docs/consent-language.md` before the first pilot.

## Settled: A Silence Gap Is Thirty Days, Per Person Per Ministry

A silence gap is thirty rolling days since Discipler last sent that person a message.

Two rules key off it: the A2P compliance prefix, and the participant-facing opt-out language. They share one definition rather than being separately maintained.

Rolling days rather than calendar months, because a person messaged on 31 January and again on 1 March has crossed two calendar boundaries with twenty-nine days of contact. Per person per ministry, because every other rule in the product is ministry-scoped and making this one the exception would invite a cross-ministry read of a person's history, which the tenant isolation rule forbids.

## Settled: What Opt-Out Language a Participant Receives

A participant receives opt-out and rate-disclosure language on the Starter Message, and again on the first message following a silence gap — a reassignment, a resumed relationship, anything that breaks thirty days of quiet.

Participants do **not** receive it monthly. The monthly rule — opt-out language on the first check-in of each calendar month — stands unchanged and applies to leaders only, because only leaders receive check-ins.

> **Supersedes:** `docs/reference/mentee-experience.md`, which gives mentees a monthly reminder on a check-in. Participants receive no check-ins in this model, so the rule had no surface to attach to.

## Settled: Replies Are Matched Whole-Message, Not by Substring

Discipler advertises the explicit form — *"Reply 1 for yes, 2 for no"*, *"Reply A for outstanding, B for good, C for concern"* — because digits and letters avoid both typos and an unbounded space of word variants. Behind that, an enumerated list of tokens, synonyms, and known typos is accepted: `yes`, `y`, `yeah`, `nope`, `great`, `good`, `concern`, and misspellings including `gret` and `oncern`.

**Matching is against the whole message**, after stripping punctuation, emoji, and a closed list of leading and trailing pleasantries. It is not a substring search.

> **Supersedes:** the earlier rule that matching "tolerates surrounding text." Under substring matching, *"it wasn't great"* contains `great` and resolves to **outstanding** — silently converting a relationship that needs care into a healthy one, with nobody ever finding out. *"no concerns"* contains both `no` and `concern`. Sentiment is never inferred from free text, and a substring search over a sentence is exactly that inference, made badly.

The closed strippable list must never contain a fragment that inverts meaning when removed. `we didn't` is part of a token, never a wrapper: stripping it from *"yes we didn't"* would produce the opposite of what was said.

A reply containing two answers — *"1 and it was great"* — is unreadable and draws a clarification. Advancing two steps on one message lets a leader skip past the meeting question without being asked it, and recording a satisfaction rating for a meeting nobody confirmed happened breaks the ordering guarantee that a meeting is established before its quality is.

Every unreadable reply is recorded in history. Extending the enumerated list from observed pilot typos is deferred, not rejected, and the data for it accumulates from the first week whether or not it is acted on.

## Settled: Stalled Reports a Duration Matched to Its Reason

A relationship's care item reports how long the condition has held, and the unit follows the reason:

- **Gone silent** reports days since last contact
- **Responding, not meeting** reports the number of weeks reported as no meeting

The two cannot share a counter. Days since last contact is already fourteen or more when silence fires, and roughly seven when not-meeting fires — a relationship going nowhere for three weeks would read as more recent than one silent for a fortnight.

The relationship state derivation returns state, care reason, **and** the reason's duration. The duration is derived output, never a UI inference, for the same reason the care reason is.

> **Supersedes:** the display rule under **Settled: Two-Week Silence Care Rule**, which shows weeks since the last submitted check-in in all cases. That measure is correct for silence and misleading for responding-but-not-meeting.
