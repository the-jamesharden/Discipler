# Discipler — The Check-In Rhythm

The working product model for Discipler's recurring text-message rhythm. Twilio is the delivery vendor; it is not part of this model. Items marked **OPEN** are unresolved and must not be implemented by inference.

## Who answers

Only leaders answer check-ins. Participants receive messages but are never asked questions, and no participant reply is interpreted as a check-in response.

This is a V1 scope decision, not a permanent one. A ministry may later ask for participant check-ins, so nothing in the model may assume that a relationship has exactly one respondent, and no response record may be keyed to the relationship alone rather than to the person who sent it.

## One sequence per leader

A leader who leads several relationships does not receive several separate conversations. All of their check-ins arrive on the same day, at the same time, as a **single sequential exchange in one thread**.

Relationships are asked in a stable order: earliest joined first, most recently joined last.

```text
Leader has 2 relationships (a 1:1 joined in March, a group joined in June)

Discipler → "Did you meet with Emily this week? Reply 1 for yes, 2 for no."
Leader    → 1
Discipler → "How did the meeting go? Reply A for outstanding, B for good, C for concern."
Leader    → C
Discipler → "Please tell me more about the concern."
Leader    → (free text)
Discipler → "Did you meet with Tuesday Men's Group this week? Reply 1 for yes, 2 for no."
Leader    → 1
Discipler → "How did the meeting go? Reply A for outstanding, B for good, C for concern."
Leader    → A
Discipler → "Thank you. I'll check in with you next week."
```

The closing thank-you is sent only after the leader's **final** relationship. Where a thank-you would otherwise fall, Discipler sends the next relationship's opening question instead.

## One template, substituted

There is one question set. It does not branch on group-versus-one-to-one — only the name substituted into it changes: a participant's name when the relationship has one participant, the relationship's name when it has more. This follows directly from the relationship being the core primitive.

## Message set

| Message | When | Response required |
|---|---|---|
| Welcome Message | On completing intake | No |
| Invitation Link | When a relationship is created, to the leader | No |
| Starter Message | On acceptance, and on resume from pause | No |
| Check-in opening question | Weekly, per relationship, in sequence | Yes |
| Satisfaction question | After a `1` reply | Yes |
| Concern detail request | After a `C` reply | Yes |
| Closing thank-you | After the final relationship | No |
| Next-day reminder | One day after an unanswered question | Re-send only |

The next-day reminder re-sends the same question. It never counts as a second unanswered message and never advances the two-week stall threshold.

Opt-out and rate-disclosure language appears on every Starter Message, and on the first check-in of each calendar month.

## Care thresholds

A relationship becomes **Stalled** on either of two conditions: two consecutive weekly check-ins with no response, or three consecutive `2` replies. The second catches a leader who answers every week to say they did not meet — fully responsive, never silent, and quietly going nowhere. The care item names which condition fired. A `C` response places it in **Needs Care** for that week, and it returns to **Healthy** on the next week that reports a meeting with no concern. A concern raises a badge that persists independently of state until an admin resolves it.

A relationship in **Awaiting Leader Acceptance** sends no check-ins and accrues no silence.

A relationship in **Paused** is skipped in its leader's sequence for the duration of the pause and accrues no silence either. `Paused` masks whatever state the relationship would otherwise derive; the pause suppresses new check-ins but does not answer old ones. On resume the underlying state resurfaces, so a relationship that was **Stalled** when it was paused is **Stalled** again and stays there until an answered check-in clears it. Resuming never sets **Healthy** on its own.

## When a leader stops replying mid-sequence

The sequence advances only in response to a reply, so a leader who goes quiet after the second question leaves every later relationship unasked — no unanswered question exists against them, and without a rule they would sit invisible forever. Discipler therefore does not wait indefinitely.

Twenty-four hours after an unanswered question, Discipler re-sends it once. If that reminder also goes unanswered, the sequence moves on to the next relationship's opening question. An abandoned sequence converts into ordinary unanswered questions, and the two-week stall rule handles it per relationship with no special case.

The same rule applies to the concern detail request: the `C` is already recorded and the badge already raised, so an unanswered request for detail is reminded once and then passed over rather than blocking the rest of the leader's relationships.

A `2` reply ends that relationship's check-in immediately and moves to the next one. The satisfaction question is not asked, because a meeting that did not happen has no quality to report.

If a new week's check-in comes due while a sequence is still open, the old sequence is abandoned and a fresh one begins. Its unanswered questions remain unanswered in the history. Two sequences never run against the same leader at once.

## Replies that do not match

Real people text `yes`, `Yes we did!`, `y`, `nope`, `great`, and emoji. Discipler normalizes generously before deciding a reply is unusable: matching is case-insensitive, tolerates surrounding text, and accepts the obvious synonyms — `yes`/`y`/`yeah` for 1, `no`/`n`/`nope` for 2, `great` for A, `good` for B.

What cannot be normalized gets a clarifying re-prompt naming the valid replies. **Discipler sends at most two clarifications per question**, then stops re-prompting — but it does not stop listening. A valid reply arriving after the second clarification is still accepted, right up until the sequence advances past that question. The person is never locked out; only Discipler's side of the conversation is capped, which keeps a leader with two typos from being dropped without spending a leader's patience or the ministry's message budget.

Sentiment is never inferred from free text. `we met but it was rough` is not a B. The one place free text is fully valid is the concern detail request, where prose is the point.

## Keywords

Keywords are read before a reply is interpreted as a check-in answer.

`STOP` is the carrier-level opt-out and is unchanged: it stops all messaging to that person. The documented `START` re-opt-in that reverses it is preserved as it stands.

`PAUSE`, `START`, and `SWAP` act on a single relationship, not on the person:

| Keyword | Effect |
|---|---|
| `PAUSE` | Moves that relationship to **Paused** immediately for 1, 2, 4, 8, or 12 weeks, defaulting to 2. No admin approval. |
| `START` | Resumes that paused relationship immediately and releases the Starter Message. No admin approval. Because the pause has ended, no expiry follow-up item is ever raised for it. |
| `SWAP` | Records a request against that relationship and raises a follow-up item for the admin. Changes no state and moves nobody. |

**OPEN** — How an inbound keyword identifies *which* relationship it applies to. A leader may lead several; `PAUSE`, `START`, and `SWAP` are each scoped to one of them; and an inbound message carrying only a keyword does not say which. The sequence position that disambiguates a check-in reply is unavailable here, because `START` and `SWAP` normally arrive with no open sequence at all. `PAUSE` carries a second gap: there is no defined way for a leader to choose among the five durations over SMS. No selection or routing mechanism is defined, and none may be inferred.

**OPEN** — `START` carries two meanings. `docs/reference/mentor-experience.md` and `docs/reference/mentee-experience.md` define it as the carrier-level re-opt-in that reverses `STOP` and restores all messaging to a person; it is also the keyword that resumes one paused relationship. For a person who has opted out and also holds a paused relationship, the two readings collide. The carrier behavior is preserved and must not be deleted to accommodate the resume keyword. Note also that `docs/consent-language.md` advertises only `STOP` and `HELP`, so the carrier `START` behavior has never been adopted into a canonical document.

## Open questions

**OPEN** — Retention and visibility rules for raw concern text.
