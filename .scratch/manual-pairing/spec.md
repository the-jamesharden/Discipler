# Manual pairing, as the dashboard draws it

**Status:** needs-triage

## What this is

`/roster/pair` is the one screen behind every way an Admin forms a relationship by hand.
It works, and it looks nothing like the product.
Today it is two long checkbox lists naming every candidate twice, a gender question, a name field and a submit button.

The design prototype draws the same act as a modal anchored to one person: a scrolling list of real people with faces and contact details, a segmented control that names what is about to be made, a sentence saying it in English, and a button whose label is the thing it will do.

This effort ports that screen onto the existing command, and extends the domain in the two places where the prototype asks for something the domain cannot yet answer.

**Design source:** `discipler-dashboard (10).html`, `showPairModal` and `_updatePairSummary` (lines 2163-2400), plus the screenshot of the two-checked 1:2 state.

## What the prototype does that we do not

| Prototype | Repository today |
| --- | --- |
| Anchored on one person; only the other role is listed | Every candidate listed twice, as Discipler and as Disciple |
| Rows carry avatar, name, email and phone | Rows carry a name and a first-time note |
| Segmented `1:2 pair` / `N x 1:1 pairs` / `Group`, appearing at 2+ checked | No mode; the shape is inferred from the boxes |
| `N x 1:1 pairs` forms several relationships | `relationship.create` forms exactly one |
| Live summary sentence and a counting button label | Static text, static button |
| Group panel carries a Program / book select | No Material until after acceptance |
| No gender question | Gender asked outright, nothing preselected |

## The three rules that shape this

These are the facts the port has to be built around.
Each was read out of the schema rather than assumed.

### 1. There are two gender rules, not one

- **A one-to-one** is bound by an absolute match between its two people, enforced by `relationship_member_gender_matches`, and switched off only by a Ministry setting `suggest_gender_match` (`20260915000100_what_a_ministry_may_vary.sql:97`).
  Manual pairing may never cross it while it is on.
- **A group** is bound only by what it declared.
  A declared men's or women's group binds Leaders and Participants alike; a group declared **mixed** carries no gender constraint at all (`20260916000100_a_group_declares_its_gender.sql:15`).

So mixed groups are legal and mixed one-to-ones generally are not.
This is what makes "default the declaration from the Discipler" and "keep mixed groups" compatible instead of contradictory.

A 1:2 pair is a `group` for both rules: `kindFor(1, 2)` returns `'group'` (`src/domain/relationships.ts:78`), so it declares a gender and carries a name like any other group.

### 2. A Material cannot be assigned at pairing

`relationship.assign_material` refuses while `acceptedAt` is null (`src/domain/boundary.ts:3121`), and a just-paired relationship is never accepted.
Material periods are defined to begin at acceptance and to leave no gaps.

But `20260908000100_material_assignment.sql:292` says outright that assigning a Material *at the instant of acceptance* is permitted and produces a zero-length opening period, and that the period carrying no Material sorts ahead of anything sharing its instant.

So the Material picked at pairing is held as an **intended** Material and written at acceptance, beside the opening period that already lands there (`src/domain/boundary.ts:4733`).
The gapless invariant is untouched.

### 3. There is no batch command

`CommandService.execute` takes one command (`src/service/ports.ts:41`).
`N x 1:1 pairs` is therefore N transactions, and a refusal on the third leaves the first two standing.
The route pre-validates the whole set and forms nothing unless all of it can be formed.

## Recorded decisions

Three places where the prototype and the repository pull apart, resolved here rather than in the tickets.

**It stays a route, styled as the modal.**
The prototype draws a modal; the screen defends being a page, because a page survives a refresh and a back button and a modal does not, and because every pairing refusal travels as a redirect back to it with the selection in the query string.
Both survive: `/roster/pair` keeps its URL and its refusal round trip, and its card is styled as the prototype's centred modal, dimmed backdrop and close control included.
The alternative, moving it into the Roster as a `:target` overlay like the import dialog, would have put the refusal state of a command on the Roster's URL.

**The Discipler is a header, not a list, once one is chosen.**
Arriving from a Roster row already names somebody, which is the common path and the one the prototype models.
That Discipler is shown as a chosen-person header with a Change control that reveals the list; arriving from the bare Pair people button opens with the list showing.
This keeps several Disciplers possible without putting a second full-length list on the common path.

**The declaration defaults, and the default is overridable.**
It is preselected from the chosen Discipler rather than left blank, and Disciples who do not match it are shown disabled with the reason on the row.
Choosing **Mixed** enables the whole list.
In one-to-one shape Mixed is itself disabled unless the Ministry has `suggest_gender_match` off, because the database would refuse it.

This narrows what `src/domain/boundary.ts:2130` is protecting: a preselected answer is no longer *nobody was asked*.
The mitigation is that the declaration is visible, stated in words, and changeable before anything is formed, and that the domain still refuses an unanswered group.
Worth a human's eye before ticket 04 is picked up.

## Two restraints copied from the database

**Somebody with no gender on file is never disabled.**
Both triggers return early on a null gender, on the stated grounds that the readiness rules will refuse the row a moment later with something the Admin can actually act on, and that answering "genders do not match" would send them looking for the wrong problem.
The screen shows the same restraint.

**Disabling is computed against the declaration, never against a person.**
With several Disciplers chosen the declaration defaults from the first, and falls to Mixed if the chosen Disciplers do not share a gender.
Rows are then greyed against the declaration, which is the rule the database actually enforces.

## The tickets

| # | Ticket | Ships |
| --- | --- | --- |
| 01 | What the Pair screen reads | Invisible: migration, reader, port |
| 02 | A Material chosen at pairing | Invisible: column, command field, acceptance |
| 03 | Separate 1:1 pairs in one submission | Invisible: the route learns the mode |
| 04 | The pairing form | The whole screen |

Backends first, then the screen, so that 04 lands on commands that already work and nothing ships a dead control.

## Out of scope

- The prototype's suggestion flow. Accepting a suggestion posts to this same route and is ticket 04 of another effort.
- Any change to who is a candidate. The screen still declines to filter its list, for the reason the current page comment gives: pastoral judgment is never subordinate to a filtered list.
- Editing a relationship after it is formed.
