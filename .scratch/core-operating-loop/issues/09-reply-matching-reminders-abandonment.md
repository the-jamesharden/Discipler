# 09 — Generous replies, reminders, and abandonment

**What to build:** A Leader's replies are understood when they type "yes" instead of "1", a typo does not cost them the week, and a forgotten text is recoverable — while a reply that means the opposite of what it looks like is never read backwards.

Matching is against an enumerated list of tokens, synonyms, and known typos, case-insensitively: `yes`/`y`/`yeah`, `no`/`n`/`nope`, `great`/`gret`, `good`, `concern`/`oncern`. **Matching is whole-message, not substring** — punctuation, emoji, and a closed list of leading and trailing pleasantries are stripped first, and anything not then resolving to exactly one token is unreadable. See `docs/adr/0003-whole-message-reply-matching.md` for why: under substring matching, "it wasn't great" resolves to outstanding and silently converts a relationship that needs care into a healthy one. The closed strippable list must never contain a fragment that inverts meaning when removed. A reply carrying two answers is unreadable, because accepting it would record a satisfaction rating for a meeting nobody confirmed happened.

Sentiment is never inferred from free text. The Concern detail step accepts anything, because prose is the point.

An unreadable reply gets a clarification naming the valid replies — at most **two** per question. After that Discipler stops re-prompting but does not stop listening: a valid reply is still accepted right up until the sequence advances past that question. The Leader is never locked out; only Discipler's side is capped.

An unanswered question is re-sent once after twenty-four hours. The reminder never counts as a second unanswered message and never advances the stall threshold. If the reminder also goes unanswered the sequence advances to the next relationship, converting abandonment into ordinary unanswered questions with no special case. The same applies to an unanswered Concern detail request — the concern is already recorded and the badge already raised.

If a new week comes due while a sequence is open, the old sequence is abandoned and its unanswered questions remain unanswered in history. Two sequences never run for one Leader at once. A late reply attaches to the question it answers and never rewrites an earlier week as answered.

Every unreadable reply is recorded, so the enumerated list can later be extended from typos that actually happened.

**Blocked by:** 08a, 08b

**Status:** shipped

- [x] Matching is a pure function tested against a table including `yes`, `Yes we did!`, `y`, `nope`, `gret`, and emoji
- [x] That table proves `it wasn't great`, `no concerns`, `we didn't meet`, and `1 and it was great` are all unreadable
- [x] At most two clarifications per question, after which a valid reply is still accepted until the sequence advances
- [x] An unanswered question is re-sent once at twenty-four hours and the reminder does not count as unanswered
- [x] An unanswered reminder advances the sequence to the next relationship
- [x] An unanswered Concern detail request is reminded once then passed over, leaving the concern and badge intact
- [x] A new week abandons an open sequence without rewriting its history
- [x] A late reply attaches to the question it answers
- [x] Unreadable replies are recorded in history

## Comments

Implemented. Domain in `src/domain/check-in.ts` and `src/domain/boundary.ts`, copy in
`src/domain/outbound-copy.ts`, migration
`supabase/migrations/20260902000100_generous_replies_reminders_and_abandonment.sql`.
Tests: `tests/domain/generous-replies.test.ts` (the matching table),
`tests/domain/reminders-and-abandonment.test.ts` (the cap, the reminder, the
pass-over), plus integration coverage in `tests/integration/the-check-in-conversation.test.ts`
and `tests/integration/the-cadence.test.ts`.

Three things the ticket left open, resolved as follows.

**`Yes we did!` is a token, not a wrapper.** The ticket says pleasantries are
stripped and requires `Yes we did!` to be readable, which implies `we did` in the
strippable list. That fragment carries polarity: `no we did` would strip to `no`
and record the opposite of what the Leader said -- exactly the failure ADR-0003
exists to prevent. So `we did`, `yes we did`, `we didnt` and `no we didnt` are
entries in the token table instead, and the strippable list holds only
polarity-free courtesies (`hi`, `hey`, `hello`, `ok`, `okay`, `thanks`,
`thank you`, `please`, `sorry`). This makes "must never contain a fragment that
inverts meaning when removed" an invariant of the list rather than a rule a
reviewer has to remember, and it is the same treatment ADR-0003 gives
`we didn't`: part of a token, never a wrapper.

**Passing over the *last* relationship.** The ticket says the sequence advances to
the next relationship; it does not say what happens when there is none. The
sequence closes as `abandoned` with no thank-you. `completed` would be false --
the Leader did not answer -- and the thank-you is how a Leader knows they finished
a conversation they did not finish. `abandoned` is the existing outcome for a
sequence whose unanswered questions stay unanswered, which is what this is; its
history event carries `reason: 'unanswered'`, distinguishing it from the
displaced-by-a-new-week and opted-out cases.

**An emoji on its own is unreadable.** The ticket names `emoji` in the same
sentence as `yes`, `y` and `nope`, which reads as a requirement that one be
readable; it is the only item in that list with no polarity of its own. Confirmed
unreadable. ADR-0003 already strips emoji before matching, and reading a bare 👍
as a yes would be inferring sentiment from free text -- the one thing the
enumerated list exists to avoid. So `yes 👍` is readable because `yes` survives
the strip, and `👍` alone strips to nothing and stays nothing. Both are rows in
the table in `tests/domain/generous-replies.test.ts`.

A Leader who sends only 👍 gets a clarification while one is left under the cap,
and a `checkin.reply_unreadable` event either way -- which is the ticket's own
mechanism for revisiting this if 👍 turns out to be what Leaders actually send.

**How long after the reminder before the sequence moves on** was not open after
all: `docs/product-rules.md` ("Settled: What *Timed Out* Means, Per Prompt Kind")
states forty-eight hours from the original send -- twenty-four to the reminder,
twenty-four more before the sequence advances -- for a check-in question and for a
Concern detail request alike, and timed out immediately when a new week's sequence
begins. The implementation matches, measuring the second interval from the
reminder rather than from the question so that a tick which runs late cannot spend
both clocks at once and pass over a question the Leader was never reminded about.

The strippable list and the token list are both deliberately minimal. The ticket's
own mechanism for growing them is the `checkin.reply_unreadable` history event,
which records the body verbatim.

### Shipped — status line corrected 2026-08-31

All nine criteria were met when the work landed and the status line was left at
`ready-for-agent`. Verified before flipping it: `generous-replies.test.ts` (54 tests)
and `reminders-and-abandonment.test.ts` (37 tests) pass. Every question this ticket
raised is settled in the comments above; none was left for a human.
