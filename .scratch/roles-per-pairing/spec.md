# Roles per pairing: nobody is a Discipler or a Disciple

**Status:** needs-triage

## What this is

A person is not a Discipler or a Disciple.
Each pairing says who disciples whom, and anybody who has completed Intake can be picked on either side of one.
The Roster stops sorting people into two lists, the Pair popup asks which side this person is on in this pairing, and a person's page lists what they do, one pairing at a time.

Leader and Participant are already held per membership (`CONTEXT.md`), so the model does not change.
What changes is the layer above it: `app/roster/lists.ts` today decides who may be picked from each Pair popup, and that is the bug.
Emily, who finished Intake and said nothing about mentoring, cannot be picked to disciple Sarah from anywhere, and nothing on screen says why.

James settled this on 2026-09-24 in a Lavish review of mock-ups built on the real pages (`.lavish/roles-per-pairing/index.html`, gitignored), starting from a design he had drafted in an outside conversation.
Every decision below is his answer there.

**Design source:** that review's mock-ups: `mock-roster-all.html`, `mock-roster-b.html`, `mock-pair-emily.html`, `mock-pair-sarah.html`, `mock-emily.html`, `mock-grace.html`, `mock-hannah.html`.

## Relation to other work

- This answers question 2 of `.lavish/planned-pairs-and-sides/` (moving somebody from one side to the other): nobody has a side to move.
- Question 1 there (two people are never paired both ways round) is this design's both-ways-round guardrail, and its database rule lands with that ticket, not here.
- Question 3 there (Swap sides on a planned pair) stands on its own.
- `.scratch/manual-pairing/spec.md`, *The Roster*, is superseded where it describes the All / Disciplers / Disciples toggle.

## The Roster

- **One list.** The All / Disciplers / Disciples toggle goes.
- **One menu replaces it.** Its button never says *Filter*.
  With nothing ticked it reads **Everyone ▾**; with something ticked it names what is shown, joined by `·` (*Being discipled · Women*).
  There are no chips beside it: the button says the same thing.
- The menu has **Everyone** at the top, which clears it, then three sections:
  - **Pairings**, tick any, and a person must match every one ticked:
    **Disciples somebody**, **Being discipled**, **In a group**, **Unpaired**, **Offered to disciple, not yet discipling**, **Awaiting Intake**.
  - **Gender**, pick one: **Men and women** (the default), **Men**, **Women**.
  - **Access**: **Admins**.
- Every option shows a count, counted over the whole Roster, not narrowed by the other options ticked.
- What is ticked lives in the link, so a refresh keeps it and it needs no script, as the toggle's plain links do today.
- The stats line reads *N shown · M on the Roster* while anything is ticked, and total, paired and unpaired as today while nothing is.
- **The Paired with cell says the direction of every pairing**: *disciples* Chloe Park, *discipled by* Grace Lee, *leads* Tuesday Women's, *in* Tuesday Women's, each with its size tag as today.

What each Pairings option means, decided here because the review did not spell it out:

- **Disciples somebody**: holds an open leader membership, one still awaiting their acceptance included, because the Paired with cell already shows those.
- **Being discipled**: holds an open participant membership, one-to-one or group.
- **In a group**: holds an open membership, either side, in a relationship with more than one Disciple now, read from live membership as the old *in groups* count was.
- **Unpaired**: holds no open membership on either side and no plan an import made.
- **Offered to disciple, not yet discipling**: answered Mentor on the Intake form and leads nothing.
- **Awaiting Intake**: Participation Status is No Intake Submitted.

## The Pair popup

- **Pair** stays one button, on every Roster row and on every person page, and it is offered on the same conditions as today: Intake completed and not opted out.
- **A side chooser** sits directly under the title: *In this pairing, {first name}* **Disciples somebody** · **Is discipled**.
  One press switches it.
- **It opens preset**, by today's rule for who is a Discipler: leading an open relationship, having answered Mentor, or being the discipler in a plan an import made opens on *Disciples somebody*; everybody else opens on *Is discipled*.
  The preset only picks which side the popup opens on, and never limits who can be picked.
- **Disciples somebody** is today's popup from a Discipler: any number ticked, the shape toggle, the Group gender toggle, and the Groups below.
  Its list opens on **Asked to be discipled**: people who have completed Intake, are not opted out, hold no open participant membership and would not open as *Disciples somebody* themselves.
- **Is discipled** is today's popup from a Disciple: one choice, and the Groups below.
  Its list opens on **Disciples somebody already, or offered to** (*Disciples*, not *Disciple*): everybody who would open as *Disciples somebody*, with *leads N* as today.
- **Everybody else** the gender rule allows is folded under **Everyone else · N**, closed, and one press opens it.
  A row there says what the person does now in a second line (*Discipled by Rachel Adams*, *In Tuesday Women's*).
  James, 2026-09-24: *"this but we will come back to it."* The two headings' words are part of what he is coming back to.
- **What stays greyed, with its reason on the row:** Awaiting Intake, Opted out, *Already in a 1:1 with {name}* where the shape makes a 1:1 (one open one-to-one as the one discipled, any number of groups).
  Two people are never paired both ways round: the row reads *Disciples {first name} already*, once that rule exists (planned-pairs-and-sides, question 1).
- **Still not shown:** the person themselves, and whoever the gender rule leaves out, as decided on 2026-09-21.
- **The summary sentence** says both sides and what the picked Discipler goes on doing: *Emily Davis will disciple Chloe Park, one to one. Emily is sent an invitation to accept, and goes on being discipled by Grace Lee.*
- Whoever is picked to disciple is invited exactly as a Discipler is today, and gains an account by accepting.
- The popup is one component with the side as its state; the two popups built today become its two sides.

## A person's page

- **No single word says what a person is.** *On the Roster as* goes, and so does the Participation Status chip in the card's corner (*Ready to Pair* on somebody who leads is the opposite of what they do).
- **One tag per open pairing and per group**, under the name, each with its direction: *disciples* Chloe Park, *discipled by* Grace Lee, *leads* Tuesday Women's, *in* Tuesday Women's.
  Group tags are drawn apart from one-to-one tags.
- **Awaiting Intake** and **Opted out** still show as a tag, as on the Roster.
- **At Intake** stays exactly as today: *Offered to mentor* for the Mentor answer, and nothing for the Mentee answer or none.
  The mock-up drew *Asked to be discipled*, which today's rule deliberately leaves unsaid (`app/roster/copy.ts`, `OFFERED_TO_MENTOR`); this spec keeps today's rule.
- Participation Status stays in the model and still decides who can be paired.

## Texts

No wording changes because of this design: every text already reads the role from the pairing.
The texts were walked through on 2026-09-24, composed by `src/domain/outbound-copy.ts` itself, for somebody on both sides and somebody leading three.

- **The leader Starter Message stays as it is**, including for somebody already being discipled who starts discipling (James, Q7).
- **The weekly check-in stays one pairing at a time, in one thread, earliest first** (James, Q9, and `docs/check-in-rhythm.md`).
- **A named group is named by its name in keyword menus and confirmations**, as the check-in already names it; an unnamed group and a one-to-one are named by their people (James, Q8).
  Today a `PAUSE` menu calls Tuesday Women's *Hannah Brooks and Lily Evans*, and a `SWAP` menu from somebody discipled one-to-one by Grace and in Grace's group reads *1. Grace Lee 2. Grace Lee*.
  The line is composed by `otherSideNamed` in `src/domain/boundary.ts`; the check-in's subject (`relationship.name ?? checkInSubject(...)`) is the rule to share.
  Real phones read this, so the before and after texts go to James with the ticket.
- The links in these texts are real: the leader Starter Message links `https://app.trydiscipler.com/relationships` (`app/relationships/page.tsx`, which sends a signed-out visitor to `/login`), and an invitation links `/invitation/<token>`.

## Eligible to lead

There is no flag and none comes back (James, Q4: *"the acceptance only comes after the people have completed the intake forms. the eligible to lead marker needs to be killed."*).
Ticket 36 stands: pairing somebody is the pastor's acceptance, and pairing is only offered once Intake is complete.
The marker is already gone from the product (`b8894d5`, 2026-09-07).
What remains is history rows recording it being set (kept, as history is), one sentence in `docs/adr/0008-the-phone-number-is-the-sign-in-credential.md`, and the design prototype `.scratch/core-operating-loop/design/discipler-dashboard-v10.html`.
The person-level Discipler / Disciple lists this spec removes are the last marker-like thing on screen.

## Decided against

- **A cap on how many somebody disciples** (Q5): none. *leads N* in the popup is the signal.
- **A second one-to-one discipler** (Q6): no. One open one-to-one as the one discipled, plus any number of groups.
- **Peer accountability, a discipleship tree view, programs, role tags**: not now.

## What changes in the docs

- `CONTEXT.md`, **Discipler / Disciple**: the Admin-screen words for the two sides of *one pairing*, no longer lists a person is on.
- `CONTEXT.md`, **Declared Side**: presets the Pair popup and feeds Suggested Pairs, and no longer makes anybody a Discipler.
- `.scratch/manual-pairing/spec.md`, *The Roster*: points here for the toggle.
- Suggested Pairs keeps reading the Declared Side, unchanged.

## Out of scope

- A migration: roles are already on memberships. The both-ways-round rule's migration belongs to planned-pairs-and-sides, question 1.
- Anything a Participant or a Leader sees on their own pages.
