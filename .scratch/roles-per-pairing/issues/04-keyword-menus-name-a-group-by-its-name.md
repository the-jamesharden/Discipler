# 04 - PAUSE / RESUME / SWAP menus name a group by its name

**What to build:** A keyword menu or confirmation names a named group by its name, as the weekly check-in already does.
An unnamed group and a one-to-one are named by their people, as today.
Today a `PAUSE` menu calls Tuesday Women's *Hannah Brooks and Lily Evans*, and a `SWAP` menu from somebody discipled one to one by Grace and also in Grace's group reads *1. Grace Lee 2. Grace Lee*.
Spec: `.scratch/roles-per-pairing/spec.md`, *Texts* (James, Q8).

**Blocked by:** nothing

**Status:** ready-for-human

**Built:** on roles-per-pairing/04

## Acceptance

- [x] `PAUSE`, `RESUME` and `SWAP` menu lines name a named group by its name, from either side of it.
- [x] Every confirmation and answer that names a relationship chosen from such a menu names it the same way (pause confirmation, pause applied, swap recorded, resume).
- [x] One rule composes the name for the check-in's opening question and for these texts, so they cannot drift.
- [x] An unnamed group, and a one-to-one, read as today.
- [x] The *1. Grace Lee 2. Grace Lee* menu reads *1. Grace Lee 2. Tuesday Women's*, proven by a test through the real inbound route.
- [x] The composed before and after texts are written into this ticket's Comments for James, because they go to real phones.

## Comments

### Implementer, 2026-09-24: what was built, the texts, and two things for James

#### Where things are

- The rule is `relationshipSubject({ name, otherSide })` in `src/domain/outbound-copy.ts`: a named group by its name, anything else by the people on the other side from the reader.
  It replaces `checkInSubject`, which only ever took the people; the fallback that named a group by its name sat beside it in `boundary.ts`, on the check-in and nowhere else.
- The check-in's opening question (`bodyOfQuestion` in `src/domain/boundary.ts`) and every keyword text (`relationshipNamed`, formerly `otherSideNamed`, same file) now both call it.
  That covers the `PAUSE`, `RESUME` and `SWAP` menus, the clarification that re-prints a menu, the pause confirmation, pause applied, swap recorded and the Resume Message.
- `KeywordRelationship` (`src/domain/keywords.ts`) carries `name`, read as `r.name` by `keywordRelationships` in `src/platform/supabase/effect-store.ts`.
  That query is plain SQL in TypeScript and the column was already there, so no migration and no SQL function changed.
  It is read raw, as the check-in reader reads it; `relationship_name_is_not_blank` keeps a blank name out of the table.
- Tests: `tests/domain/inbound-keywords.test.ts` (*a named group, in a keyword text*), `tests/domain/check-in-copy.test.ts` (*how a text names a relationship*), `tests/domain/pausing-and-resuming.test.ts` (the Admin's resume), `tests/domain/invitation-copy.test.ts`, and `tests/integration/inbound-over-http.test.ts` (*names a named group by its name in a SWAP menu and its answer*), which posts a signed `SWAP` and then `2` to `/sms/inbound` from Hannah's number and reads the two texts back from `outbound_message`.

#### Decided

- **The Resume Message follows the rule for everyone in the relationship, on both routes.**
  The ticket lists *resume*, and the answer to a Leader's `RESUME` is the Resume Message itself; there is no separate acknowledgement.
  It is one message from one function, sent to both sides whether a Leader texted `RESUME` or an Admin pressed Resume, so naming the group only in the texted case, or only to the Leader, would name one group two ways depending on who pressed what.
  So a Disciple in Tuesday Women's now reads *Your discipleship with Tuesday Women's has been resumed!* where they read *Your discipleship with Grace Lee has been resumed!*, and an Admin's Resume on Care Needed sends the same.
  The alternative, the group's name to its Leaders only and the Leaders' names to its Disciples, is two call sites in `boundary.ts`.
- No other wording changed.
  A one-to-one and an unnamed group compose exactly as before; the Emily Davis and Hannah Brooks lines below are identical before and after.
- The over-HTTP test was not run red first: the shared test lock was held by a three-times whole-suite run from another checkout.
  The domain tests were red first (seven failures, all the old names) and went green with the change.
- Verified: `scripts/locked-tests.sh`, the whole suite once with a server, `Test Files 194 passed (194)`, `Tests 2867 passed | 1 skipped (2868)`, no skipped files; the one skipped test is the standing `it.skip` in `tests/integration/invitation-over-http.test.ts`.
  `npx vitest run tests/domain tests/app`: 83 files, 1702 tests passed.
  `npm run typecheck` is clean; `package.json` has no lint script.

#### For James

1. **The Resume Message to a group's Disciples**, above: they now read the group's name rather than their Leader's.
   Say if you would rather they kept *Grace Lee*.
2. **An unnamed group still reads *1. Grace Lee 2. Grace Lee*** from somebody who is also discipled one to one by its Leader, because an unnamed group is named by its people, as the ticket says it should be.
   Only a group formed before groups had names can be unnamed.
   Naming it on its Intake form is the fix, and nothing here changes that.
3. Not changed, only noticed: the *pause applied* text has always carried an em dash after *Done*.
   It is existing wording, so it is left alone.

#### The texts, before and after

Composed by `handleCommand` itself, on the parent commit and on this branch, for Riverside Chapel: Grace Lee leads Emily Davis and Hannah Brooks one to one, and the group Tuesday Women's (Hannah Brooks, Lily Evans).
The rates line is shown as composed; the once-a-month rule leaves it off at send for somebody who has already had it that month.
The weekly check-in's opening question already read *Did you meet with Tuesday Women's this week?* and is unchanged.

#### Grace texts PAUSE

Before:

```text
[to Grace] Riverside Chapel: Which check-ins would you like to pause? 1. Emily Davis 2. Hannah Brooks 3. Hannah Brooks and Lily Evans
```

After:

```text
[to Grace] Riverside Chapel: Which check-ins would you like to pause? 1. Emily Davis 2. Hannah Brooks 3. Tuesday Women's
```

#### Grace replies "3" to that menu

Before:

```text
[to Grace] Riverside Chapel: Pause check-ins with Hannah Brooks and Lily Evans for 2 weeks? Reply YES to confirm, or reply 1, 4, 8, or 12 for a different number of weeks.
```

After:

```text
[to Grace] Riverside Chapel: Pause check-ins with Tuesday Women's for 2 weeks? Reply YES to confirm, or reply 1, 4, 8, or 12 for a different number of weeks.
```

#### Grace replies YES to the confirmation

Before:

```text
[to Grace] Riverside Chapel: Done — your check-ins about Hannah Brooks and Lily Evans are paused for 2 weeks. Reply RESUME any time to start them again sooner.
```

After:

```text
[to Grace] Riverside Chapel: Done — your check-ins about Tuesday Women's are paused for 2 weeks. Reply RESUME any time to start them again sooner.
```

#### Grace texts RESUME, all three paused

Before:

```text
[to Grace] Riverside Chapel: Which check-ins would you like to restart? 1. Emily Davis 2. Hannah Brooks 3. Hannah Brooks and Lily Evans
```

After:

```text
[to Grace] Riverside Chapel: Which check-ins would you like to restart? 1. Emily Davis 2. Hannah Brooks 3. Tuesday Women's
```

#### Grace texts RESUME, only Tuesday Women's paused (the Resume Message, to everyone in it)

Before:

```text
[to Grace] Riverside Chapel: Your discipleship with Hannah Brooks and Lily Evans has been resumed! Msg & data rates may apply. Reply STOP to opt out, HELP for help.
[to Hannah] Riverside Chapel: Your discipleship with Grace Lee has been resumed! Msg & data rates may apply. Reply STOP to opt out, HELP for help.
[to Lily] Riverside Chapel: Your discipleship with Grace Lee has been resumed! Msg & data rates may apply. Reply STOP to opt out, HELP for help.
```

After:

```text
[to Grace] Riverside Chapel: Your discipleship with Tuesday Women's has been resumed! Msg & data rates may apply. Reply STOP to opt out, HELP for help.
[to Hannah] Riverside Chapel: Your discipleship with Tuesday Women's has been resumed! Msg & data rates may apply. Reply STOP to opt out, HELP for help.
[to Lily] Riverside Chapel: Your discipleship with Tuesday Women's has been resumed! Msg & data rates may apply. Reply STOP to opt out, HELP for help.
```

#### Hannah texts SWAP

Before:

```text
[to Hannah] Riverside Chapel: Which one would you like us to look at? 1. Grace Lee 2. Grace Lee
```

After:

```text
[to Hannah] Riverside Chapel: Which one would you like us to look at? 1. Grace Lee 2. Tuesday Women's
```

#### Hannah replies "the group" to that menu

Before:

```text
[to Hannah] Riverside Chapel: Sorry, we didn't catch that. 1. Grace Lee 2. Grace Lee
```

After:

```text
[to Hannah] Riverside Chapel: Sorry, we didn't catch that. 1. Grace Lee 2. Tuesday Women's
```

#### Hannah replies "2" to that menu

Before:

```text
[to Hannah] Riverside Chapel: Thanks for letting us know about Grace Lee. We've passed this on and someone will be in touch. Nothing changes in the meantime.
```

After:

```text
[to Hannah] Riverside Chapel: Thanks for letting us know about Tuesday Women's. We've passed this on and someone will be in touch. Nothing changes in the meantime.
```

#### Lily texts SWAP (Tuesday Women's is all she holds)

Before:

```text
[to Lily] Riverside Chapel: Thanks for letting us know about Grace Lee. We've passed this on and someone will be in touch. Nothing changes in the meantime.
```

After:

```text
[to Lily] Riverside Chapel: Thanks for letting us know about Tuesday Women's. We've passed this on and someone will be in touch. Nothing changes in the meantime.
```

#### An Admin resumes Tuesday Women's from Care Needed

Before:

```text
[to Grace] Riverside Chapel: Your discipleship with Hannah Brooks and Lily Evans has been resumed! Msg & data rates may apply. Reply STOP to opt out, HELP for help.
[to Hannah] Riverside Chapel: Your discipleship with Grace Lee has been resumed! Msg & data rates may apply. Reply STOP to opt out, HELP for help.
[to Lily] Riverside Chapel: Your discipleship with Grace Lee has been resumed! Msg & data rates may apply. Reply STOP to opt out, HELP for help.
```

After:

```text
[to Grace] Riverside Chapel: Your discipleship with Tuesday Women's has been resumed! Msg & data rates may apply. Reply STOP to opt out, HELP for help.
[to Hannah] Riverside Chapel: Your discipleship with Tuesday Women's has been resumed! Msg & data rates may apply. Reply STOP to opt out, HELP for help.
[to Lily] Riverside Chapel: Your discipleship with Tuesday Women's has been resumed! Msg & data rates may apply. Reply STOP to opt out, HELP for help.
```
