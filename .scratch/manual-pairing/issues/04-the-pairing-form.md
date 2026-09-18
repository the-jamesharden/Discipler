# 04 - The pairing form

**What to build:** `/roster/pair` as the prototype draws it. The whole visible change lands here, on commands that already work.

**Blocked by:** 01, 02, 03

**Status:** ready-for-agent

## Why

Everything before this ticket was invisible.
This is the screen: `showPairModal` and `_updatePairSummary` from `discipler-dashboard (10).html` (lines 2163-2400), and the screenshot of the two-checked 1:2 state.

## Shape

A client component under `app/roster/pair/`, following the `import-dialog.tsx` precedent, with the server page keeping the data fetch and the form still posting to `/roster/pair/create`.
The route keeps its URL, its query-string preselection and its refusal round trip.

## Acceptance

### The card

- The card is styled as the prototype's modal: dimmed backdrop, centred, `max-width: 480px`, serif title reading `Pair {name}` where a Discipler is chosen and `Pair people` where none is, and a close control returning to the Roster.
- Below the title, the prototype's intro line, in the repository's words for the two sides.

### The Discipler

- Arriving with `leaderId` shows that person as a chosen-person header with avatar and name, and a Change control that reveals the Discipler list.
- Arriving with nothing opens with the Discipler list showing.
- Arriving with `with` preselects that person as a Disciple, as today.
- Several Disciplers stay possible through the revealed list.

### The Disciple list

- One row per candidate: hidden checkbox, `.pair-check` tick box, avatar initials from `app/initials.ts`, name, and `email · phone` beneath, each missing detail simply absent.
- The first-time note the page shows today is kept on the row.
- Checked rows take the selected treatment.
- The list scrolls at `34vh`, `22vh` when the group panel is open.
- A toolbar above it reads `N unpaired disciples` on the left and a single `Clear` on the right.
  **No Select all.**
- Candidates are not filtered. Everyone Intake has cleared and who has not opted out is listed, for the reason the current page comment gives.

### Gender

- The declaration is preselected from the chosen Discipler, and falls to Mixed where the chosen Disciplers do not share a gender.
- Disciples who do not match the current declaration are rendered **disabled, not hidden**, with the reason on the row.
- Choosing Mixed enables the whole list.
- In one-to-one shape Mixed is disabled unless `suggest_gender_match` is false for the Ministry, with the reason said in words.
- **A candidate whose gender is null is never disabled**, whatever the declaration.
  Both database triggers return early on a null gender on the stated grounds that the readiness rules will refuse the row with something the Admin can act on, and that answering "genders do not match" would send them looking for the wrong problem.
  The screen shows the same restraint.
- Unticking a Discipler, or changing the declaration, re-evaluates every row. A Disciple who was ticked and is now disabled is unticked, and the summary says so rather than dropping them silently.

### The mode control

- Hidden below two checked Disciples.
- Three segments: `1:2 pair`, `N x 1:1 pairs` with N counting live, `Group`.
- `1:2 pair` is disabled unless exactly two are checked, with the prototype's hint beneath.
- Untouched, the default is `1:2 pair` at two and `Group` at three or more; once the Admin picks a segment, their choice stands until it becomes impossible.
- `N x 1:1 pairs` posts `mode=separate` from ticket 03. The other two post `together`.

### The group panel

- Shown in `Group` mode, and in `1:2 pair` mode, because `kindFor(1, 2)` is `'group'` and the domain requires a name and a declaration of both.
- Carries: group name, the Material select from ticket 02, the declaration, and the join-approval switch.
- The name defaults to the prototype's `{First}'s Group` placeholder in `Group` mode, and in `1:2 pair` mode to the prototype's generated `{First} with {First} & {First}`, typed into the field rather than merely suggested, so the common path needs no typing.
- Hidden in `N x 1:1 pairs` mode except the Material select, which applies to each pairing formed.

### The summary and the button

- The four summary sentences of `_updatePairSummary`, in the repository's words for Discipler and Disciple.
- The button label counts: `Create 1:1 pair`, `Create 1:2 pair`, `Create N 1:1 pairs`, `Create group of N`, and reads `Pair` while nothing is checked.
- Disabled while nothing is checked.
- `Cancel` returns to the Roster.

### Refusals

- A refused submission returns to this form with the toast, the selection, the declaration, the name, the approval switch, the Material and the mode all restored, so an Admin corrects one choice rather than making all of them again.

### Styling and copy

- New classes in `public/discipler.css`, ported from the prototype: `.pair-option`, `.pair-check`, `.pair-list`, `.pair-toolbar`, `.pair-summary`, `.pair-mode`, `.pair-seg`, `.pair-group-fields`, plus a disabled row treatment the prototype does not have.
- `.modal` and `.seg-radio` already exist and are reused rather than duplicated.
- Every new string lives in `app/roster/copy.ts`, and `tests/app/pairing-copy.test.ts` is extended to cover them.

### Tests

- The three `tests/integration/pairing-*.test.ts` suites are extended for the new submissions.
- Each mode forms what its label said it would.
- The disabled rule is proven: a non-matching Disciple cannot be submitted, a null-gender candidate can, Mixed enables the list, and Mixed is unavailable in one-to-one shape while the Ministry enforces the match.

## For a human before this is picked up

**Why `ready-for-human`.**
The gender default is the one change here that touches a safeguarding rule.
`src/domain/boundary.ts:2130` argues that a default declaration "would be the product deciding a safeguarding question on the Admin's behalf", and preselecting from the Discipler is exactly that, mitigated by being visible and changeable before anything is formed.
The domain still refuses an unanswered group, so nothing is weakened underneath.
The question is whether the screen should be answering it at all.
That wants a decision from someone who owns the product rule, not an inference from this ticket.

**No JavaScript.**
The page works without script today and will not after this.
The route and its refusal round trip stay script-free, so a no-JS Admin can still post to it, but the screen itself will not render.
If that matters, the answer is a server-rendered fallback form, and it should be its own ticket rather than a quiet addition to this one.

## Comments

**2026-09-18, D1 decided.**
James: yes, the declaration defaults from the chosen Discipler.
The screen answering the question is accepted as a product decision, with the mitigations this ticket already requires: the declaration is visible, stated in words, changeable before anything is formed, and the domain still refuses an unanswered group.
The gender-default item under *For a human before this is picked up* is resolved; the no-JavaScript item stands as written.
Status moves to `ready-for-agent`.
