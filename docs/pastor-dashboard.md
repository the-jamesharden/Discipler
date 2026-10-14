# Discipler — The Pastor Dashboard

This is the working product description of the pastor-facing dashboard. It is a product model, not an implementation specification. Items marked **OPEN** are unresolved and must not be implemented by inference.

## Shape

The pastor dashboard is a single web application with six tabs: **Overview**, **Check-Ins**, **Suggested Pairs**, **Follow-Up**, **Materials**, and **Roster**. Every number it shows is derived from the same week-by-week history that drives relationship state and Ministry Intelligence; the dashboard maintains no separate truth of its own.

## Overview

The Overview tab answers "how is the ministry doing right now" without the pastor having to open anything else. It shows the total number of active discipleship relationships, the meeting rate derived from check-in responses, the response completion rate, the number of check-ins completed this week, and the number of items flagged for follow-up this week - where that follow-up count combines stalled relationships, relationships carrying an unresolved concern, relationships whose pause has expired, and relationships carrying an open swap request. Two pie charts sit alongside these figures: a **Meeting Completion** chart showing the ratio of meetings completed to meetings missed, and a **Check-In Ratings** chart showing the distribution of A (outstanding), B (good), C (okay), and D (concern) responses. A **Quick Stats** panel repeats the headline figures in compact form: total relationships including groups, response completion rate, meeting rate, quality rate (A and B responses over every rated response, so C okay counts against it as well as D), and total active relationships. Below the charts, the Overview lists every active and paused relationship and group; a paused one is listed in place and visibly marked `Paused` so the pastor can tell it apart from an active, stalled, or ended relationship. A paused relationship is listed but not counted among the active relationships, on the same principle that takes an ended one out of the active counts. Those carrying a concern are flagged in place and can be opened directly to reveal the full name and phone number of the people involved.

Pressing a one-to-one or a 1:2 pair opens the **pair card** over the Overview, and the address says which card is open, so a refresh keeps it and closing it returns to the Overview.
Its head says the shape and since when, both names and the state.
The two people sit side by side, the Discipler on the left and the Disciple on the right, each with their role in this pair, their phone with Call and Text, their email, their age band and their goal; contact details reach the card only for someone who currently agrees to share them, the rule Nudge reads (ADR-0010), and a missing one is left out rather than announced.
Beneath them are the last check-in answer and its date and the material running now.
Whatever needs the pastor sits in a band straight under the names: an unresolved concern with its words, who raised it and **Resolve**; a stall with the condition that fired and how long it has held; an expired pause with **Resume**.
The concern's words show as the card opens and the reading is recorded (see *Check-Ins*).
**End relationship** is a quiet link at the foot that opens the usual outcome and reason step.
The card sends nothing.
Pressing a group opens the same card in its group form.
Its head says *Group*, the gender the group declared (women, men or mixed) and since when it was formed, its name and its state.
The leader is shown in full, as a person is on a pair, with the role Discipler, and a co-leader beneath them.
Under *Disciples · N* each Disciple is a row with their name and phone, and pressing the row opens their Call and Text links, email, age band and goal, without script.
The band, the facts and **End relationship** are the pair card's, and so is the consent rule on the contact details.
Who is in a group is still changed on the Roster, not on the card.

Each relationship card is coloured by what it needs.
**Green** is healthy, the default.
**Yellow** is stalled.
**Red** is a relationship carrying an unresolved concern, for as long as the concern stays unresolved and not only the week it was raised: Needs Care lasts the week, and the red lasts until an Admin resolves the concern.
Red wins over yellow when a stalled relationship also carries an unresolved concern, and over grey when a paused one does, because a pause resolves nothing.
**Grey** is inactive: paused or awaiting acceptance, and each keeps its own label.
Every colour is backed by words on the card, the state's pill (`Healthy`, `Stalled`, `Needs care`, `Paused`, `Awaiting acceptance`) and the flag line (`Concern`), so the meaning never rests on colour alone; a card that is red only for its concern drops the `Healthy` pill rather than show a green word on a red card.

Two metrics carry the operational picture and must not be conflated: **Response Rate** is check-ins answered divided by check-ins sent, and **Meeting Rate** is meetings held divided by check-ins answered. A ministry can have a high response rate and a poor meeting rate; collapsing them hides exactly the problem the product exists to surface. On the Check-In Ratings chart, A renders green, B light green, C yellow, and D red, with a legend naming all four. The ratings were three, with C for concern, until 2026-10-12; they became four so there is no middle answer to default to, and `docs/product-rules.md`, *What the Satisfaction Tokens Store*, says why three must not come back. Quick Stats is a panel inside Overview, not a separate tab.

The rates, both charts and the rate rows in Quick Stats cover last week, and each of them says *last week* on the screen.
Last week is the last finished week: the most recent Week before the current one, in the Ministry Timezone, whose Check-In Sequences have all closed or opened 48 hours ago.
Not the current week, because it reads 0% until the Check-In Cadence comes round and then climbs as answers arrive.
Nor simply the Week before the current one, because a check-in belongs to the Week its Check-In Sequence opened in, and the sequence stays open while answers can still come: a Ministry checking in on a Sunday would see that Week read 0% on Monday and climb in just the same way.
A sequence is closed once it is answered through or abandoned, whether given up on after its reminder, displaced by the next Week's, ended by `STOP` or emptied by a Pause.
So while any sequence of the Week before is still open, the figures cover the Week before that, and they hold still from the moment a Week finishes until the next one does, whatever day the cadence falls on.
The wait is at most 48 hours from the moment the Week's check-in went out, one question's reminder and give-up (`REMINDER_AFTER_HOURS` twice), because a Leader who answers nothing is passed over one relationship at a time and can keep a sequence open until the next Week's displaces it.
A Ministry checking in on Sundays at 4pm therefore reads the Week just gone by Tuesday at 4pm at the latest, and an answer that arrives after that may still move its figures.
A Week in which nobody was asked, a brand-new Ministry's or one where every relationship was paused, is finished and reads as having no check-ins, rather than reaching back to an earlier Week under the words *last week*.
When a chart has nothing to draw it says why: *No check-ins last week* when none were sent, and otherwise *Nothing answered last week* on Meeting Completion and *Nothing rated last week* on Check-In Ratings.
The check-ins completed this week, the follow-up count and the relationship counts are the current figures.

Under the two charts and Quick Stats, full width and short so it reads as a secondary panel, a green line shows **growth in discipleship** over time.
A dropdown picks what it counts, and it opens on **Total discipled**: everybody being discipled, counted once even when they are in a pair and a group.
**People in mentorship** counts the Disciples in one-to-ones and 1:2 pairs, and **People in groups** the Disciples in Groups.
All three count Disciples only, each person once, and never a Discipler for leading, though a Discipler who is discipled somewhere else is counted there.
A pair is told from a Group as the cards tell them apart, by the Group's name and who is in it then, never by the relationship's kind.
A relationship counts from when it was accepted until it ended, a person from when they joined it until they left, and a paused relationship counts in none of the three for as long as its Pause stands.
A toggle on the chart switches it between the last 12 weeks and every month since the Ministry opened; nothing else on the Overview changes with it.
The last point is the live count now, and every earlier point is the count at the end of that week or month in the Ministry Timezone.
Every point is derived from the stored history of relationships, memberships, Pauses and Resumes, so a relationship ended or paused last month shows as it stood then.
A week or month before the Ministry opened is drawn as nothing rather than as zero, so a young Ministry's line starts part way across, and a Ministry younger than a week or a month shows the one point it has, now, and says it opened this week or this month.
The months view is a year across at the least, so a few months sit at the right as a few weeks do.
Above the line are the number now and the change across the chart, such as *+13 in 12 weeks*.
The dropdown is a menu of links and the toggle two links, so both work without script, and what is picked is in the address (`?growth=` and `?by=`).
Like the donuts it is drawn on the server, with no chart library.

## Check-Ins

The Check-Ins tab is the week's raw operational picture.
It shows how many check-ins have been completed, how many are still pending, and how many concerns are still open, then the completed responses in four columns, A (outstanding), B (good), C (okay), and D (concern), each heading coloured as its slice of the Overview's Check-In Ratings chart.
There is no summary strip above them.
Every column lists the relationships behind it by name, with the date answered, D included: a D whose concern is still unresolved is marked red, and its words are never on the list.
This replaces a sealed D column that showed only a count and the way to Follow-Up (James, 2026-10-12, Pastor feedback ticket 09).
Pressing any relationship in any column opens the same pair card the Overview opens, or its group form for a group, over Check-Ins; the address says which card is open, and closing it returns to the row it came from.
On Check-Ins the card opens with this week's answer and when it came in its first band, in the Ministry's timezone (*This week · Met · B good · answered 9:07am*), coloured as its letter's column; the Last check-in fact, which would say the same answer again, is left out.
Where this week's answer raised a concern that is still unresolved, that band is the concern's, its words under the week's line, with **Resolve**; a concern from an earlier week that is still unresolved keeps its own band beneath it.
Resolving from the card clears the concern on Check-Ins and on Follow-Up alike, and the card says so where the pastor is; ending the relationship from the card says so at the top of Check-Ins.
Concerns are never presented as a browsable list, never exported, and never quoted in a report — an admin reading "four concerns this week" opens each relationship's card to see what was said.
Raw concern text is the most sensitive data in the product, so its words show in one place only: the pair card of the relationship it is about, which shows them as it opens.
Opening the card is the read, and it is recorded exactly as the retired `Read the concern` button recorded it, one viewing per concern; a line under the concern on the card says who read it and when.
This reverses an earlier rule, that reading a concern took a deliberate extra click past the list as friction (James, 2026-10-12, Pastor feedback ticket 07).
The friction that stays is everything else above: no list of the words, no export, no report, and the words never on the Overview grid, the Check-Ins columns or the Follow-Up list.

Resolving a concern clears its text, and nothing offers to keep it. A ministry should not accumulate a permanent file of people's worst weeks — not by never deciding to, and not by deciding to either.

## Suggested Pairs

The Suggested Pairs tab lists candidate one-to-one relationships ranked strongest first, each rated on a four-star scale and each accompanied by a card stating its reason in plain language — for example, "four shared time slots; you both selected Career and calling." Suggestions are produced only for one-to-one relationships; groups are always formed manually by the pastor. Ministry-configured pairing constraints remove ineligible combinations before ranking rather than penalizing them within it.

At the bottom of the tab, below every ranked suggestion, a **No Schedule Overlap** section names each person who shares no availability with any eligible leader. They are listed for visibility, never presented as a fit, and can be paired manually from the same row.

A leader is not suggested for a participant if the leader is more than ten years younger. That constraint governs suggestion only — an admin may pair any two eligible people manually regardless of age difference.

Suggestions carry visible tier labels — Excellent fit, Good fit, Recommended — and no numeric score. See `docs/adr/0001-pairing-suggestion-inputs.md`.

## Follow-Up

The Follow-Up tab is the Care Needed view. It gathers every relationship and person currently needing admin attention in one place, so nothing depends on an admin noticing it elsewhere. Four conditions put an item here:

1. **Stalled** — gone silent for two weeks, or reporting three weeks of not meeting. The item names which condition fired and reports how long it has held, in the unit that matches the reason: gone silent reports days since last contact, responding-not-meeting reports weeks reported as no meeting. The two cannot share a counter — days since last contact is already fourteen or more when silence fires and roughly seven when not-meeting fires, so one number would make a relationship going nowhere for three weeks read as more recent than one silent for a fortnight.
2. **Unresolved concern** — a concern raised and not yet resolved.
3. **Expired pause** — the selected pause period has elapsed. The item shows that the relationship was paused, which period was selected, that it has expired, and that the relationship has not resumed. The relationship is still `Paused`; expiry changes no state and resumes nothing.
4. **Open swap request** — the leader has asked to be matched with a different participant. The item shows which leader asked, which relationship the request concerns, and that the leader wants a different participant. The relationship remains intact and holds its existing state while it waits.

The last two are review conditions, not care flags. A pause and a swap request are ordinary things a leader may need, and `docs/non-goals.md` is explicit that neither is wrongdoing.

No follow-up item clears itself. An expired pause is not resolved by expiring, and a swap request is not resolved by being recorded; each waits for an admin to act.

Each item on the list is one button: its tag, the names, one line of reason, how long it has held, and an arrow, with nothing else to press.
A concern's words are never on the list.
Pressing an item opens the relationship's card over the list, the same pair card or group card the Overview opens, in a fuller form: every open item on that relationship sits in a band under the names with the actions it offers, and a **What has happened** list sits under the facts.
So a pair carrying a concern, a stall and a swap request is one card with three bands, whichever of the three was pressed.
An item about a person with no live relationship (*Wants a group*, *Texted a keyword*, *Pair not made*) opens a card of its own: the item in its band, the person as the pair card draws a person, and what has happened.
Ending a relationship resolves none of its concerns, so a concern on an ended relationship stays on the list, named by who raised it, and opens a card of its own too: each concern's band with its words and **Resolve**, who has read them, and what has happened, with no people, facts or **End relationship**, because the pair is over.
This is James's decision of 2026-10-12, Pastor feedback ticket 10; until then every item carried its own row of buttons.

**What has happened** lists, newest first and read from the stored history alone: when each item was raised and why, a stall dated by the week that crossed its threshold; the check-ins that led to it, which are the very weeks the stall was derived from and the week a concern was answered D; who read the concern, and when; and the earlier follow-up items and concerns for the pair, and who resolved them.
The words of an earlier, resolved concern never appear, because resolving cleared them.
Who opened the contact details is not listed: opening the card records nothing, as Nudge recorded nothing, so there is no stored fact to list.

Four actions live in the card.
**Nudge** is opening the card itself: the contact details of the people on it reach it through the consent check, and it sends nothing.
**Resolve** sits in each item's band and clears the item; on a swap request it records that the admin reviewed the request and left the relationship in place; on a concern it is **Resolve and clear this text**, which clears the words.
**Resume relationship** sits in an expired pause's band while the relationship is still paused; it lifts the pause, releases the Starter Message, and lets the relationship's underlying derived state resurface, so a relationship that was stalled when it was paused is stalled again until an answered check-in clears it.
**End relationship** is the quiet link at the card's foot, with a recorded outcome and reason, and is on nothing on the list.
Beside them an item keeps what it already offered, moved into its band and nothing new: *Copy link to re-invite leader* on an invitation that ran out, *Cancel relationship* on one nobody accepted unless it is a group already running, *Pair by hand* on a pairing an import could not make, and *Contact info* on a declined invitation.
A stall has no button in its band, because it clears itself when the leader answers.

Nudge and *see contact details* were listed here as two separate actions, one of which sent an additional check-in. They are one action, and it sends nothing. See `docs/adr/0010-nudge-reveals-a-number-and-sends-nothing.md`.
Since ticket 10 it is no longer a button either: opening the card is the reveal.

Reassigning or replacing somebody needs no separate action. Ending a relationship returns everyone in it to `Ready to Pair`, and the admin pairs them from the Roster in the usual way.

A **Wants a group** item is somebody who signed up on the group Intake link with no group in mind.
On the list it says when they signed up; its card says what their Intake says of their gender, age band and availability, and offers two actions and no others: a dropdown of the groups open to them with **Place in this group**, and **Resolve**.
Placing them is the Roster's **Add to group** act, `group.add_participant`: it resolves the item in the same transaction and lands on the Roster with the receipt that act gives.

Messaging a participant through Discipler is deliberately absent. The admin picks up the phone; the product's job is to say who needs a call, not to become another inbox.

## Materials

The Materials tab shows the ministry's own list of materials as folders, each holding the relationships and groups working through it now, with a dashed folder last for the ones on no material. A filter of All, Men's and Women's reads what each relationship declared, gives a one-to-one that declared nothing its leader's gender, and files a mixed group under All only. Only accepted, unended relationships appear. Opening a folder lists its relationships as cards: who is in it, the state the Overview derives for it, since when it has been on this material, and every earlier period with dates. Assignment history is preserved so later reporting can connect a period's responses to the material in use during it, and that history line is the one place it is visible.

The tab's New material button opens a page of its own where an admin gives a material a title and some text, files and links, or any of them; a folder's Edit link opens the page where the title and text are changed, files and links are added or removed, and the material is removed from the list. Files may be documents, images, audio or video (`.scratch/richer-materials/spec.md`). Removing takes two presses and is refused while any relationship is working through the material; a removed material leaves the tab and every assign list, and the weeks relationships spent on it still say so.

Every card in a folder ends in a row that assigns a material: a dropdown of every live material, with "No material" in a material's own folder, and a button. It starts now and never earlier, and saving the material a relationship is already on changes nothing, which a folder says and a group's card does not. The same choice sits on an accepted group's card on Intake forms, saved with the group's name; an unaccepted group's card says a material can be assigned once its leader has accepted. On the group form, each group's name has the title of the material it is working through beneath it.

A material's folder also has an Assign to more button, which opens a page listing every accepted relationship not already on it, each with a checkbox, and starts every ticked one on it in one press; if any one is refused, none of them is started, and the page names which one and why (`.scratch/richer-materials/spec.md`).
When a material a relationship is working through changes, the tick later texts its people once, as `docs/adr/0027-a-material-change-is-texted-once-it-settles.md` describes; no button here sends anything.

## Roster

The Roster tab is the ministry's full people list: one list, with each person on it once and every pairing they are in on their one row.
Nobody on it is a Discipler or a Disciple as a person: each pairing says who disciples whom, and anybody who has completed intake can be picked on either side of one (`.scratch/roles-per-pairing/spec.md`).
An **Everyone** menu directly under its title narrows what is shown, by pairings, by gender and to Admins, with a count beside every option, and once anything is ticked its button names what is shown.
Above the table sit three numbers: total, paired, and unpaired, where paired means in at least one open relationship in either role; while anything is ticked they give way to how many are shown of how many are on the Roster.
Each row carries a number, the name, tagged **Awaiting Intake** beside it when the person has not completed intake and so cannot be paired, email address (optional at intake), phone number, and who they are paired with.
Each pairing on a row says which way it runs, with its size: *disciples* or *discipled by* the other person in a one-to-one, and *leads* or *in* a group, by its name where it has one; a pair an import planned says its direction too, as planned, awaiting intake, or as not made; a person in no relationship shows "Unpaired" beside a **Pair** button that starts the pairing flow directly from the roster.
**Pair** opens a popup that asks which side of this pairing the person is on, *Disciples somebody* or *Is discipled*; it opens on the side what they already do and what they answered at intake suggest, and one press switches it.
The name opens a person page carrying one tag per pairing, each saying its direction, and the acts about one person (the intake link, a new invitation, a password reset, **Unpair** beside each pairing they hold, and **Remove from the Roster** at the foot of the page for anybody but an Admin).
Removing takes two presses, ends or leaves every pairing they hold the way Unpair would, and lands on the Roster saying who was removed; see *Removing a Person From the Roster Keeps Them and Ends Their Pairings* in `docs/product-rules.md`. These screens say Discipler, Disciple and pairing; see *Admin Screens Say Discipler and Disciple* in `docs/product-rules.md`. The roster is also where people enter the ministry in bulk: an admin pastes rows from a spreadsheet, in one of two layouts, and the paste may say who disciples whom.

Roster membership, intake completion, and pairing eligibility are three different things, and the model keeps them separate through four statuses, which decide who can be paired; no screen prints one as a word about a person, and only **Awaiting Intake** and **Opted out** are said, because they are why Pair is missing. **No Intake Submitted** means the person exists on the church roster, including everyone pulled in from Planning Center, but has not completed a Discipler intake form; it carries no implication that they want to participate. **Ready to Pair** means intake is complete and they can be matched or paired manually. **Paired** means they hold at least one open membership *as a participant*, and a paused relationship still counts as Paired. Leading a relationship is not being discipled and never sets this status, so a person who leads two relationships and is discipled by nobody is `Ready to Pair`. **Opted Out** means they have said they do not want to participate, and they are excluded from both pairing workflows and intake follow-up.

V1 ships the spreadsheet paste only; the Planning Center API is deferred. An import populates names, emails, and phone numbers into the roster, and where a row says who disciples whom it records an intended pairing that forms itself once both people have completed intake; the layouts and that rule are settled in `docs/product-rules.md` under *The Import Is a Paste, in One of Two Layouts* and *Importing a Pair Plans It*. Imported people land as No Intake Submitted and cannot receive a check-in until they complete intake themselves. Importing a person is never consent.
