# 03 - Four answers, A to D

**What to build:** The satisfaction question gets four answers instead of three, so there is no middle answer to default to: A outstanding, B good, C okay, D concern.
Only D is a concern.
Every screen that counts the answers counts all four from the day this ships.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *A-D ratings*.
Today: the copy is in `src/domain/outbound-copy.ts`, the tokens and reading in `src/domain/check-in.ts` (`Satisfaction`, `readCheckInReply`), and the stored values are fixed in the schema, so this needs a migration.

**Blocked by:** nothing

**Status:** ready-for-agent

## Acceptance

- [ ] The satisfaction question reads exactly: *How did the meeting go? Reply A for outstanding, B for good, C for okay, D for concern.* (with the ministry prefix and every envelope rule as today).
- [ ] A clarification after an unreadable reply names A, B, C or D.
- [ ] D, and only D, draws *Please tell us more about the concern.*, raises the concern badge and puts the relationship in Needs Care for the week, as C does today.
- [ ] C okay is recorded, raises nothing and changes no state.
- [ ] *ok* and *okay* read as C; *concern* and its known typo read as D; *great* and *good* keep reading as A and B. Whole-message matching (ADR 0003) is unchanged.
- [ ] **A reply is read against the wording its question was sent with.** A three-answer question sent before the change and answered *C* after it records a concern, raises the badge and asks for detail, proven by a test that sends the old question, ships the change, then replies.
- [ ] Stored answers keep their meaning: no existing row is rewritten, and a stored concern stays a concern.
- [ ] Quality rate is (outstanding + good) / rated, and okay counts against it, on Overview and in Quick Stats.
- [ ] The Check-In Ratings donut has four slices, A green, B light green, C yellow, D red, in today's chart style, with a legend naming all four.
- [ ] Check-Ins has four columns. C okay lists its relationships as A and B do; D concern is sealed exactly as concern is today, count and *Go to Follow-Up* included.
- [ ] The meeting question and its 1/2 answers are untouched.
- [ ] Check-Ins' stat tiles and column lists sit flush with their column heads: today `.card ul` indents `ul.ci-stats` and `ul.ci-list` by 1.2rem (found 2026-10-12 while mocking this page).
- [ ] `docs/check-in-rhythm.md`, `docs/pastor-dashboard.md`, `docs/product-rules.md` (*What the Satisfaction Tokens Store* and every rule that names A, B and C) and `CONTEXT.md` say four answers, and the reversal is written down so nobody restores three.
- [ ] The new wording is seen on a real phone before release, as every text change is.
- [ ] Checked by eye in a real browser: Overview's donut and Quick Stats, and Check-Ins, with at least one answer of each letter, at desktop and phone width.

## Not in this ticket

- The D column listing its pairs by name and opening the pair card. That is ticket 09. There is no summary strip: James kept today's layout in the Lavish review of 2026-10-12.
