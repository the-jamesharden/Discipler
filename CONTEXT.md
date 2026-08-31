# Discipler

Discipler's domain is the operation of church discipleship relationships: getting people into the ministry, forming relationships, supporting the weekly rhythm, surfacing care needs, and understanding ministry health over time.

## Language

**Ministry**:
A church or ministry organization using Discipler to operate discipleship relationships. A Ministry is Discipler's tenant boundary: data belonging to one Ministry must never be accessible to another Ministry.
_Avoid_: Tenant, customer account (as model terms; "tenant boundary" remains correct prose for the property itself)

**Ministry isolation**:
The rule that data belonging to one Ministry is never accessible to another. The name for the property the tenant boundary exists to hold.
_Avoid_: Tenant isolation

**Admin**:
The authorized ministry staff member who oversees people, relationships, care needs, materials, and ministry-level insight. Named for the role rather than the office, because not every ministry using Discipler is led by a pastor.
_Avoid_: Pastor (as a model term; it remains correct prose), Super-admin, Coordinator

**Person**:
Anyone on a ministry's roster, whether or not they have completed intake or entered a relationship. Identified within a ministry by name and phone number together, because a number may reach more than one person.

**Leader**:
The person who leads a discipleship relationship, whatever its size.

**Participant**:
A person being discipled within a discipleship relationship.

Leader and Participant are roles held on a relationship, not kinds of person: the same person may lead one relationship and be a participant in another at the same time.

**Mentor** / **Mentee**:
Participant-facing words for the Leader and Participant of a relationship with one participant. They belong in message copy, not in the model.
_Avoid_: Using these as model terms, or introducing Group Leader / Group Participant as separate roles

**Discipleship Relationship**:
The ministry relationship Discipler supports and follows over time: M leaders and N participants. A one-to-one is one leader and one participant; every other shape is a group, and a group may be led by more than one person. There is no separate group concept.
_Avoid_: Pair, pairing record, pairing (as a noun), group (as a distinct entity)

**Intake**:
The process by which a person provides the information and consent needed to enter a ministry.

**Availability Slot**:
One of the thirty-five selectable windows on the intake grid: each day of the week divided into early morning, morning, midday, afternoon, and evening.

**Discipleship Goal**:
The single outcome a participant selects at intake to describe what they are seeking from discipleship. The options offered are the ministry's own.

**Roster**:
The pastor-facing set of people in a ministry and their current participation status.

**Suggested Pair**:
A recommendation that a particular mentor and mentee may be a good one-to-one pairing. Suggested pairs are never produced for groups.
_Avoid_: Match, assignment, pairing

**Relationship Kind**:
Whether a discipleship relationship was formed as a one-to-one or as a group. Declared when the relationship is created and immutable afterwards. It is a capacity declaration that exists so the participation caps and the Gender Rule can be enforced in the database; it is never read by message copy or by state derivation, both of which follow the live participant count.
_Avoid_: Treating kind as a second entity, or as the answer to "is this a group"

**Eligible to Lead**:
The per-person flag by which an Admin marks someone as suitable to lead a relationship. It is independent of whether they have an account and of whether they currently lead anything, and it is the same field as the intended role an Admin sets before intake.

**Age Band Gap**:
The number of age bands a participant may be *above* their leader in a suggestion. A ministry setting with a direction: there is no limit below, because an older person discipling a younger one is the ordinary case.
_Avoid_: Age gap, age difference — both read as symmetric

**Pairing Constraint**:
A hard eligibility rule that removes a combination from suggestion entirely. Constraints govern suggestion only and a ministry may always pair manually across them — with one exception, the Gender Rule, which also binds pairing.

**Gender Rule**:
A one-to-one relationship is between two people of the same gender, and a group that declares a gender holds only people of that gender. A group declared mixed is unconstrained. A safeguarding rule rather than a suggestion preference: it is enforced in the database and manual pairing cannot cross it.
_Avoid_: "gender does not apply to groups" — it applies to any relationship that declared a gender

**Pair**:
Verb only. The pastor's act of placing people into a discipleship relationship.
_Avoid_: Using "pair" or "pairing" as a noun for the relationship

**Leader Dashboard**:
The leader-facing web surface, entered by phone number and password. One-time codes are a post-launch addition. It carries the availability overlay, assigned materials, and the contact details of the people in the relationship.

**Availability Overlay**:
A single grid on which the availability slots of everyone in a discipleship relationship are drawn together, so a leader can see where meeting times coincide.

**Material**:
A discipleship resource a relationship works through, such as a book of the Bible or a published discipleship manual.
_Avoid_: Program, curriculum

**Material Assignment**:
The period during which a relationship was working through a particular material. Assigned to the relationship, never to a person: a leader in two relationships may be working through two different things. Periods never overlap and never leave gaps, so a relationship's first period runs from acceptance with no material assigned.
_Avoid_: Assigning a material to a person

**Check-In Rhythm**:
Discipler's recurring text-message rhythm for gathering information about whether discipleship meetings are happening and how they are going.
_Avoid_: Twilio Rhythm (Twilio is a delivery vendor, not a domain concept)

**Welcome Message**:
The message a person receives on completing intake, before any relationship exists.

**Starter Message**:
The message that opens a discipleship relationship, sent once, when it becomes active. A Participant's names the Leader who will reach out to them; a Leader's names the Participants they are now meeting with. It always carries the ministry's required opt-out and rate disclosure language. It never carries anyone's phone number.
_Avoid_: sending it again on resume (that is the Resume Message)

**Resume Message**:
The message sent to everyone in a relationship when an Admin resumes it from a Pause, each side named the other side. It carries the ministry's opt-out and rate disclosure language. A Pause running out releases nothing.
_Avoid_: Starter Message (its words are true on the day a match is made, not after a fortnight away)

**Invitation Link**:
The individualized, SMS-delivered link that reveals a new relationship to a person in it, with no session. Only a Leader is ever sent one. It resolves on its own page rather than in the leader dashboard, because a leader has no account until they accept. Possession of the phone it was sent to is the authentication; it expires after a fixed window and is consumed when the leader creates their account, not when it is opened.
_Avoid_: a Participant's link (a Participant answers at Intake and is asked nothing further)

**Response-Required Message**:
A message in the Check-In Rhythm that expects a reply from its recipient.

**Outstanding Reply**:
A Response-Required Message that has been sent and whose reply has not yet arrived. At most one is outstanding per phone number at a time, because a number holds one conversation however many people are reachable on it; a later message to the same number takes ownership of the next reply and supersedes the one before it. It resolves as answered, superseded, or timed out after twenty-four hours.
_Avoid_: prompt. The database columns predate this entry and spell it `prompt_key` and `prompt_state`; they mean this and are not to be read as a Keyword Exchange.

**Meeting Response**:
A recorded answer to a meeting-related question in the Check-In Rhythm, held against the question it answers and the person who sent it. Only leaders are asked today, so only leaders answer; a response is never keyed to the relationship alone, because a ministry may later ask participants too and a relationship is not assumed to have one respondent.

**Satisfaction**:
How a leader reported a meeting that happened: outstanding, good, or concern. The stored value is the word, never the letter the message offered — a token could be renumbered, and a pilot's recorded history cannot be.

**Relationship State**:
Discipler's current interpretation of how a discipleship relationship is doing based on its recorded ministry history. One of: Awaiting Leader Acceptance, Healthy, Stalled, Needs Care, Paused, Ended. A relationship holds exactly one state at a time.
_Avoid_: Pairing status, Pending

**Healthy**:
The state of an accepted relationship that nothing in its history says otherwise about. The default, not an achievement.

**Stalled**:
The state of a relationship whose leader has gone silent, or who is answering to say no meeting is happening. It clears automatically on any answered check-in, which is why it is a derived state and never a Follow-Up Item.

**Needs Care**:
The state of a relationship carrying an unresolved concern raised this week. It lasts that week; the concern badge outlives it.

**Awaiting Leader Acceptance**:
The state of a relationship an admin has created that not all of its leaders have accepted. The relationship exists and is visible to the admin; every leader has been sent an Invitation Link, it sends nothing to participants, and it accrues no silence against anyone.

**Acceptance**:
One leader's act of taking responsibility for a relationship, performed on their Invitation Link's page after seeing who they have been matched with. It is the timestamped record that *that* leader agreed, held on their membership. The relationship activates when every open leader membership carries one, because nobody co-leads something they did not agree to.

**Paused**:
The state of a relationship that its leader has paused for a selected period. Check-ins for that relationship are suppressed for the duration, membership is unchanged, and nobody returns to the roster as available. The relationship stays visible and visibly marked as paused on both the leader's list of relationships and the admin dashboard. Paused masks the relationship's underlying derived state rather than replacing the history behind it; on resume, that derived state resurfaces.

**Ended**:
The terminal state of a relationship that has finished. It records an outcome — completed or discontinued — alongside the reason in the ministry's own words, because whether a relationship finished well or broke down is a question the ministry asks in counts. Its history is preserved untouched, and its participants return to the roster as Ready to Pair unless they have opted out or hold another open participant membership.

**Departure**:
One participant leaving a discipleship relationship that continues without them. Their membership receives an end date rather than being deleted, so the weeks they were present for stay attached to the relationship, and a readmission later is a second membership rather than the first one reopened. A relationship losing its leader or its last participant is not a departure but an ending, because it records an outcome.
_Avoid_: Removal, unpairing, dropping out

**Keyword Exchange**:
The short SMS conversation Discipler opens when an inbound keyword needs something resolved before it can act — which relationship it applies to, or how long a pause should run. At most one is open per person at a time, and it expires after twenty-four hours without a reminder.
_Avoid_: Menu, prompt (as model terms). "Prompt" is doubly unhelpful here: it is a model term, and where it does appear in the schema it names an Outstanding Reply, which is a different thing.

**Silence Gap**:
Thirty rolling days since Discipler last sent a person a message, measured per person per ministry. It is the trigger for the compliance identification prefix and for re-sending opt-out language to a participant.

**Check-In Sequence**:
The single conversation in which a leader answers for every relationship they lead, one after another, in one thread on one day. Relationships are asked about earliest-started first, and the shape of the conversation is fixed when it opens. It advances on a reply, or when a question it asked has been reminded once and still gone unanswered; at most one runs against a leader at a time. A relationship awaiting leader acceptance or paused is not covered by it and accrues no silence.

**Clarification**:
What Discipler sends when it cannot read a reply: the valid replies to the question that is open, said again. At most two per question, after which Discipler stops re-prompting but keeps listening — the question stays open and a valid reply is still accepted until the sequence advances past it. The cap is on what Discipler says, never on what a leader may send.
_Avoid_: Retry, error message

**Participation Status**:
A person-level status describing whether someone is being discipled, independent of how any one relationship is doing. One of: No Intake Submitted, Ready to Pair, Paired, Opted Out. Paired means holding at least one open participant membership; leading a relationship never sets it.

**Consent Record**:
The timestamped, versioned record of what a person agreed to at intake. Discipler shares a phone number only where the consent record permits it.

**Swap**:
A leader's request to be released from a specific discipleship relationship and matched with a different participant. From a relationship the leader has not yet accepted, it reads as a decline. A swap is a recorded request awaiting admin action. It is never itself a change of relationship state, and the relationship remains intact until an admin resolves it.

**Care Needed**:
The pastor-facing view of people or relationships that currently require pastoral attention. It gathers three things: open Follow-Up Items, relationships whose derived state asks for attention, and unresolved concerns.
_Avoid_: Failure queue

**Follow-Up Item**:
A condition on a relationship or person that requires admin review, gathered in the Care Needed view. A follow-up item is never cleared by the event that raised it and never clears itself; it persists until an admin acts on it.

**Concern**:
A qualitative issue raised through the discipleship check-in process for pastoral awareness or follow-up. A concern persists until an admin resolves it, independently of how the relationship is currently doing. It is a badge on the relationship, never a state of it.

**Concern Aggregation**:
A ministry-level summary of recurring concern themes across multiple individual concerns.

**Week-by-Week History**:
The chronological record of ministry activity associated with a discipleship relationship over time.

**Ministry Intelligence**:
Longer-term ministry insight derived from the ministry's historical activity and participant context.

**Ministry Timezone**:
The single clock a Ministry's data is interpreted against. Availability blocks, the Check-In Cadence, the week boundary behind the care counters, and the monthly opt-out rule all resolve against it. A property of the Ministry, never of a Person.

**Nudge**:
The action that reveals a Participant's contact details on a Follow-Up Item so an Admin can reach them directly. It sends nothing. Discipler says who needs a call; the Admin makes it.

**Check-In Cadence**:
The day of week and hour at which a Ministry's Check-In Sequences are sent, resolved against the Ministry Timezone and bounded to 8am–9pm local. A Ministry setting, not a product constant: a church small group meets Sunday and is asked Monday morning, while campus discipleship happens midweek and is asked Thursday evening.
_Avoid_: Schedule, cron time

**Week**:
The ISO week in the Ministry Timezone. Defined independently of the Check-In Cadence, so that moving the cadence cannot produce one week carrying two check-ins and another carrying none.

**Ministry Language**:
The nouns a Ministry uses for the two roles in a relationship, applied to every message it sends. Wording a Ministry owns, in the same way it owns its Discipleship Goal options; the structure of a message is not.
