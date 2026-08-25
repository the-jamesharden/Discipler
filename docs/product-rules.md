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

A leader may resume early by replying `START`. That resume is also immediate, requires no admin approval, and releases the Starter Message. A relationship resumed early never reaches its pause expiry, so no follow-up item is created for it.

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
