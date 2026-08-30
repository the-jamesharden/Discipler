# Spec: Core Operating Loop

Status: ready-for-agent

Scope note: this spec covers the operating loop end to end — Intake, Roster, Suggested Pairs, Acceptance, the Check-In Rhythm, and care surfacing. The Admin surface is specified only as far as the loop requires it. The full six-tab admin dashboard with its charts and Quick Stats panel is a follow-up spec, as is Ministry Intelligence.

This spec implements `docs/adr/0001-pairing-suggestion-inputs.md`, `docs/adr/0007-the-check-in-cadence-and-the-week-boundary.md`, and `docs/adr/0008-the-phone-number-is-the-sign-in-credential.md`. **The ADR-0001 conflict is closed:** suggestion tiers are counts of shared availability cells, and the Discipleship Goal orders candidates within a tier rather than gating one. ADR-0001 is amended accordingly. See *Settled since approval* at the foot of this spec.

## Problem Statement

A ministry has people who want to disciple others and people who want to be discipled, and no workable way to turn that into sustained relationships. An admin recruits both sides, collects availability on paper or in a spreadsheet, works out by hand who could meet whom and when, introduces them, and then loses visibility entirely. Nobody finds out a relationship stopped meeting until someone mentions it months later, and by then it has quietly ended.

The administrative work scales linearly with the number of relationships, so the ministry stops growing at whatever number the admin can personally hold in their head. Meanwhile the signals that matter most — a relationship that has gone quiet, a leader carrying something they need help with — reach the admin last or not at all.

## Solution

Discipler carries the operating burden around the relationship without touching the relationship itself.

People enter through a native Intake form that captures who they are, when they can meet, what they are looking for, and their consent. The Roster shows the admin everyone in the ministry and exactly where each person stands. Suggested Pairs proposes one-to-one matches from availability overlap, filtered by the ministry's constraints and explained in one plain sentence each; the admin always decides, and can pair anyone manually, including forming a relationship with several participants.

Creating a relationship does not start it. Its Leader receives an Invitation Link, sees on the Leader Dashboard who they have been matched with, sets a password, and accepts — which activates the relationship and releases the Starter Message to everyone in it.

From then on Discipler is nearly invisible. Once a week each Leader gets a single text conversation covering every relationship they lead, one after another. Their answers, and their silences, become the Week-by-Week History from which everything else is derived: the current Relationship State, the Care Needed view, and later the ministry's own reporting. A relationship that goes quiet, or that answers faithfully every week to say no meeting happened, surfaces to the admin before it disappears.

## User Stories

### Intake and consent

1. As a Person invited to a Ministry, I want to complete a single short form — reached from a link my pastor sent me, or from a QR code that opens that same link — so that I can join without creating an account or learning software.
2. As a Person completing Intake, I want to select every time window that could work for me on a grid, so that I am not forced to describe my schedule in prose.
3. As a Person completing Intake, I want to state what I am hoping to get out of discipleship, so that I am matched with someone who wants the same thing.
4. As a Person completing Intake, I want to agree to receive text messages as a distinct decision, so that I know exactly what I am opting into.
5. As a Person completing Intake, I want to agree to my phone number being shared as a separate decision, so that agreeing to hear from my church does not automatically hand my number to a stranger.
6. As a Person completing Intake, I want to give my age as a range rather than an exact number, so that I am not asked for more precision than the Ministry needs.
7. As a Person completing Intake, I want to select my gender on the same form as everything else, so that joining is one form and not two.
8. As a Person completing Intake, I want my email address to be optional, so that a missing email does not block me from participating.
9. As a Person who has just completed Intake, I want an immediate Welcome Message, so that I know I am in and what to expect next.
10. As a Ministry, I want the exact wording each Person agreed to recorded with a version and a timestamp, so that we can answer later what someone actually consented to.
11. As an Admin, I want a Person's Intake to be the only thing that grants consent, so that importing someone never speaks on their behalf.

### Roster

12. As an Admin, I want to upload a spreadsheet of names, phone numbers, and email addresses, so that I do not type our congregation in by hand.
13. As an Admin, I want uploaded people to appear as `No Intake Submitted`, so that being on our roster is never mistaken for wanting to participate.
14. As an Admin, I want to see every Person in the Ministry with their Participation Status, so that I know at a glance who is available and who is not.
15. As an Admin, I want to see who each Person is currently in a relationship with, so that I do not have to open a record to find out.
16. As an Admin, I want a Person in a relationship with several participants to show everyone in it, so that group membership is visible from the Roster.
17. As an Admin, I want an unpaired Person to carry a Pair action directly on their row, so that I can act on what I am looking at.
18. As an Admin, I want to set an intended role for a Person before they complete Intake, so that I can plan while waiting on them.
19. As an Admin, I want to send a Person a link that reopens their own Intake form prefilled, so that their availability or phone number can be corrected without giving them an account.
20. As an Admin, I want a Person who has opted out to be excluded from pairing and from follow-up, so that we honor what they told us.

### Suggested Pairs

21. As an Admin, I want Discipler to propose one-to-one matches, so that I do not compare everyone's availability by hand.
22. As an Admin, I want each suggestion labelled Excellent fit, Good fit, or Recommended, so that I know whether I am looking at a strong option or the bottom of the list.
23. As an Admin, I want each suggestion to state its reason in one plain sentence, so that I can explain to anyone why it was proposed.
24. As an Admin, I want suggestions never to show a numeric compatibility score, so that Discipler is not making a judgment it cannot justify.
25. As an Admin, I want gender matching enforced absolutely in a one-to-one and in any group we declare single-gender, so that our safeguarding policy cannot be bypassed by anyone using the product.
26. As an Admin, I want the age constraint to apply only to suggestions, so that I can still pair two people myself when I know it is right.
27. As an Admin, I want people who share no availability with any eligible Leader listed separately rather than hidden, so that the hardest-to-place people do not silently disappear.
28. As an Admin, I want people in the No Schedule Overlap section never presented as a fit, so that I am not offered a relationship that cannot meet.
29. As an Admin, I want the suggestion list ordered stably between visits, so that I can trust it.
30. As an Admin, I want ties broken in favor of whoever has waited longest since Intake, so that nobody is overlooked indefinitely.
31. As an Admin, I want suggestions to update as soon as pairing changes who is available, so that I never act on a stale list.
32. As an Admin, I want to pair any two eligible people from the Roster without using a suggestion, so that my judgment is never subordinate to the list.
33. As an Admin, I want to form a relationship with several participants by selecting them together, so that groups need no separate workflow.

### Acceptance

34. As an Admin, I want creating a relationship not to activate it, so that nothing reaches participants before their Leader has agreed to lead them.
35. As a Leader, I want a text telling me I have been matched and inviting me to look, so that my first contact is an invitation rather than an assignment.
36. As a Leader, I want to see who I have been matched with before I am asked for anything, so that I know why I am being asked to set up an account.
37. As a Leader, I want to set a password to accept, so that I have a way back into Discipler later.
38. As a Leader, I want the phone number Discipler will text shown to me rather than requested, so that I cannot mistype my way out of my own check-ins.
39. As a Leader, I want the name I type to be what appears on the site, so that a spelling difference is not treated as an error.
40. As a Leader, I want my Invitation Link to keep working if I open it and get interrupted, so that a phone call does not cost me a re-issue.
41. As a Ministry, I want Acceptance recorded with a timestamp, so that we have a durable record that this Leader agreed to this relationship.
42. As a Participant, I want to hear who my Leader is and how to recognize their number, so that an unknown text tomorrow is not alarming.
43. As a Participant, I want a way to say a match is not right without a conversation, so that declining costs me nothing socially.
44. As an Admin, I want to be reminded when a Leader has not accepted after two days, so that a relationship does not sit unstarted without anyone noticing.
45. As an Admin, I want an unaccepted relationship surfaced to me after five days with how long it has waited, so that I can intervene.
46. As an Admin, I want to cancel an unaccepted relationship, so that people are never held out of the pool by a decision nobody made.

### The Check-In Rhythm

47. As a Leader, I want one weekly text conversation covering every relationship I lead, so that leading three relationships does not mean three separate threads.
48. As a Leader, I want to be asked about my relationships in a consistent order, so that the conversation is predictable week to week.
49. As a Leader, I want to be asked whether we met before being asked how it went, so that I am not answering questions about a meeting that did not happen.
50. As a Leader, I want answering "no" to move straight on, so that a missed week costs me one reply.
51. As a Leader, I want to be asked what the Concern was only when I have said there is one, so that I am not prompted for detail I do not have.
52. As a Leader, I want my replies understood when I type "yes" instead of "1", so that I am not fighting the format.
53. As a Leader, I want one clarification when my reply cannot be read, so that a typo does not cost me the week.
54. As a Leader, I want Discipler to stop re-prompting after two clarifications but still accept a late correct reply, so that I am neither nagged nor locked out.
55. As a Leader, I want a closing thank-you only after my last relationship, so that I know the conversation is finished.
56. As a Leader, I want a single reminder the day after I miss a question, so that a forgotten text is recoverable.
57. As a Leader, I want the conversation to move on if I abandon it partway, so that my other relationships still get asked about.
58. As a Leader, I want a fresh conversation each week rather than being held to last week's unfinished one, so that I can always start clean.
59. As a Participant, I want to receive no check-ins, so that participating costs me nothing.
59a. As a Leader, I want a keyword to apply to my only eligible relationship without being asked which, so that the common case costs me one text.
59b. As a Leader with several eligible relationships, I want to pick one from a numbered list, so that a keyword is never applied to the wrong relationship.
59c. As a Leader, I want a keyword I send mid-conversation to be understood as a keyword, so that I am not answering a check-in question by accident.
59d. As a Leader, I want an abandoned keyword request to expire quietly, so that I am not nagged about something I chose not to finish.
59e. As a Leader, I want pausing the relationship I am currently being asked about to withdraw that question, so that stepping back does not count against me.
59f. As a Leader, I want a keyword that applies to nothing to get a plain answer, so that I am not left wondering whether it worked.
59g. As a Participant, I want a text I send to reach a human, so that having no account does not mean having no voice.
59h. As a Ministry, I want every message to read as coming from us, so that our people experience their church rather than a software vendor.
59i. As a Ministry, I want the delivery service identified where compliance requires it, so that our messaging stays within carrier rules.
60. As a Ministry, I want opt-out language on every Starter Message and on the first check-in of each month, so that we meet our obligations without spamming our own people.
61. As a Ministry, I want no phone number ever sent to a Leader by text, so that our first contact reads as a ministry rather than a cold introduction.

### Relationship State and care

62. As an Admin, I want a relationship that has gone silent for two weeks flagged, so that a fading relationship reaches me while it can still be recovered.
63. As an Admin, I want a relationship reporting three weeks of not meeting flagged, so that a faithfully-answering Leader who never meets does not stay invisible.
64. As an Admin, I want the care item to say which condition fired, so that I know whether I am calling about silence or about scheduling.
65. As an Admin, I want a Concern to surface the week it is raised, so that I hear about it while it is current.
66. As an Admin, I want a relationship to return to Healthy once it reports meeting without a Concern, so that state reflects now rather than history.
67. As an Admin, I want an unresolved Concern to persist beside the relationship even after it returns to Healthy, so that it is not buried by a good week.
68. As an Admin, I want to mark a Concern resolved deliberately, so that nothing closes itself.
69. As an Admin, I want multiple Concerns on one relationship shown with a count, so that I can see there is more than one.
70. As an Admin, I want to reach Concern text one Person at a time rather than as a list, so that the most sensitive data in the product takes deliberate effort to read.
71. As an Admin, I want Concern text cleared when I resolve it by default, so that we do not accumulate a permanent file of people's hardest weeks.
72. As an Admin, I want to see contact details, resolve an item, send one additional check-in, resume a paused relationship, or end the relationship from a follow-up item, so that the view is actionable.
73. As a Ministry, I want no interface action to send a message at all, so that the only thing we ever text our congregation is the check-in rhythm they agreed to.
74. As a Leader, I want a missed meeting never framed as a failure, so that answering honestly is safe.

### Pause, swap, and ending

75. As a Leader, I want to pause my check-ins for a season, so that a holiday does not put me in the care queue.
76. As a Leader, I want to choose 1, 2, 4, 8, or 12 weeks with 2 weeks preselected, so that a summer away and a fortnight away are not the same thing.
77. As a Leader, I want a paused relationship to stay on my list marked Paused rather than disappearing, so that stepping back does not cost me the people I lead.
78. As a Participant, I want to stay in my relationship while my Leader is paused, so that I am not returned to the pool without being asked.
79. As a Leader, I want my pause to end only when I resume it or an Admin does, so that my check-ins never restart on a date I have forgotten.
80. As a Leader, I want to reply RESUME to resume a paused relationship immediately, so that returning sooner needs nobody's permission.
81. As an Admin, I want to pause a relationship myself, so that I can act on something I have been told offline.
82. As a Leader, I want to reply SWAP to ask to be matched with someone else, so that a relationship that is not working reaches my Admin without a difficult conversation.
83. As a Leader, I want everything to stay exactly as it is after I ask for a swap, so that asking costs nobody their place while my Admin decides.
84. As an Admin, I want a paused relationship to stay visible and marked Paused, so that I can tell it apart from a healthy, stalled, or ended one.
85. As an Admin, I want an expired pause to reach me for review rather than resuming itself, so that nobody's check-ins restart without a person deciding.
86. As an Admin, I want to see which pause period was selected and that it has expired, so that I know what I am reviewing.
87. As an Admin, I want to resume a paused relationship myself, so that an expired pause has an outcome other than ending it.
88. As an Admin, I want a resumed relationship to return to whatever its history says rather than to Healthy, so that a stalled relationship is not quietly cleared by a pause.
89. As an Admin, I want a swap request to show me the Leader, the relationship, and that a different Participant is being asked for, so that I can act without chasing context.
90. As an Admin, I want neither an expired pause nor a swap request to clear itself, so that nothing that needs my decision disappears before I make it.
91. As an Admin, I want to end a relationship with a recorded reason, so that we know later whether it completed or broke down.
92. As an Admin, I want an ended relationship's history preserved exactly, so that a relationship that ran well and finished is an outcome rather than a deletion.
93. As a Person whose relationship has ended, I want to return to the Roster as available, so that I can be matched again.
94. As an Admin, I want one Participant leaving a relationship not to end it for everyone else, so that the rest can continue.
95. As an Admin, I want a departed Participant's past weeks to stay attached to the relationship, so that history is not rewritten by someone leaving.

### History and integrity

96. As a Ministry, I want what happened stored rather than only the latest values, so that our history can answer questions we have not asked yet.
97. As a Ministry, I want a late reply attached to the question it answers, so that an old unanswered week is never falsely marked answered.
98. As a Ministry, I want Material Assignments dated rather than overwritten, so that we can tell later what was in use during a given week.
99. As a Ministry, I want our data never combined with another Ministry's, so that the agreement we entered into is kept.
100. As a Ministry, I want a record of who viewed a Concern, resolved one, ended a relationship, or exported data, so that sensitive actions are accountable.
101. As an Admin, I want to see a relationship's check-ins newest-first, so that I have context before I make a call.

## Implementation Decisions

### The relationship is the core primitive

A Discipleship Relationship is one Leader and N Participants. A relationship with one Participant is one-to-one; with more than one it is a group. **There is no separate group entity, no `mentee_id` column, and no group-specific code path.** Membership is a dated join: each Participant's involvement carries a start date and a nullable end date, so someone leaving is an end date rather than a deletion, and the relationship continues with whoever remains.

Message copy branches on Participant count — a Participant's name when there is one, the relationship's name when there are several — and never on a group-versus-one-to-one flag. Any design reintroducing that distinction is a regression.

### Single command boundary

Every external trigger enters through one application-service boundary. The commands are: Intake submitted, Person imported, relationship created, relationship cancelled, Leader accepted, inbound SMS received, Admin action taken (resolve, pause, resume, end), and a scheduled tick. Nudge is not among them: it reveals contact details and changes nothing.

Each command returns effects rather than performing I/O directly: outbound messages to enqueue, and history events to append. This is the seam the test suite drives, and it is the only way into the domain.

### Injected clock

Every time-dependent rule reads from an injected clock, never from system time directly. The rules that depend on it: two-week silence, three-week non-meeting, twenty-four-hour sequence timeout, next-day reminder, two- and five-day Acceptance reminders, seven-to-fourteen-day Invitation Link expiry, Pause duration, and Pause expiry — the last evaluated as a distinct condition that raises a follow-up item without changing state.

This is a hard requirement. Without it none of the care logic is testable.

### Two pure functions

**Suggestion ranking.** Takes the eligible Roster and the Ministry's constraint configuration; returns tiered, ordered Suggested Pairs plus the No Schedule Overlap set. No I/O, no clock beyond a supplied "now" for tie-breaking.

Constraints filter before anything is ranked. Gender binds in three ways and none of them is overridable by manual pairing. A **one-to-one** must match, absolutely. A **group that declares a gender** must have every member of that gender, Leader and Participant alike. A **group declared mixed** is not gender-constrained, because a mixed group is the thing it says it is and a constraint that forbade it would forbid the group rather than protect anyone in it. The declaration is made when the group is created and is immutable afterwards, like `kind`. A Ministry wanting its one-to-ones unconstrained disables the rule in settings; no setting makes a declared single-gender group mixed. The age band constraint excludes a Participant more than one band above the Leader — a Leader in 25–34 may be suggested for a 35–44 Participant but not a 45–54 one — governs suggestion only, and is overridable manually. Ranking is availability overlap first, Discipleship Goal separating comparable overlaps, ties broken by longest wait since Intake. Output labels are counts of shared cells out of the grid's thirty-five: **Excellent fit** is four or more shared cells spanning at least two distinct days, **Good fit** is two or three, **Recommended** is exactly one, and zero is the No Schedule Overlap section. *Four blocks on one Saturday is most of that Saturday, not four separate chances to meet* — hence the two-distinct-days requirement. **This supersedes ADR-0001's goal-based tiering, and what the Discipleship Goal now does is open** — see `docs/open-questions.md`. Both constraints are Ministry settings (`suggest_gender_match`, `suggest_max_age_band_gap`), which moves the age rule from *fixed at ten years* to a configurable band gap.

Every suggestion carries a one-sentence reason string. Any future input that cannot be expressed that way is out of scope by construction.

**Relationship State derivation.** Takes a relationship's history; returns its current state, its care reasons, and each reason's duration.

```
Awaiting Leader Acceptance  → created, not yet accepted
Healthy                     → default once accepted
Stalled                     → 2 consecutive unanswered check-ins
                            OR 3 consecutive "did not meet" replies
Needs Care                  → a Concern raised this week
Paused                      → Leader paused this relationship for 1/2/4/8/12 weeks;
                              masks the derived state, nobody returns to the pool
Ended                       → terminal, with a reason
```

A relationship holds exactly one state. Concerns are **not** a state: they are badges that persist beside the relationship until an Admin resolves them, so a relationship can be Healthy with unresolved Concerns outstanding. Stalled clears automatically on any answered check-in; a Concern clears only by explicit resolution.

The care reason is part of the output, not a UI inference — "gone silent, 2 weeks" and "responding, not meeting, 3 weeks" are different reasons and must be distinguishable by the caller.

**The duration is output too, in the unit that matches its reason:** gone silent reports days since last contact, responding-not-meeting reports weeks reported as no meeting. They cannot share a counter — days since last contact is already fourteen or more when silence fires and roughly seven when not-meeting fires, so a shared number would make a relationship going nowhere for three weeks read as more recent than one silent for a fortnight.

`Paused` **masks** the derived state rather than replacing the history behind it. While a relationship is paused the derivation reports `Paused`; on resume it reports whatever the history yields. No new unanswered check-ins accrue during a pause, and the pause does not answer the old ones — so a relationship that was `Stalled` when it was paused is `Stalled` again on resume and stays there until an answered check-in clears the condition. **Resuming never sets `Healthy` on its own.** Setting state to `Healthy` on resume would silently erase a live care signal.

An expired Pause and an open Swap request are **not** states and **not** care conditions derived from check-in history. Like Concerns they are follow-up items that sit beside the relationship, coexist with any state including `Paused`, and clear only by explicit Admin action. Pause expiry changes no state and sends nothing: the relationship remains `Paused` until an Admin resumes or ends it, and the Starter Message is released on resume, never on expiry.

### Ministry settings

One settings surface, three sections, one form. **Ministry** — display name, timezone, `from_name`. **Language** — `leader_noun`, `participant_noun`, with a live message preview beneath. **Pairing** — `suggest_gender_match`, `suggest_max_age_band_gap`, and the check-in day and hour.

The timezone is load-bearing: availability blocks, the check-in cadence, the ISO week boundary, and the monthly opt-out rule all resolve against it.

Message structure, reply tokens, and the opt-out footer are **not** settings and are not rendered as disabled fields either — a greyed-out box invites a request to enable it. They are not on the screen.

### The check-in cadence and the week boundary

`checkin_day` (0–6) and `checkin_hour`, against the Ministry timezone, **clamped to 8am–9pm local by a database check constraint** rather than by the form alone — pilot settings are written by SQL. A church small group meets Sunday and wants a Monday morning prompt; campus discipleship happens midweek and Thursday evening is the natural ask.

`relationship.checkin_day` and `relationship.checkin_hour` are nullable and null on every row; the dispatcher reads `coalesce(r.checkin_day, ms.checkin_day)` from the first line of code. Per-relationship cadence is not surfaced in V1 and the query never has to be rewritten to surface it.

**The cadence is read at enqueue time and stamped as `scheduled_for` on the outbound row. An edit affects future periods only** — it never cancels and never reschedules an enqueued row. Moving Monday 8pm to Wednesday 7pm on a Tuesday changes next week, not this one.

**A week is the ISO week in the Ministry timezone, defined independently of the check-in hour.** The consecutive-unanswered and consecutive-not-meeting counters derive from history against that anchor. A week meaning *since the last prompt* would let a cadence edit produce one week with two prompts and one with none, and the counters would misfire silently.

See `docs/adr/0007-the-check-in-cadence-and-the-week-boundary.md`.

### Check-In Sequence

One sequence per Leader per week, delivered as a single SMS conversation covering every relationship they lead, ordered by relationship start date, earliest first. The sequence advances only in response to a reply.

Per relationship: "did you meet" → on `1`, "how did it go" → on `C`, "what was the Concern". A `2` ends that relationship's turn immediately and moves on. Where a closing thank-you would fall, the next relationship's opening question is sent instead; the thank-you is sent only after the final relationship.

Inbound replies are normalized against an enumerated list of tokens, synonyms, and known typos (`gret`, `oncern`), case-insensitively. **Matching is whole-message, not substring** — punctuation, emoji, and a closed list of pleasantries are stripped, and anything that does not then resolve to exactly one token is unreadable. A reply carrying two answers is unreadable. See `docs/adr/0003-whole-message-reply-matching.md`; substring matching reads `it wasn't great` as **outstanding** and silently converts a relationship needing care into a healthy one.

Unreadable replies get at most **two** clarifying re-prompts, after which Discipler stops re-prompting but continues to accept a valid reply until the sequence advances past that question. **Sentiment is never inferred from free text.** The Concern detail step accepts anything, because prose is the point.

An unanswered question is re-sent once after twenty-four hours; if the reminder is also unanswered the sequence advances to the next relationship, converting abandonment into ordinary unanswered questions that the existing Stalled rule handles. The same applies to an unanswered Concern detail request — the `C` is already recorded and the badge already raised.

If a new week comes due while a sequence is open, the old sequence is abandoned and its unanswered questions remain unanswered in history. Two sequences never run for one Leader at once.

### Inbound routing

One webhook handles every inbound message. Resolution is: sender's phone number → Person → their open Check-In Sequence → the question currently awaiting a reply. Nothing resolves to "the Person's relationship" — a Leader may hold several, and the sequence position is what disambiguates.

Keywords are handled before sequence interpretation. The keyword set is `STOP`, `HELP`, `PAUSE`, `RESUME`, and `SWAP`.

`STOP` is the person-level carrier opt-out and is unchanged. `START` is the person-level carrier re-opt-in that reverses it and carries **no** relationship-level meaning — it is a carrier-reserved word acted on before Discipler's webhook is consulted, so domain behavior must not rest on it. `HELP` returns the full keyword list.

`PAUSE`, `RESUME`, and `SWAP` are relationship-scoped domain commands:

- `PAUSE` — moves that relationship to `Paused` immediately, for a selected period of 1, 2, 4, 8, or 12 weeks, defaulting to 2. No Admin approval is involved.
- `RESUME` — resumes that paused relationship immediately and releases the Starter Message. No Admin approval is involved. Because the pause has ended, no expiry follow-up item is ever raised for it.
- `SWAP` — records a request against that relationship and raises an Admin follow-up item. It changes no state, moves nobody, and ends nothing.

**Target resolution is by eligibility for the requested action.** Exactly one eligible relationship means the command applies directly; more than one opens a Keyword Exchange presenting a numbered menu; none draws a plain reply saying so. `PAUSE` considers active, unpaused relationships; `RESUME` considers paused ones only; `SWAP` considers all live relationships including `Paused` and including `Awaiting Leader Acceptance`, where it reads as a decline. **The target is never inferred from Check-In Sequence position.**

**A Keyword Exchange is the second stateful inbound conversation.** `PAUSE` always opens one, carrying the target and the duration in a single confirmation — *"Pause check-ins with Emily for 2 weeks? Reply YES to confirm, or reply 1, 4, 8, or 12 for a different number of weeks."* Both written and numeric forms are accepted.

At most one Keyword Exchange is open per Person; a second keyword replaces the first. **The most recent prompt owns the next inbound reply**, so an exchange opened mid-sequence takes it while the check-in question stays unanswered with its reminder clock running. An unanswered exchange expires after twenty-four hours **with no reminder**, raising and changing nothing. Clarification handling matches the check-in cap: two re-prompts, then stop re-prompting and keep listening until expiry.

A keyword resolving to the relationship whose check-in question is currently open **withdraws that pending question**, so a pause never accrues silence against itself. A bare exact keyword is still a keyword during the Concern detail step; the `C` and badge are already recorded, and the detail request becomes an ordinary unanswered question.

**No inbound message falls through to silence.** A recognized keyword from a Participant is acknowledged and raises an Admin follow-up item. Unrecognized free text from a Participant draws one rate-limited acknowledgement pointing them to their Ministry and raises nothing.

### Outbound messages and limits

All outbound messages go through one queue. **Every message passes a recipient-level check before it sends** — consent, an open opt-out, a number to send to — and this is enforced at the sending layer, not at the button, so no future write path can enqueue its way around it.

No interface action sends a message. The Check-In Rhythm is the only thing that generates participant-facing traffic, and it is self-limiting by construction, so there are no per-recipient rate limits. Nudge reveals contact details and sends nothing; see `docs/adr/0010-nudge-reveals-a-number-and-sends-nothing.md`.

Contact-sharing consent is checked **at send time**, never assumed from enrollment. A message that would include a phone number is not sent with the number if consent is absent.

Contact details are never sent to a Leader by SMS. A Participant does receive their Leader's name and number, which is what the contact-sharing consent covers.

**Every message is the Ministry's voice.** Discipler is delivery and never the speaker: it does not name itself in copy, and no message is phrased as reporting to a third party about the Ministry. Every message carries the Ministry name as a prefix, without exception. The single exception to Discipler naming itself is the A2P compliance prefix — `Discipler:` stacks in front of the Ministry prefix on opt-in messaging, first-ever contact, the first message after a thirty-day Silence Gap, and the `HELP` response. Sending identity is a property of the Ministry from the first line of code, with one number per Ministry for the pilot.

A Participant receives opt-out and rate-disclosure language on the Starter Message and again after a Silence Gap. The monthly rule — opt-out language on the first check-in of each calendar month — applies to Leaders only, because only Leaders receive check-ins.

### Acceptance and authentication

Creating a relationship puts it in `Awaiting Leader Acceptance` and removes everyone in it from the suggestion pool. Nothing is sent to Participants.

The Leader receives an Invitation Link: individualized, bound to the Person record rather than to an email address, resolving without a session. Possession of the phone it was sent to is the authentication. It expires in seven to fourteen days and is consumed **on account creation, not on resolution**, so a Leader who opens it and is interrupted can return to the same message.

The flow reveals the match first, then asks for a name and password. The phone number is displayed, not accepted as input — a "not my number" affordance notifies the Admin and changes nothing, so a forwarded link cannot re-point an account. The typed name is stored as given; a mismatch with Intake raises nothing.

Acceptance activates the relationship, releases the Starter Message to everyone in it, and records the timestamp.

Sessions are long-lived, on the order of a year. Recovery is by password. **One-time codes are explicitly post-launch**; until they ship a lost password requires an Admin reset, and that cost is accepted.

Two access tiers only: Admin, who sees everything in their Ministry, and Leader, who sees only their own relationships. `Coordinator`, `staff`, and `pastor team` all name the Admin role and must not become separate tiers.

### Participation Status

Person-level, derived, distinct from Relationship State: `No Intake Submitted` → `Ready to Pair` → `Paired` → `Opted Out`. A paused relationship still counts as `Paired`. Roster membership, Intake completion, and pairing eligibility are three separate facts and must never collapse into one flag.

Pairing requires completed Intake on both sides of a relationship: a Person who has not completed it can be made neither a Participant nor a Leader. Eligibility to lead is a plan an Admin may record early and does not substitute for Intake.

### Material Assignment

Assigned to the **relationship**, never to a Person. One Material at a time. An assignment has a start date and an open end; assigning a new one closes the previous. Periods never overlap and never leave gaps.

When a Material changes mid-week, the week belongs to whichever was assigned **at the moment the check-in was answered**. A week is never split.

The assignment interface is deferred from V1 — but the data is not. History must be complete from the first week of the pilot because it cannot be reconstructed.

### History

Append-only. New facts never overwrite old ones. A late reply attaches to the question it answers and never rewrites an earlier week as answered. Membership changes, Material Assignments, Pauses, and endings are all dated rather than mutated.

Current state, the Care Needed view, and future reporting are all derived from this one history. There is no second source of truth, and no Ministry's history is ever combined with another's.

## Testing Decisions

**What makes a good test here.** Drive real command sequences through the boundary and assert on observable outcomes — which messages were enqueued and what the derived state became. A test that asserts on a database row, an internal function call, or the shape of an intermediate value is testing implementation and will break on the first refactor. The rule of thumb: a test should read like a description of what a Ministry experienced.

**Primary seam: the command boundary.** Most behavior is tested here, driving multi-week scenarios against a controlled clock and asserting on the outbound queue and the read model.

Scenarios that must be covered at this seam:

- Import a Person, confirm nothing is sent and they can be paired neither as a Participant nor as a Leader; complete Intake, confirm the Welcome Message and the move to `Ready to Pair`.
- Create a relationship, confirm Participants receive nothing and everyone leaves the suggestion pool; accept, confirm the Starter Message reaches everyone and the state becomes Healthy.
- A Leader with three relationships receives one sequence; verify ordering, that each relationship's answer attaches to the right relationship, and that the thank-you arrives only after the last.
- A `2` reply skips the satisfaction question.
- A `C` reply raises a badge, sets Needs Care that week, and returns to Healthy the following week while the badge persists.
- Abandonment mid-sequence: the reminder fires at twenty-four hours, then the sequence advances; the abandoned questions age into Stalled.
- Two weeks of silence produces Stalled with the silence reason and a duration in days since last contact; three `2` replies produce Stalled with the not-meeting reason and a duration in weeks. **The reasons and their units must be distinguishable.**
- A new week arriving mid-sequence abandons the old one without rewriting its history.
- Nudge reveals contact details and sends nothing.
- Contact-sharing consent absent means no phone number is sent.
- Every outbound message carries the Ministry prefix; the compliance prefix appears on first contact, after a thirty-day Silence Gap, and on `HELP`, and not otherwise.
- A Participant messaged after a thirty-day gap receives opt-out language again; a Participant messaged within it does not.
- Pause suspends check-ins for that relationship, keeps membership, keeps Participants out of the pool, and leaves the relationship visible and marked `Paused` to both its Leader and the Admin.
- `RESUME` resumes a paused relationship immediately and releases the Starter Message.
- A keyword from a Leader with exactly one eligible relationship applies directly; with two it opens a Keyword Exchange and applies only after a selection; with none it draws a plain reply and changes nothing.
- Eligibility is per command: a Leader holding one paused and two active relationships resolves `RESUME` with no menu.
- A keyword arriving mid-sequence takes the next reply; the check-in question stays unanswered and its reminder still fires.
- A Keyword Exchange expires at twenty-four hours with no reminder sent and nothing raised; a second keyword replaces an open exchange.
- A valid reply arriving after two clarifications, before expiry, is still honored.
- `PAUSE` on the relationship currently being asked about withdraws that pending question, which never ages into Stalled.
- A bare `PAUSE` during the Concern detail step is treated as a keyword; the Concern and its badge survive and the detail request ages out normally.
- A recognized keyword from a Participant raises a follow-up item; unrecognized free text from a Participant does not, and is acknowledged at most once per rate-limit window.
- `START` from an opted-out Person restores messaging and resumes no relationship.
- A pause period elapsing raises a follow-up item, sends nothing, and leaves the state `Paused`; the Admin then resuming it releases the Starter Message.
- A relationship that was `Stalled` when it was paused is still `Stalled` on resume, and clears only on an answered check-in. **Resume must not set `Healthy`.**
- A relationship resumed by `RESUME` before its period elapses never raises an expiry follow-up item.
- `SWAP` records a request and raises a follow-up item without changing state, moving anyone, or clearing itself, and coexists with `Paused`.
- An Invitation Link survives being opened and abandoned, and is consumed on account creation.
- Two Ministries operating concurrently never see each other's data.
- A cadence edit mid-week leaves this week's enqueued prompt untouched and applies from the next period.
- A `checkin_hour` outside 8am–9pm is refused by the database, not only by the form.
- Moving the check-in day does not change the consecutive-unanswered or consecutive-not-meeting counters for weeks already recorded.

**Suggestion ranking, tested directly as a pure function.** Rule-dense and I/O-free: constraint filtering, tier assignment, ordering, tie-breaking by longest wait, and the No Schedule Overlap set. Testing these through the command boundary would require constructing a full Ministry to assert a tie-break. Every rule in ADR-0001 gets a case, including the negative ones — that gender is not overridable, that age is, and that no numeric score is ever emitted.

**Relationship State derivation, tested directly as a pure function.** History in, state and care reasons out. Table-driven over the state matrix, with explicit cases for Healthy-with-unresolved-Concern, the two Stalled conditions, automatic Stalled clearing, non-automatic Concern clearing, and Ended as terminal.

**Reply normalization** is tested as a pure function too — a table of real-world inputs (`yes`, `Yes we did!`, `y`, `nope`, `great`, `gret`, emoji) against expected tokens or an explicit unreadable result. The table must include the cases whole-message matching exists to get right: `it wasn't great`, `no concerns`, `we didn't meet`, and `1 and it was great` are all **unreadable**, never a token. The clarification cap and the continue-to-listen behavior are tested at the command boundary, since they are stateful.

**No prior art exists.** This is a greenfield repository; these tests establish the conventions rather than following them.

## Out of Scope

- **The full Admin dashboard** — Overview charts, Quick Stats, the Check-Ins tab breakdown. A follow-up spec. This spec builds only what the loop needs to run.
- **Ministry Intelligence and the quarterly report.** The interface is deferred; the history that feeds it is not, and is in scope here.
- **The Material assignment interface.** Data model in scope, admin UI out.
- **The Planning Center API.** V1 is CSV upload only.
- **On-demand Concern aggregation.**
- **Phone one-time codes.** Password only at launch.
- **A Participant-facing dashboard.** Participants have no account and no login.
- **Participant-editable availability.** Only an Admin-sent tokenized re-entry link.
- **Participant check-ins.** Leaders are the only respondents — but nothing may assume one respondent per relationship, and no response record may be keyed to the relationship alone rather than to the Person who sent it. A Ministry may ask for this later.
- **Kickoff events and launch modes.** Acceptance is the launch; a kickoff is not modeled.
- **Cross-ministry anything.** Rejected on principle, not deferred.

## Further Notes

**The consent wording has not had legal review.** `docs/consent-language.md` is drafted to be accurate and to cover what Discipler actually does, and the version identifier is in place, but TCPA exposure should not be accepted on an agent's judgment. Review before the first pilot.

**Deferring the report defers the interface, never the data.** The Week-by-Week History must be complete and correct from the first week of the pilot. It cannot be reconstructed afterwards, and getting it wrong silently invalidates every future report.

**The reason-card rule is a permanent constraint, not a UI preference.** Every Suggested Pair must be explainable in one plain sentence. This is the guardrail that keeps suggestion from becoming the opaque compatibility engine `docs/non-goals.md` rejects, and it should be enforced in the type system if possible — a suggestion without a reason string should not be constructible.

**Do not tighten the care thresholds.** Two weeks of silence and three weeks of not meeting were chosen deliberately, and `docs/non-goals.md` is explicit that a missed meeting is not wrongdoing. These numbers exist to help an Admin help someone, not to score anyone.

**Twilio is a delivery vendor, not a domain concept.** It appears behind the outbound queue and the inbound webhook and nowhere else. It must not reach the glossary, the domain model, or test assertions.

## Settled since approval

Seventeen decisions that write to a table or to history were settled on 2026-08-28,
after this spec was approved. Each is recorded in full in `docs/product-rules.md` and in
the ticket that builds it; this list exists so nothing below is implemented from the
version of the spec that preceded them.

**Suggestion (ticket 04).** The Discipleship Goal is a tiebreaker, ordering candidates
within a tier and never gating one; the reason sentence names the goal only when it
matches. The age band constraint is **directional** — `suggest_max_age_band_gap` is the
number of bands a Participant may be *above* their Leader, default `1`, with no limit
below. ADR-0001 amended.

**Check-in (ticket 08a).** `A` stores `outstanding`, `B` stores `good`, `C` stores
`concern`.

**State (ticket 10).** A relationship-week counts as unanswered when the relationship was
covered by an open sequence and no reply arrived, whether or not its question was reached
— otherwise a silent Leader's later relationships are never asked and never stall.
`Stalled` and `Needs Care` cannot co-occur, asserted in the state matrix rather than
ruled. Concerns live in their own table.

**Follow-up items (ticket 07).** Six kinds — `relationship_unaccepted`, `pause_expired`,
`swap_requested`, `participant_keyword`, `invitation_number_disputed`, `match_declined`.
Nullable `relationship_id` and `person_id` with at least one present; `jsonb` payload
constrained per kind; **every kind dedupes while it stands open, and the history
accumulates** — an Admin sees one thing to act on however many times it was raised, and
the count of raisings survives in the Week-by-Week History rather than in the Care
Needed list; resolution records who and when with no note, and both raising and resolving
append a history event. Care Needed unions three sources: derived states, Concerns, and
follow-up items.

**Ending (ticket 13).** A required `ended_outcome` of `completed` or `discontinued`
alongside the existing required free-text reason.

**Material (ticket 14).** A relationship opens a Material period with a null material at
`accepted_at`, closed by its first real assignment, so the periods genuinely leave no
gaps.

**Roster and consent (ticket 16).** `Opted Out` outranks `Paired`. The Intake form is not
a withdrawal route and refuses a re-submission with SMS consent unticked, naming `STOP`
instead. A consent record must carry its decision so a contact-sharing decline can be
recorded — today only a grant writes a row, and a re-submitted decline silently leaves
the old grant standing.

**Serialization (ticket 20).** A prompt is timed out when a reply can no longer change
anything: 48 hours for a check-in question and a Concern detail request, 24 for a Keyword
Exchange, and never for a message expecting no reply, which opens no hold at all.

**Sign-in (tickets 01, 06, 15).** A phone number and a password, one form, every user.
ADR-0008.
