# 05 - A 1:2 pair has no name

**What to build:** A 1:2 pair keeps no name, so every text names it by its people and it leaves the public Group Intake Link.
Today the Pair popup builds one in the browser, *Claire with Ana & Sam*, and posts it as the ordinary name, which is stored in `relationship.name` with nothing to mark it as generated.
The manual-pairing spec says that name is never shown, yet the weekly check-in asks *Did you meet with Claire with Ana & Sam this week?*, the keyword texts and the Resume Message say the same, the Group Intake Link offers the pair by it (two Disciples' first names on a printable link that invites strangers to join), and Admin screens ask about it by it.
James decided on 2026-09-27: the popup stops posting a name, the forming command accepts a 1:2 pair without one while a Group of the same three people must still be named, and a data migration clears the names already stored.
Spec: `.scratch/roles-per-pairing/spec.md`, *Texts*; `.scratch/manual-pairing/spec.md`, *What each shape asks*.

**Blocked by:** nothing

**Status:** ready-for-human

**Built:** on `ship/one-to-two-has-no-name`. Carries a data migration, `supabase/migrations/20261013000500_a_one_to_two_pair_has_no_name.sql`, to be pushed to production by hand before the merge.

## Acceptance

- [x] The Pair popup posts no name for a 1:2 pair, and posts that it is one (`shape=one_to_two`) beside the Discipler's gender.
- [x] `needsAName` exempts a 1:2 pair and still asks a Group of one Discipler and two Disciples; the command is told the shape, because the people alone cannot tell the two apart.
- [x] A 1:2 pair is formed with no name, and a name posted with one is dropped, as a one-to-one's is. Its history records no name.
- [x] Anything else that says it is a 1:2 pair is asked what a Group is asked.
- [x] The weekly check-in, the `PAUSE` and `RESUME` menus and their clarification, the pause confirmation and pause applied, the `SWAP` answer, and the Resume Message to both sides name a 1:2 pair by its people, proven by a test that reads the name off what the command formed.
- [x] A 1:2 pair is not on the Group Intake Link, proven over HTTP beside a named Group that is.
- [x] A data migration clears a stored name that is the popup's formula applied to the people the relationship was formed with, in either order of the two Disciples, and leaves every other name alone, a typed name on a 1+2 Group included. History keeps the old name. Proven against the local stack.
- [x] Every Admin screen that names a 1:2 pair calls it what it calls an unnamed group; each was checked and is listed below.
- [x] `nameOfAOneToTwo` is deleted: it had no remaining use.
- [x] `CONTEXT.md` (*Group Name*) and both specs say what a 1:2 pair is called.
- [x] The composed before and after text of every message that changes is below, for James, because real phones read them.

## Comments

### Implementer, 2026-09-27: what was built, the texts, and what to look at

#### Where things are

- The rule: `needsAName(leaderCount, participantCount, shape?)` in `src/domain/relationships.ts`, beside `ONE_TO_TWO` and `FormedShape`.
  It is true for the shapes that declare a gender, less exactly one Discipler and two Disciples said to be a 1:2 pair.
- The command: `relationship.create` takes `shape?: 'one_to_two'` (`src/domain/commands.ts`), and `formRelationship` in `src/domain/boundary.ts` passes it to `needsAName`.
  A 1:2 pair also gets `joinRequiresApproval: false` whatever was posted, as a one-to-one does, since no link offers it.
- The popup: `postedByAOneToTwo({ declaredGender })` in `app/roster/pair-shape.ts` posts `{ shape: 'one_to_two', declaredGender }`, and `wasPostedByAOneToTwo` reads it back; `PairShape` now spells the 1:2 shape as the domain's `ONE_TO_TWO`.
- The route: `app/roster/pair/create/route.ts` tells the command the shape when the form says it is a 1:2 pair.
  A form that says nothing, which is what a browser without script posts, is formed by what its people make it, as before.
- The migration: `supabase/migrations/20261013000500_a_one_to_two_pair_has_no_name.sql`.
  It reads `relationship.created` events whose payload has exactly one `leaderIds` and two `participantIds`, splits each person's first name out of `full_name` with `split_part(regexp_replace(btrim(full_name), '\s+', ' ', 'g'), ' ', 1)`, and sets `name = null` where the name is `{leader} with {one} & {other}` or `{leader} with {other} & {one}`.
  Ids are compared as text, so a payload holding anything but a uuid matches nobody rather than failing the push.
  `ministry_event` is not touched, and could not be: it is append-only.
- Nothing else needed changing to name the pair by its people: `relationshipSubject` in `src/domain/outbound-copy.ts` already falls back to the other side's people, and `groups_open_to_join` already requires a name.
- Tests:
  - `tests/domain/a-one-to-two-pair-has-no-name.test.ts`: the rule, the command, and every text, with the pair's name read off what the command formed.
  - `tests/app/pair-shape.test.ts`: what a 1:2 pair posts.
  - `tests/integration/the-pair-popup-from-a-discipler-over-http.test.ts`: the popup's hidden fields, the route forming a 1:2 pair with no name, the refusals that still reach it, and the Group Intake Link leaving it off.
  - `tests/integration/a-one-to-two-pair-has-no-name.test.ts`: the migration's own file, run over relationships formed as the old popup formed them, inside a transaction that is rolled back so no other test's rows are touched.

#### Decided

- **The shape travels on the existing `shape` field**, which a Group already posts as `group` for the way back from a refusal.
  One field, three values the route knows: `group`, `one_to_two`, or nothing.
- **A claim of 1:2 with other counts is a Group**, and is refused `relationship.needs_a_name` if unnamed.
  The popup strikes 1:2 out at three ticked, so only a hand-made form can say it.
- **The migration matches current names.**
  A pair whose Discipler or Disciples have been renamed on the Roster since it was formed no longer matches the formula, and keeps its name.
  The read-only query in the PR lists exactly which rows it would clear, so James can see that before the push.
- **Nothing is recorded for the cleared names.** An Admin's rename is recorded as `relationship.group_configured`, with who made it, and nothing reads those events; the migration is no Admin's act and has nobody to name.
  The old name stays in each pair's `relationship.created` event.

#### For James

1. **The Intake forms page lists a 1:2 pair as an *Unnamed group*,** as it lists every group, with the name field it asks of any group.
   Its explanation already says an unnamed group is not on the link and is asked about by listing who is in it, which is true of a 1:2 pair.
   But that card's Save also saves the join switch and the group's Material, and a group cannot be saved without a name (`group.name_missing`), so changing a 1:2 pair's Material from that card now means naming it, which puts it on the link.
   Its Material can still be changed from the Materials page without naming it.
   Nothing here changes that; say if a 1:2 pair should leave that panel, or be saveable there with no name.
2. **A Join Request somebody made for a 1:2 pair on the link before this ships** stays on Intake forms, and now reads *asked to join a group that has since lost its name*, which is the page's existing words for it.
   Admitting it adds them, and texts the Discipler *{First} just joined your group.*
3. **On the Materials page a 1:2 pair's tile is called by its Discipler alone** (*Claire Lee*), which is how the page names every unnamed group; a one-to-one's tile names both (*Claire Lee & Ana Diaz*).
   The folder card under it says *Group* and lists the Disciples.
4. Not changed, only noticed: the *pause applied* text has always carried an em dash after *Done*.
   It is existing wording, quoted below exactly as a phone receives it.
5. `.scratch/suggestions-beyond-the-one-to-one/issues/02-suggesting-groups-one-to-twos-and-one-to-ones.md` still says a suggested 1:2 arrives needing a name; that ticket is not built, and is left for whoever builds it.

#### Verified

- Test first: the domain test was red (the command refused a 1:2 pair with no name, `relationship.needs_a_name`), the app test was red (the popup posted a name), and the migration test was red (no migration file) against the local stack, before each went green.
- `scripts/locked-tests.sh`, the whole suite once with a server, after a reset that applied the new migration: `Test Files 210 passed (210)`, `Tests 3086 passed | 1 skipped (3087)`, no skipped files; the one skipped test is the standing `it.skip` in `tests/integration/invitation-over-http.test.ts`.
- `npx vitest run tests/domain tests/app`: 91 files, 1856 tests passed.
- `npx tsc --noEmit` is clean; `package.json` has no lint script.

#### The texts, before and after

Composed by `handleCommand` itself, with the pair's name set to *Claire with Ana & Sam* (before) and to none (after), for ABC Church: Claire Lee disciples Ana Diaz and Sam Park as a 1:2 pair.
Where a menu needs two lines, Claire also disciples Emily Davis one to one, begun earlier.
The rates line is shown as composed; the once-a-month rule leaves it off at send for somebody who has already had it that month.
Nothing else a 1:2 pair is sent changes: the invitation, the Starter Messages and the Material texts never named it.

#### The weekly check-in, to Claire (as composed; the rates line is left off at send once she has had it that month)

Before:

```text
[to Claire] ABC Church: Did you meet with Claire with Ana & Sam this week? Reply 1 for yes, 2 for no. Msg & data rates may apply. Reply STOP to opt out, HELP for help.
```

After:

```text
[to Claire] ABC Church: Did you meet with Ana Diaz and Sam Park this week? Reply 1 for yes, 2 for no. Msg & data rates may apply. Reply STOP to opt out, HELP for help.
```

#### Claire texts PAUSE (she also disciples Emily Davis one to one)

Before:

```text
[to Claire] ABC Church: Which check-ins would you like to pause? 1. Emily Davis 2. Claire with Ana & Sam
```

After:

```text
[to Claire] ABC Church: Which check-ins would you like to pause? 1. Emily Davis 2. Ana Diaz and Sam Park
```

#### Claire replies "2" to that menu

Before:

```text
[to Claire] ABC Church: Pause check-ins with Claire with Ana & Sam for 2 weeks? Reply YES to confirm, or reply 1, 4, 8, or 12 for a different number of weeks.
```

After:

```text
[to Claire] ABC Church: Pause check-ins with Ana Diaz and Sam Park for 2 weeks? Reply YES to confirm, or reply 1, 4, 8, or 12 for a different number of weeks.
```

#### Claire replies "the pair" to that menu

Before:

```text
[to Claire] ABC Church: Sorry, we didn't catch that. 1. Emily Davis 2. Claire with Ana & Sam
```

After:

```text
[to Claire] ABC Church: Sorry, we didn't catch that. 1. Emily Davis 2. Ana Diaz and Sam Park
```

#### Claire replies YES to the confirmation

Before:

```text
[to Claire] ABC Church: Done — your check-ins about Claire with Ana & Sam are paused for 2 weeks. Reply RESUME any time to start them again sooner.
```

After:

```text
[to Claire] ABC Church: Done — your check-ins about Ana Diaz and Sam Park are paused for 2 weeks. Reply RESUME any time to start them again sooner.
```

#### Claire texts PAUSE, the pair all she leads

Before:

```text
[to Claire] ABC Church: Pause check-ins with Claire with Ana & Sam for 2 weeks? Reply YES to confirm, or reply 1, 4, 8, or 12 for a different number of weeks.
```

After:

```text
[to Claire] ABC Church: Pause check-ins with Ana Diaz and Sam Park for 2 weeks? Reply YES to confirm, or reply 1, 4, 8, or 12 for a different number of weeks.
```

#### Claire texts RESUME, both paused

Before:

```text
[to Claire] ABC Church: Which check-ins would you like to restart? 1. Emily Davis 2. Claire with Ana & Sam
```

After:

```text
[to Claire] ABC Church: Which check-ins would you like to restart? 1. Emily Davis 2. Ana Diaz and Sam Park
```

#### Claire texts RESUME, only the pair paused (the Resume Message, to everyone in it)

Before:

```text
[to Claire] ABC Church: Your discipleship with Claire with Ana & Sam has been resumed! Msg & data rates may apply. Reply STOP to opt out, HELP for help.
[to Ana] ABC Church: Your discipleship with Claire with Ana & Sam has been resumed! Msg & data rates may apply. Reply STOP to opt out, HELP for help.
[to Sam] ABC Church: Your discipleship with Claire with Ana & Sam has been resumed! Msg & data rates may apply. Reply STOP to opt out, HELP for help.
```

After:

```text
[to Claire] ABC Church: Your discipleship with Ana Diaz and Sam Park has been resumed! Msg & data rates may apply. Reply STOP to opt out, HELP for help.
[to Ana] ABC Church: Your discipleship with Claire Lee has been resumed! Msg & data rates may apply. Reply STOP to opt out, HELP for help.
[to Sam] ABC Church: Your discipleship with Claire Lee has been resumed! Msg & data rates may apply. Reply STOP to opt out, HELP for help.
```

#### Ana texts SWAP (the pair is all she holds)

Before:

```text
[to Ana] ABC Church: Thanks for letting us know about Claire with Ana & Sam. We've passed this on and someone will be in touch. Nothing changes in the meantime.
```

After:

```text
[to Ana] ABC Church: Thanks for letting us know about Claire Lee. We've passed this on and someone will be in touch. Nothing changes in the meantime.
```

#### An Admin resumes the pair

Before:

```text
[to Claire] ABC Church: Your discipleship with Claire with Ana & Sam has been resumed! Msg & data rates may apply. Reply STOP to opt out, HELP for help.
[to Ana] ABC Church: Your discipleship with Claire with Ana & Sam has been resumed! Msg & data rates may apply. Reply STOP to opt out, HELP for help.
[to Sam] ABC Church: Your discipleship with Claire with Ana & Sam has been resumed! Msg & data rates may apply. Reply STOP to opt out, HELP for help.
```

After:

```text
[to Claire] ABC Church: Your discipleship with Ana Diaz and Sam Park has been resumed! Msg & data rates may apply. Reply STOP to opt out, HELP for help.
[to Ana] ABC Church: Your discipleship with Claire Lee has been resumed! Msg & data rates may apply. Reply STOP to opt out, HELP for help.
[to Sam] ABC Church: Your discipleship with Claire Lee has been resumed! Msg & data rates may apply. Reply STOP to opt out, HELP for help.
```

#### An Admin puts Rosa Vega into the pair from the Pair popup

Before:

```text
[to Claire] ABC Church: Rosa just joined Claire with Ana & Sam. See full name and contact info at https://app.trydiscipler.com/relationships. Msg & data rates may apply. Reply STOP to opt out, HELP for help.
```

After:

```text
[to Claire] ABC Church: Rosa just joined your group. See full name and contact info at https://app.trydiscipler.com/relationships. Msg & data rates may apply. Reply STOP to opt out, HELP for help.
```

#### Admin screens, before and after

Composed by the screens' own copy functions (`app/roster/copy.ts`, `app/intake-forms/copy.ts`, `app/materials/copy.ts`, `app/materials/folders.ts`).
Each is what the screen already says of an unnamed group.
The public Group Intake Link is not here: the pair is no longer on it.

| Where | Before | After |
| --- | --- | --- |
| Roster Paired with cell and person-page tag, Claire | leads Claire with Ana & Sam | leads Ana Diaz and Sam Park |
| Roster Paired with cell and person-page tag, Ana | in Claire with Ana & Sam | in Claire Lee’s group |
| Person page Pairings card line, Claire | Discipling Claire with Ana & Sam: Ana Diaz, Sam Park | Discipling Ana Diaz, Sam Park |
| Person page Pairings card line, Ana | Discipled by Claire Lee in Claire with Ana & Sam | Discipled by Claire Lee |
| Unpair question, on Claire’s page | Unpair Claire Lee from Claire with Ana & Sam? It ends for Ana Diaz and Sam Park too. | Unpair Claire Lee from this group? It ends for Ana Diaz and Sam Park too. |
| Unpair question, on Ana’s page | Unpair Ana Diaz from Claire with Ana & Sam? Claire Lee goes on leading it. | Unpair Ana Diaz from this group? Claire Lee goes on leading it. |
| Remove from the Roster, on Claire’s page | Claire with Ana & Sam ends, and Ana Diaz and Sam Park go back to unpaired. | Their group with Ana Diaz and Sam Park ends, and Ana Diaz and Sam Park go back to unpaired. |
| Remove from the Roster, on Ana’s page | Claire with Ana & Sam goes on without them. | Their group with Claire Lee and Sam Park goes on without them. |
| Pair popup, a group row: label | Claire with Ana & Sam | Claire Lee’s group |
| Pair popup, a group row: details | led by Claire Lee · 2 disciples · Women’s | 2 disciples · Women’s |
| Pair popup summary, from Rosa (a Disciple) | Rosa Vega will join Claire with Ana & Sam, led by Claire Lee. | Rosa Vega will join Claire Lee’s group. |
| Pair popup summary, from Beth Morgan (a Discipler) | Beth Morgan will co-lead Claire with Ana & Sam with Claire Lee. | Beth Morgan will co-lead Claire Lee’s group. |
| Pair popup, Ana’s row second line | In Claire with Ana & Sam | In Claire Lee’s group |
| Pair popup, Claire’s row second line | Leads Claire with Ana & Sam | Leads Ana Diaz and Sam Park |
| Pair popup summary, Ana picked to disciple Rosa one to one | Ana Diaz will disciple Rosa Vega, one to one. Ana is sent an invitation to accept, and goes on being discipled in Claire with Ana & Sam. | Ana Diaz will disciple Rosa Vega, one to one. Ana is sent an invitation to accept, and goes on being discipled in Claire Lee’s group. |
| Intake forms, Groups panel card heading | Claire with Ana & Sam | Unnamed group |
| Intake forms, Waiting to join a group (a request made on the link before this ships) | asked to join Claire with Ana & Sam | asked to join a group that has since lost its name |
| Materials home, tile name | Claire with Ana & Sam | Claire Lee |
| Materials folder card, meta line label | Group, Claire with Ana & Sam | Group |
| Materials, Assign to more row | Claire with Ana & Sam led by Claire Lee | Claire Lee with Ana Diaz, Sam Park |
