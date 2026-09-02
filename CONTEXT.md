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
The authorized ministry staff member who oversees people, relationships, care needs, materials, and ministry-level insight. Named for the role rather than the office, because not every ministry using Discipler is led by a pastor. An Admin is a Person in their own Ministry, on its roster and holding one login like anybody else; Admin is an access tier they hold, not a second kind of human — see `docs/adr/0009-one-account-per-human.md`.
_Avoid_: Pastor (as a model term; it remains correct prose), Super-admin, Coordinator

**Person**:
Anyone on a ministry's roster, whether or not they have completed intake or entered a relationship. Identified within a ministry by name and phone number together, because a number may reach more than one person.

**Leader**:
The person who leads a discipleship relationship, whatever its size.

**Participant**:
A person being discipled within a discipleship relationship.

Leader and Participant are roles held on a relationship, not kinds of person: the same person may lead one relationship and be a participant in another at the same time.

**Mentor** / **Mentee**:
Participant-facing words for the Leader and Participant of a relationship with one participant. They belong in message copy, and in the one place the model has adopted them: they are the two values of a Declared Side, which is what a person said they were offering before any relationship existed. They are never roles held on a relationship — those are Leader and Participant.
_Avoid_: Using these as names for relationship roles, or introducing Group Leader / Group Participant as separate roles

**Discipleship Relationship**:
The ministry relationship Discipler supports and follows over time: M leaders and N participants. A one-to-one is one leader and one participant; every other shape is a group, and a group may be led by more than one person. There is no separate group concept.
_Avoid_: Pair, pairing record, pairing (as a noun), group (as a distinct entity)

**Intake**:
The process by which a person provides the information and consent needed to enter a ministry.

**Availability Slot**:
One of the eighty-four selectable windows on the intake grid: each day of the week divided into one-hour slots from 8am to 8pm. See `docs/adr/0018-the-hourly-grid.md`.

**Discipleship Goal**:
The single outcome a participant selects at intake to describe what they are seeking from discipleship. The options offered are the ministry's own. An option is a row and answers point at it, so rewording one is not asking a new question; removing one blanks the answers that pointed at it, taking a stated goal off every live surface. ADR-0014 records why that is allowed and how the record survives it: the blanked answers are written into the removal event before the delete runs.

**Chosen By**:
How many people's *current* intake answer points at a particular Discipleship Goal option. People and not submissions: intake is append-only and re-submittable, so somebody who has since changed their answer counts only against the option they now hold. It is what an admin is warned with before removing an option, and the number the removal writes into history — where it becomes the only surviving record of what was lost. One definition, in `public.discipleship_goal_options`, is read by both the settings surface that warns and the command boundary that records, so the two cannot disagree.
_Avoid_: Answer count, submission count, usage, popularity

**Roster**:
The pastor-facing set of people in a ministry and their current participation status.

**Held Import Row**:
A spreadsheet row an import would not file because the number on it is already on the roster under a different name. It is kept, not dropped: the row waits on the roster until an admin says whether it is the same person written differently or somebody else sharing the phone, and it keeps their answer afterwards. Only that one ambiguity is held — the other reasons a row is refused are a spreadsheet to fix, not a question anybody can answer. ADR-0005 is why both readings are real.
_Avoid_: Calling it an import error, or a merge

**Suggested Pair**:
A recommendation that a particular mentor and mentee may be a good one-to-one pairing. Suggested pairs are never produced for groups.
_Avoid_: Match, assignment, pairing

**Relationship Kind**:
Whether a discipleship relationship was formed as a one-to-one or as a group. Declared when the relationship is created and immutable afterwards. It is a capacity declaration that exists so the participation caps and the two-person half of the Gender Rule can be enforced in the database; it is never read by message copy or by state derivation, both of which follow the live participant count. Which code may read it is ADR-0004's to say.
_Avoid_: Treating kind as a second entity, or as the answer to "is this a group"

**Eligible to Lead**:
The per-person flag by which an Admin marks someone as suitable to lead a relationship. It is independent of whether they have an account and of whether they currently lead anything, and it is the same field as the intended role an Admin sets before intake.

**Age Band Gap**:
The number of age bands a participant may be *above* their leader in a suggestion. A ministry setting with a direction: there is no limit below, because an older person discipling a younger one is the ordinary case.
_Avoid_: Age gap, age difference — both read as symmetric

**Pairing Constraint**:
A hard eligibility rule that removes a combination from suggestion entirely. Constraints govern suggestion only and a ministry may always pair manually across them — with one exception, the Gender Rule, which also binds pairing.

**Gender Rule**:
A one-to-one relationship is between two people of the same gender, and a relationship that declared a gender holds only people of that gender. A relationship that declared none is unconstrained by the second half. A safeguarding rule rather than a suggestion preference: it is enforced in the database and manual pairing cannot cross it.
_Avoid_: "gender does not apply to groups" — it applies to any relationship that declared a gender

**Declared Gender**:
What a relationship says it is for — men, women, or nobody in particular — stated by an Admin when it is created and immutable afterwards. It is what the Gender Rule binds a group by, and it is asked rather than derived: the people currently in a group cannot say *this is a women's group that has one member so far*. A one-to-one is not asked, because its two people already answer it.
_Avoid_: Reading an undeclared relationship as "not yet decided" — it declares nothing, which is a settled answer

**Group Name**:
What a Ministry calls a group, typed by an Admin when forming it and editable from the Roster afterwards. A label, not a ministry event: renaming overwrites no history. It is what the group Intake link offers and what the weekly check-in asks about; an unnamed group is on no link and is asked about by listing its people. A one-to-one has none.
_Avoid_: Naming a one-to-one, or reading an unnamed group as broken -- it predates the name

**Group Intake Link**:
The Ministry's original Intake link, `/intake/<ministry>`, which since ticket 29 opens the form for somebody who wants to join one of the Ministry's groups. It asks gender and age band, when they could meet, and which group, and never the Discipleship Goal. The discipleship wizard is the other link.
_Avoid_: "the Intake link" without saying which

**Join Approval**:
A per-group switch an Admin sets when forming a group or from the Roster afterwards. Off, a Person who picks the group on the Group Intake Link is in it when they submit; on, their submission raises a Join Request and an Admin admits them. Off by default, and not a safety binding -- the Gender Rule holds on a join either way -- so it is editable. See `docs/adr/0017-picking-a-group-joins-it.md`.
_Avoid_: Approval as the default, or as a Ministry-wide setting

**Join Request**:
The Follow-Up Item raised when a Person picks a group whose Join Approval is on. It carries the Person and the group, stands once however many times they ask, and closes only when an Admin admits them -- which adds them to the group in the same act -- or resolves it alone. Nothing is sent to the Person either way.
_Avoid_: Application, waitlist

**Pair**:
Verb only. The pastor's act of placing people into a discipleship relationship.
_Avoid_: Using "pair" or "pairing" as a noun for the relationship

**Leader Dashboard**:
The leader-facing web surface, entered by phone number and password. One-time codes are a post-launch addition. It carries the availability overlay, assigned materials, and the contact details of the people in the relationship.

**Availability Overlay**:
A single grid on which the availability slots of everyone in a discipleship relationship are drawn together, so a leader can see where meeting times coincide.

**Material**:
A discipleship resource a relationship works through, such as a book of the Bible or a published discipleship manual. Each is a Ministry's own writing, a document it holds, or both. The list of them belongs to the Ministry, in the same way its Discipleship Goal options do.
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

**Password Reset**:
An Admin setting a new password on somebody else's account, for a person who has lost theirs. Discipler chooses the password, shows it once on screen and sends it nowhere: the Admin reads it out, which is why a reset only works when the two of them can talk. Setting it ends every session on that account — `docs/adr/0016-a-password-change-ends-every-session.md` records why that is a rule and not a behaviour. It is always somebody else's: an Admin holds a session already, so their own is not a recovery.
_Avoid_: Forgotten password and password recovery (recovery is not self-serve; one-time codes to the number are the post-launch recovery, per ADR-0008, and a person who still holds a session makes a Password Change instead), and Temporary password (nothing expires it or forces a change)

**Password Change**:
A person setting a new password on their own account, from a session they already hold, having proved the current one. It is the self-service half of what Password Reset is the assisted half of: reachable by anybody with a session, whether or not a Ministry still holds them, and never on somebody else's behalf. Like a reset it ends every session on the account, the one that asked included, so the person signs in again with what they chose. Nothing is recorded, because the reset event exists to say that somebody else touched the credential.
_Avoid_: Account settings and profile (nothing else about the person is editable here), and Sign out (ending the sessions is a consequence of the change, not a feature of its own)

**Invitation Link**:
The individualized, SMS-delivered link that reveals a new relationship to a person in it, with no session. Only a Leader is ever sent one. It resolves on its own page rather than in the leader dashboard, because a leader has no account until they accept. Possession of the phone it was sent to is the authentication; it expires after a fixed window and is consumed when the leader creates their account, not when it is opened.
_Avoid_: a Participant's Invitation Link (a Participant answers at Intake and is asked nothing further). The Intake Link below is not one: it asks a Person nothing new and reveals nobody else to them.

**Intake Link**:
The link an Admin hands one Person so they can reopen their own intake form, prefilled, and correct what it says. It is the only route by which a Participant's availability changes: there is no participant dashboard and no SMS path for it. The Admin is shown the link and passes it on themselves — Discipler never texts it, because the commonest reason to reopen somebody's intake is that the number on file is wrong. Possession of it is the authentication, as with an Invitation Link, and it expires after a fixed window. One live link per person: asking for it again gives back the one they hold, and a new one is minted only once that has run out. It is never consumed — correcting a number today and availability next week is the thing it exists for.
_Avoid_: an account (nothing about it gives anyone one), and the Intake form as a withdrawal route (that is `STOP`)

**Ministry Intake Link**:
An intake link a whole ministry hands out. It names the ministry, carries no token, and is both the link a pastor sends and the link its QR code opens — so it is printable in a way the Intake Link above is not. It does not know who opened it, which is why the form asks. The two routes to it are the same link and differ only in whether it was scanned; which route somebody came by is kept on their consent record, because that is the question a compliance review asks. A ministry has more than one: the original link, and the Discipleship Intake Wizard below, each with its own QR code.
_Avoid_: calling it the Intake Link (that one is a single person's, prefilled, and expires), and treating a QR code as a second form (each one opens its own link, saying it was scanned)

**Discipleship Intake Wizard**:
The second form a Ministry hands out, on its own Ministry Intake Link and its own QR code, beside the original one. It asks the same things the single-page form asks, one screen at a time, and it asks one thing first that the other form never asks: which side of a discipleship relationship this Person is offering to stand on. Nothing is written until the last screen submits, so an abandoned wizard leaves no Person, no submission and no consent record.
_Avoid_: calling it a mentor link and a mentee link (there is one link and the side is an answer inside it), and a separate form (the questions are the same ones, in the same words, asked over more screens)

**Declared Side**:
Mentor or Mentee, as a Person answered it on the Discipleship Intake Wizard. It is a preference they stated and never a decision anybody made about them: it shows on their roster row and it does not make them Eligible to Lead, which remains a plan an Admin records. It is read back from their latest intake that asked, so answering the other side later changes what their row says, and a form that asked nothing changes nothing.
_Avoid_: a role (that is Leader or Participant, decided at pairing), Eligible to Lead (an Admin's plan, never self-declared), and treating an unanswered side as a refusal to offer

**First-Time Answer**:
Whether a person said this is their first time — being discipled, or mentoring, whichever Declared Side they offered. The question is worded from the side, and the answer is carried as two words rather than as yes and no, because the form words them as statements and a `yes` meaning *first time* reads backwards. It is read on the pairing screen, per candidate, and nowhere else: it ranks nobody and refuses nobody.
_Avoid_: a suggestion input (ADR-0001 fixes those, and this is not one of them), a filter on the candidate list, and reading an unanswered one as *no*

**Intake Path**:
Which form a Person was answering, kept on their consent record beside the route they arrived by. The two are separate questions: the path says *which form*, and the route says *a link a pastor sent or a QR code they scanned*.
_Avoid_: folding either into the other, and reading an absent path as anything but *the form did not ask*

**Response-Required Message**:
A message in the Check-In Rhythm that expects a reply from its recipient.

**Outstanding Reply**:
A Response-Required Message that has been sent and whose reply has not yet arrived. At most one is outstanding per phone number at a time, because a number holds one conversation however many people are reachable on it; a later message to the same number takes ownership of the next reply and supersedes the one before it. It resolves as answered, superseded, or timed out; how long it waits before timing out depends on the kind of message that opened it, and `docs/check-in-rhythm.md` holds the windows. A message expecting no reply is never outstanding and never makes a number busy.
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
A request to be released from a specific discipleship relationship and matched with somebody different. Either side may make one: a leader asking for a different participant, or a participant asking for a different leader — the recorded request says which side asked, because an admin acts differently on each. From a relationship the leader has not yet accepted, it reads as a decline. A swap is a recorded request awaiting admin action. It is never itself a change of relationship state, and the relationship remains intact until an admin resolves it.

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
The single clock a Ministry's data is interpreted against. Availability slots, the Check-In Cadence, the week boundary behind the care counters, and the monthly opt-out rule all resolve against it. A property of the Ministry, never of a Person.

**Nudge**:
The action that reveals a Participant's contact details on a Follow-Up Item so an Admin can reach them directly. It sends nothing. Discipler says who needs a call; the Admin makes it.

**Check-In Cadence**:
The day of week and hour at which a Ministry's Check-In Sequences are sent, resolved against the Ministry Timezone and bounded to 8am–9pm local. A Ministry setting, not a product constant: a church small group meets Sunday and is asked Monday morning, while campus discipleship happens midweek and is asked Thursday evening.
_Avoid_: Schedule, cron time

**Week**:
The ISO week in the Ministry Timezone. Defined independently of the Check-In Cadence, so that moving the cadence cannot produce one week carrying two check-ins and another carrying none.

**Ministry Language**:
The nouns a Ministry uses for the two roles in a relationship, carried into every message that names a role. Wording a Ministry owns, in the same way it owns its Discipleship Goal options; the structure of a message is not. ADR-0015 records the two rules the wording has to obey — the word sits in noun position and names the reader's own role — and why a word a Ministry typed can be neither conjugated nor pluralised on its behalf.

**Sending Name**:
The name a Ministry's messages read as, distinct from both the display name an Admin sees on their own screens and the number the messages are sent from. Unset means *speak as the display name*.
