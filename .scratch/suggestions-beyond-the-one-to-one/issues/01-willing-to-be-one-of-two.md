# 01 - Open to being one of two

**What to build:** One more question on Intake, asked of both sides: would you be discipled alongside one other person, and would you disciple two people together. Shown beside the person's name on both pairing surfaces, keeping nobody off either.

**Status:** ready-for-agent

## Why

The manual pairing screen can already form a 1:2, and ticket 02 teaches Suggested Pairs to propose one.
Nothing on Intake has ever asked anybody how they feel about it.

The answer is for the Admin making the pairing, not for the product.
It does not bind: an Admin sees it and decides (decided 2026-09-18, see the spec).

## The precedent to follow

`first_time` is this question's twin and the pattern is proven end to end:

- `intake_submission.first_time boolean`, nullable, where **null is *the form did not ask*** and never a quiet no (`src/service/ports.ts:844`).
- Answers carried as **words, not yes/no**. `EXPERIENCE_ANSWERS` is `['first_time', 'done_before']`, and `src/domain/intake.ts:120` explains why: a field spelled yes/no "would invert under exactly that wording, and a first-timer recorded as experienced is a mistake nothing downstream could notice."
- The question is **worded from the side** through a `Record<DeclaredSide, string>` (`app/intake/copy.ts:185`).
- `public.roster()` reads the latest submission **where the answer is not null**, so a later correction that does not ask cannot erase an answer already given.
- On the pairing surface it "ranks nobody and refuses nobody, which is what keeps it outside ADR-0001."

Follow all five.

## Acceptance

- Migration: `intake_submission.one_to_two <answer type>`, nullable, commented as null meaning the form did not ask and never a refusal.
- Answers carried as words rather than a boolean, following `EXPERIENCE_ANSWERS`, worded so the answer is legible without the question above it.
- The question is a `Record<DeclaredSide, string>` beside `firstTimeQuestion`:
  - **mentee** - would you be discipled alongside one other person?
  - **mentor** - would you disciple two people together?
- A step in the discipleship wizard beside the first-time step, carrying its answer forward as a hidden input like every other, per `app/intake/wizard-machine.ts`.
- **Not** added to `app/intake/form.tsx`, the correction form. That form does not ask the first-time question either, and the not-null read is what makes leaving it out safe.
- The boundary refuses an unanswered question on the path that asks it, with a refusal code and wording beside `intake.first_time_unanswered`.
- `public.roster()` widens by the answer, read as the latest not-null submission, and `RosterEntry` gains it, documented as shown by the pairing surfaces and read by nothing else.
- Shown on the manual pairing screen beside the name, exactly as the first-time note is.
  Both answers said outright, so a blank reads as *the form did not ask* rather than a quiet no.
- **Filters nobody and ranks nobody**, on either surface, for either side.
  A test proves a person who answered no is still listed on manual pairing.
- ADR-0001 is **not** amended. An answer that neither filters nor orders is not a suggestion input.
- `CONTEXT.md` names the answer and points at the boundary, stating no duration and no cap.
- Intake tests cover: each side's wording; an unanswered form refused on the path that asks; a correction submission leaving an earlier answer standing; a submission predating the question reading null everywhere.

## Sequencing

If `manual-pairing/04` is built first, it ships without this note and picks it up here: one line on the row, beside the first-time note.
If this is built first, `manual-pairing/04` carries it from the start.
Either order works.

## Comments

**2026-09-18, D2 decided.**
James: the 1:2 answer does not bind, and people appear on suggested and manual pairing whatever they answered.
This ticket was previously written as a filter on the 1:2 suggestion pool with an ADR-0001 amendment; both are removed.
The two open items it carried are closed: it binds nothing, so it binds manual pairing not at all; and the two sides keep their different wordings in one column.
Read as covering both sides, since the decision was said of everyone; the spec records that as an assumption.
Status moves to `ready-for-agent`.

**2026-09-22, James, the mentee side's wording.**
The question on the mentee side reads, in his words: *Open to being mentored alongside another mentee if needed*.
Use it as written, over the paraphrase in Acceptance.
It reads as a statement to agree with rather than a question, so the answer words should be legible beside a name on their own, as the ticket already asks.
The mentor side is not yet worded by him; the twin in the same shape would be *Open to mentoring two mentees together if needed*, and is a proposal until he says.
