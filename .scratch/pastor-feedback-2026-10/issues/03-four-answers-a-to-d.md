# 03 - Four answers, A to D

**What to build:** The satisfaction question gets four answers instead of three, so there is no middle answer to default to: A outstanding, B good, C okay, D concern.
Only D is a concern.
Every screen that counts the answers counts all four from the day this ships.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *A-D ratings*.
Today: the copy is in `src/domain/outbound-copy.ts`, the tokens and reading in `src/domain/check-in.ts` (`Satisfaction`, `readCheckInReply`), and the stored values are fixed in the schema, so this needs a migration.

**Blocked by:** nothing

**Status:** ready-for-agent

## Acceptance

- [x] The satisfaction question reads exactly: *How did the meeting go? Reply A for outstanding, B for good, C for okay, D for concern.* (with the ministry prefix and every envelope rule as today). (ff4c3f4)
- [x] A clarification after an unreadable reply names A, B, C or D. (ff4c3f4)
- [x] D, and only D, draws *Please tell us more about the concern.*, raises the concern badge and puts the relationship in Needs Care for the week, as C does today. (ff4c3f4, 424548a)
- [x] C okay is recorded, raises nothing and changes no state. (ff4c3f4, 424548a)
- [x] *ok* and *okay* read as C; *concern* and its known typo read as D; *great* and *good* keep reading as A and B. Whole-message matching (ADR 0003) is unchanged. (ff4c3f4)
- [x] **A reply is read against the wording its question was sent with.** A three-answer question sent before the change and answered *C* after it records a concern, raises the badge and asks for detail, proven by a test that sends the old question, ships the change, then replies. (73d86ba, ff4c3f4, proven in 424548a)
- [x] Stored answers keep their meaning: no existing row is rewritten, and a stored concern stays a concern. (73d86ba)
- [x] Quality rate is (outstanding + good) / rated, and okay counts against it, on Overview and in Quick Stats. (ff4c3f4, 424548a)
- [x] The Check-In Ratings donut has four slices, A green, B light green, C yellow, D red, in today's chart style, with a legend naming all four. (c294aed, ef3edd9)
- [x] Check-Ins has four columns. C okay lists its relationships as A and B do; D concern is sealed exactly as concern is today, count and *Go to Follow-Up* included. (c294aed)
- [x] The meeting question and its 1/2 answers are untouched. (ff4c3f4)
- [x] Check-Ins' stat tiles and column lists sit flush with their column heads: today `.card ul` indents `ul.ci-stats` and `ul.ci-list` by 1.2rem (found 2026-10-12 while mocking this page). (c294aed)
- [x] `docs/check-in-rhythm.md`, `docs/pastor-dashboard.md`, `docs/product-rules.md` (*What the Satisfaction Tokens Store* and every rule that names A, B and C) and `CONTEXT.md` say four answers, and the reversal is written down so nobody restores three. (e0118ca)
- [ ] The new wording is seen on a real phone before release, as every text change is.
- [x] Checked by eye in a real browser: Overview's donut and Quick Stats, and Check-Ins, with at least one answer of each letter, at desktop and phone width. (ef3edd9)

## Not in this ticket

- The D column listing its pairs by name and opening the pair card. That is ticket 09. There is no summary strip: James kept today's layout in the Lavish review of 2026-10-12.

## Comments

Decisions made while building, each the conservative reading, with the alternative not taken.

- **How a question remembers its wording.** Every `checkin_prompt` row now says which answers it offered, in a new `wording` column (`a_to_c` or `a_to_d`, migration `20261014000300_four_answers_a_to_d.sql`), and its reply is read against that.
  A row with no wording is read as `a_to_c`: that is every row from before the migration, and every row the old code goes on writing in the window between the migration being pushed and the deploy that follows it, all of which sent the three-answer question.
  The column is neither backfilled nor defaulted, so no existing row is rewritten and the old code's rows are not stamped with a wording they did not send.
  Not taken: deciding the wording from `asked_at` against a ship date, which reads the deploy window wrong; or a default, which mislabels one side of that window.
- **A reminder or a clarification of a question sent before the change offers the three answers it was sent with**, C for concern, because that is how its reply is read.
  Not taken: upgrading the open question to four answers when it is reminded, which would leave a reply to the first send and a reply to the reminder meaning different things.
- **`D`, `ok` and `okay` sent to a three-answer question are unreadable** and draw a clarification naming A, B and C.
  Not taken: reading `D` as concern there, a guess at what a question that never offered D was being told.
- **`ok` and `okay` stay pleasantries around another answer.** A message that is only `ok` is read as C; `ok good` is still B and `okay D` is D, as `ok yes` was already yes.
  This keeps ADR 0003 unchanged, as the ticket asks.
  Not taken: refusing `ok good` as two answers, which would change how the pleasantry list works for every question.
- **The satisfaction question after a meeting question sent before the change is the four-answer one.** It is a new question, sent after the change; the meeting question reads the same under both wordings.
- **The unreadable-reply history event records the wording**, so a `D` sent to a three-answer question reads back as the miss it was when the enumerated list is next extended.
- **Colours.** B's light green is `#a8d5b0`, the B of the Lavish mock-up of 2026-10-12, added as `--light-green-fit`; its column head is that green at a paler tint than A's head, because at the mock-up's tint it was indistinguishable from today's A head on screen.
  C takes today's yellow, slice and head, and D today's red.
- **The donut legends were indented by `.card ul` too**, the same rule the ticket names for Check-Ins: 1.2rem in from the figure above them, and on a phone that pushed the four-line Ratings legend under the ring.
  Fixed with them (`ul.donut-legend`), so both donuts keep their legend beside the ring at 390px.
- **The real-phone check is James's** and is left unticked.
  Four columns at desktop, two at 1100px and under, one at 720px and under.
- **The cross-change test** (`tests/integration/relationship-state-and-care.test.ts`, *is raised by a C to a three-answer question sent before the change*) sends the old question as the rows the old code wrote, because that code no longer exists to run: the `1` recorded, the satisfaction prompt inserted with the old `insert` and no wording, and the three-answer text queued.
  Everything after that is today's code, and the `C` is a concern with the badge, Needs Care and the detail request.
