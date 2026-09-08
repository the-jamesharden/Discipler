# Discipler — The Pastor Dashboard

This is the working product description of the pastor-facing dashboard. It is a product model, not an implementation specification. Items marked **OPEN** are unresolved and must not be implemented by inference.

## Shape

The pastor dashboard is a single web application with six tabs: **Overview**, **Check-Ins**, **Suggested Pairs**, **Follow-Up**, **Materials**, and **Roster**. Every number it shows is derived from the same week-by-week history that drives relationship state and Ministry Intelligence; the dashboard maintains no separate truth of its own.

## Overview

The Overview tab answers "how is the ministry doing right now" without the pastor having to open anything else. It shows the total number of active discipleship relationships, the meeting rate derived from check-in responses, the response completion rate, the number of check-ins completed this week, and the number of items flagged for follow-up this week — where that follow-up count combines stalled relationships, relationships carrying an unresolved concern, relationships whose pause has expired, and relationships carrying an open swap request. Two pie charts sit alongside these figures: a **Meeting Completion** chart showing the ratio of meetings completed to meetings missed, and a **Check-In Ratings** chart showing the distribution of A (outstanding), B (good), and C (concern) responses. A **Quick Stats** panel repeats the headline figures in compact form: total relationships including groups, response completion rate, meeting rate, quality rate (the proportion of A and B responses against C), text-message response rate, and total active relationships. Below the charts, the Overview lists every active and paused relationship and group; a paused one is listed in place and visibly marked `Paused` so the pastor can tell it apart from an active, stalled, or ended relationship. A paused relationship is listed but not counted among the active relationships, on the same principle that takes an ended one out of the active counts. Those carrying a concern are flagged in place and can be opened directly to reveal the full name and phone number of the people involved.

Two metrics carry the operational picture and must not be conflated: **Response Rate** is check-ins answered divided by check-ins sent, and **Meeting Rate** is meetings held divided by check-ins answered. A ministry can have a high response rate and a poor meeting rate; collapsing them hides exactly the problem the product exists to surface. On the Check-In Ratings chart, A renders green, B yellow, and C red. Quick Stats is a panel inside Overview, not a separate tab.

## Check-Ins

The Check-Ins tab is the week's raw operational picture. It shows how many check-ins have been completed, how many are still pending, and how many concerns were raised, with the completed responses broken down at the top into A (outstanding), B (good), and C (concern). The A and B headings expand into the threads behind them. The C heading does not. Concerns are never presented as a browsable list, never exported, and never quoted in a report — an admin reading "four concerns this week" opens each person individually to see what was said. Raw concern text is the most sensitive data in the product, and the extra click is deliberate friction, not an oversight.

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

Four actions are available from a follow-up item and no others. **Nudge**, always, which reveals the participant's contact details so the admin can reach them directly — it sends nothing. **Resolve**, which clears the item — on a concern-based item it clears the concern text by default; on a swap request it records that the admin reviewed the request and left the relationship in place. **Resume relationship**, on a paused relationship, which lifts the pause, releases the Starter Message, and lets the relationship's underlying derived state resurface — a relationship that was stalled when it was paused is stalled again until an answered check-in clears it. **End relationship**, always, with a recorded reason.

Nudge and *see contact details* were listed here as two separate actions, one of which sent an additional check-in. They are one action, and it sends nothing. See `docs/adr/0010-nudge-reveals-a-number-and-sends-nothing.md`.

Reassigning or replacing somebody needs no separate action. Ending a relationship returns everyone in it to `Ready to Pair`, and the admin pairs them from the Roster in the usual way.

Messaging a participant through Discipler is deliberately absent. The admin picks up the phone; the product's job is to say who needs a call, not to become another inbox.

## Materials

The Materials tab shows every discipleship relationship and group in the ministry together with the material currently assigned to it, and lets the pastor assign materials from that same view. Assignment history is preserved so later reporting can connect a period's responses to the material in use during it.

Material assignment is deferred from V1: the assignment history is recorded, but the admin-facing assignment interface is not built for the pilot. Assignments are configured directly during pilot support.

## Roster

The Roster tab is the ministry's full people list, shown as two lists behind an **All Disciplers** / **All Disciples** toggle that opens on Disciplers. A Discipler is a fact, never a mark: anyone leading an open relationship, anyone who signed up as a leader at intake, or anyone an import paired as the discipler; everyone else is a Disciple, and a person may be on both lists. Above each list sit four numbers: total, paired, unpaired, and in groups. Each row carries a number, the name with the participation status under it, email address (optional at intake), phone number, and who they are paired with. A person in a one-to-one relationship shows the name of the other person with a one-to-one notation; a person in a group shows the names of everyone in that group with a group notation; a pair an import planned shows as planned, awaiting intake, or as not made; a person in no relationship shows "Unpaired" beside a **Pair** button that starts the pairing flow directly from the roster. The name opens a person page carrying the acts about one person (the intake link, a new invitation, a password reset) and a sentence saying why they are a Discipler or a Disciple. These screens say Discipler, Disciple and pairing; see *Admin Screens Say Discipler and Disciple* in `docs/product-rules.md`. The roster is also where people enter the ministry in bulk: an admin pastes rows from a spreadsheet, in one of two layouts, and the paste may say who disciples whom.

Roster membership, intake completion, and pairing eligibility are three different things, and the roster keeps them visibly separate through four statuses. **No Intake Submitted** means the person exists on the church roster — including everyone pulled in from Planning Center — but has not completed a Discipler intake form; it carries no implication that they want to participate. **Ready to Pair** means intake is complete and they can be matched or paired manually. **Paired** means they hold at least one open membership *as a participant*, and a paused relationship still counts as Paired. Leading a relationship is not being discipled and never sets this status, so a person who leads two relationships and is discipled by nobody reads `Ready to Pair`. **Opted Out** means they have said they do not want to participate, and they are excluded from both pairing workflows and intake follow-up.

V1 ships the spreadsheet paste only; the Planning Center API is deferred. An import populates names, emails, and phone numbers into the roster, and where a row says who disciples whom it records an intended pairing that forms itself once both people have completed intake; the layouts and that rule are settled in `docs/product-rules.md` under *The Import Is a Paste, in One of Two Layouts* and *Importing a Pair Plans It*. Imported people land as No Intake Submitted and cannot receive a check-in until they complete intake themselves. Importing a person is never consent.
