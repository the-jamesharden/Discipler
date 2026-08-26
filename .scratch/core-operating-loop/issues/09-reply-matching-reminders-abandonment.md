# 09 — Generous replies, reminders, and abandonment

**What to build:** A Leader's replies are understood when they type "yes" instead of "1", a typo does not cost them the week, and a forgotten text is recoverable — while a reply that means the opposite of what it looks like is never read backwards.

Matching is against an enumerated list of tokens, synonyms, and known typos, case-insensitively: `yes`/`y`/`yeah`, `no`/`n`/`nope`, `great`/`gret`, `good`, `concern`/`oncern`. **Matching is whole-message, not substring** — punctuation, emoji, and a closed list of leading and trailing pleasantries are stripped first, and anything not then resolving to exactly one token is unreadable. See `docs/adr/0003-whole-message-reply-matching.md` for why: under substring matching, "it wasn't great" resolves to outstanding and silently converts a relationship that needs care into a healthy one. The closed strippable list must never contain a fragment that inverts meaning when removed. A reply carrying two answers is unreadable, because accepting it would record a satisfaction rating for a meeting nobody confirmed happened.

Sentiment is never inferred from free text. The Concern detail step accepts anything, because prose is the point.

An unreadable reply gets a clarification naming the valid replies — at most **two** per question. After that Discipler stops re-prompting but does not stop listening: a valid reply is still accepted right up until the sequence advances past that question. The Leader is never locked out; only Discipler's side is capped.

An unanswered question is re-sent once after twenty-four hours. The reminder never counts as a second unanswered message and never advances the stall threshold. If the reminder also goes unanswered the sequence advances to the next relationship, converting abandonment into ordinary unanswered questions with no special case. The same applies to an unanswered Concern detail request — the concern is already recorded and the badge already raised.

If a new week comes due while a sequence is open, the old sequence is abandoned and its unanswered questions remain unanswered in history. Two sequences never run for one Leader at once. A late reply attaches to the question it answers and never rewrites an earlier week as answered.

Every unreadable reply is recorded, so the enumerated list can later be extended from typos that actually happened.

**Blocked by:** 08

**Status:** ready-for-agent

- [ ] Matching is a pure function tested against a table including `yes`, `Yes we did!`, `y`, `nope`, `gret`, and emoji
- [ ] That table proves `it wasn't great`, `no concerns`, `we didn't meet`, and `1 and it was great` are all unreadable
- [ ] At most two clarifications per question, after which a valid reply is still accepted until the sequence advances
- [ ] An unanswered question is re-sent once at twenty-four hours and the reminder does not count as unanswered
- [ ] An unanswered reminder advances the sequence to the next relationship
- [ ] An unanswered Concern detail request is reminded once then passed over, leaving the concern and badge intact
- [ ] A new week abandons an open sequence without rewriting its history
- [ ] A late reply attaches to the question it answers
- [ ] Unreadable replies are recorded in history
