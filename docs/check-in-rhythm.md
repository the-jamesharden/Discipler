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

→ "ABC Church: Did you meet with Emily this week? Reply 1 for yes, 2 for no."
Leader → 1
→ "ABC Church: How did the meeting go? Reply A for outstanding, B for good, C for concern."
Leader → C
→ "ABC Church: Please tell us more about the concern."
Leader → (free text)
→ "ABC Church: Did you meet with Tuesday Men's Group this week? Reply 1 for yes, 2 for no."
Leader → 1
→ "ABC Church: How did the meeting go? Reply A for outstanding, B for good, C for concern."
Leader → A
→ "ABC Church: Thank you. We'll check in with you next week."
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

Opt-out and rate-disclosure language appears on every Starter Message, and on the first check-in of each calendar month. **The monthly rule applies to leaders only**, because only leaders receive check-ins. A participant receives that language on the Starter Message and again on the first message following a silence gap of thirty days — a reassignment, a resumed relationship, anything that breaks a month of quiet.

## Voice and envelope

Every message is the ministry speaking. Discipler is the delivery mechanism and never the speaker: it does not name itself in message copy, and no message is phrased as reporting to a third party about the ministry. A participant should feel they are interacting with their church, not with a vendor layered between them and their ministry.

Every message carries the ministry name as a prefix, without exception — menus, confirmations, reminders, and acknowledgements included.

The one exception to Discipler naming itself is A2P compliance, which requires identifying the service carrying the message. `Discipler:` stacks in front of the ministry prefix on opt-in messaging, on the first message ever sent to a person, on the first message after a silence gap, and on the `HELP` response. The two prefixes stack rather than substitute because they answer different questions — who is speaking, and what is delivering it.

See `docs/product-rules.md` for the full rule and the standing caveat that A2P requirements have not been checked against a live campaign registration.

## Care thresholds

A relationship becomes **Stalled** on either of two conditions: two consecutive weekly check-ins with no response, or three consecutive `2` replies. The second catches a leader who answers every week to say they did not meet — fully responsive, never silent, and quietly going nowhere. The care item names which condition fired, and reports a duration in the unit that matches it: **gone silent** reports days since last contact, **responding, not meeting** reports the number of weeks reported as no meeting. The two cannot share a counter — days since last contact is already fourteen or more when silence fires and roughly seven when not-meeting fires, so a shared counter would make a relationship going nowhere for three weeks look more recent than one silent for a fortnight. A `C` response places it in **Needs Care** for that week, and it returns to **Healthy** on the next week that reports a meeting with no concern. A concern raises a badge that persists independently of state until an admin resolves it.

A relationship in **Awaiting Leader Acceptance** sends no check-ins and accrues no silence.

A relationship in **Paused** is skipped in its leader's sequence for the duration of the pause and accrues no silence either. `Paused` masks whatever state the relationship would otherwise derive; the pause suppresses new check-ins but does not answer old ones. On resume the underlying state resurfaces, so a relationship that was **Stalled** when it was paused is **Stalled** again and stays there until an answered check-in clears it. Resuming never sets **Healthy** on its own.

## When a leader stops replying mid-sequence

The sequence advances only in response to a reply, so a leader who goes quiet after the second question leaves every later relationship unasked — no unanswered question exists against them, and without a rule they would sit invisible forever. Discipler therefore does not wait indefinitely.

Twenty-four hours after an unanswered question, Discipler re-sends it once. If that reminder also goes unanswered, the sequence moves on to the next relationship's opening question. An abandoned sequence converts into ordinary unanswered questions, and the two-week stall rule handles it per relationship with no special case.

The same rule applies to the concern detail request: the `C` is already recorded and the badge already raised, so an unanswered request for detail is reminded once and then passed over rather than blocking the rest of the leader's relationships.

A `2` reply ends that relationship's check-in immediately and moves to the next one. The satisfaction question is not asked, because a meeting that did not happen has no quality to report.

If a new week's check-in comes due while a sequence is still open, the old sequence is abandoned and a fresh one begins. Its unanswered questions remain unanswered in the history. Two sequences never run against the same leader at once.

## Replies that do not match

Real people text `yes`, `Yes we did!`, `y`, `nope`, `great`, and emoji. Discipler normalizes before deciding a reply is unusable: matching is case-insensitive and accepts an enumerated list of synonyms and known typos — `yes`/`y`/`yeah` for 1, `no`/`n`/`nope` for 2, `great`/`gret` for A, `good` for B, `concern`/`oncern` for C.

**Matching is against the whole message, not a substring of it.** Punctuation, emoji, and a closed list of leading and trailing pleasantries are stripped first, so `Yes we did!` still resolves; anything else is unreadable and draws a clarification.

This replaces an earlier rule that matching "tolerates surrounding text." Under a substring search, `it wasn't great` contains `great` and resolves to **A, outstanding** — silently converting a relationship that needs care into a healthy one. `no concerns` contains both `no` and `concern`. Sentiment is never inferred from free text, and a substring search over a sentence is exactly that inference. The closed strippable list must never contain a fragment that inverts meaning when removed: `we didn't` is part of a token, never a wrapper.

A reply carrying two answers — `1 and it was great` — is unreadable. Accepting it would advance two steps on one message, letting a leader skip past the meeting question without being asked it and recording a satisfaction rating for a meeting nobody confirmed happened.

Every unreadable reply is recorded. Extending the enumerated list from observed pilot typos is deferred, not rejected.

What cannot be normalized gets a clarifying re-prompt naming the valid replies. **Discipler sends at most two clarifications per question**, then stops re-prompting — but it does not stop listening. A valid reply arriving after the second clarification is still accepted, right up until the sequence advances past that question. The person is never locked out; only Discipler's side of the conversation is capped, which keeps a leader with two typos from being dropped without spending a leader's patience or the ministry's message budget.

Sentiment is never inferred from free text. `we met but it was rough` is not a B. The one place free text is fully valid is the concern detail request, where prose is the point.

## Keywords

Keywords are read before a reply is interpreted as a check-in answer.

The keyword set is `STOP`, `HELP`, `PAUSE`, `RESUME`, and `SWAP`.

`STOP` is the carrier-level opt-out and is unchanged: it stops all messaging to that person. `START` is the carrier-level re-opt-in that reverses it, exactly as `docs/reference/` documents, and carries **no** relationship-level meaning — `START` is a carrier-reserved word that carriers and the delivery vendor act on before Discipler's webhook is consulted, so building domain behavior on it would rest on vendor configuration that may have to change. `HELP` returns the full keyword list.

`PAUSE`, `RESUME`, and `SWAP` act on a single relationship, not on the person:

| Keyword | Effect |
|---|---|
| `PAUSE` | Moves that relationship to **Paused** immediately for 1, 2, 4, 8, or 12 weeks, defaulting to 2. No admin approval. |
| `RESUME` | Resumes that paused relationship immediately and releases the Starter Message. No admin approval. Because the pause has ended, no expiry follow-up item is ever raised for it. |
| `SWAP` | Records a request against that relationship and raises a follow-up item for the admin. Changes no state and moves nobody. |

### Which relationship a keyword applies to

Discipler resolves the target by **eligibility for the requested action**: exactly one eligible relationship means the command applies to it directly; more than one draws a numbered menu; none draws a plain reply saying so.

`PAUSE` considers active, unpaused relationships. `RESUME` considers paused ones only. `SWAP` considers all live relationships, including `Paused` and including `Awaiting Leader Acceptance`, where it reads as a decline. Because eligibility is per command, a leader with three relationships of which one is paused resolves a `RESUME` with no menu at all.

**The target is never inferred from Check-In Sequence position.** That position disambiguates a check-in answer; borrowing it here would make keywords behave differently depending on whether a sequence happened to be open, which a leader cannot predict.

### Choosing a pause duration

`PAUSE` draws a single confirmation carrying the default and the alternatives — *"Pause check-ins with Emily for 2 weeks? Reply YES to confirm, or reply 1, 4, 8, or 12 for a different number of weeks."* Both written and numeric forms are accepted. The confirmation is also the accidental-tap protection, and the common case costs a leader two texts.

### When a keyword and a check-in question are both open

**The most recent prompt owns the next reply.** A keyword exchange opened mid-sequence takes it; the check-in question stays unanswered with its next-day reminder clock still running.

At most one keyword exchange is open per person; a second keyword replaces the first. An unanswered exchange expires after twenty-four hours **with no reminder** — a check-in question is Discipler's question and is worth re-sending once, while re-prompting a leader about a request they abandoned is nagging. Expiry raises nothing.

Clarifications inside a keyword exchange follow the same cap as a check-in: at most two, then Discipler stops re-prompting but keeps listening until expiry.

A keyword that resolves to the relationship whose check-in question is currently open **withdraws that pending question**. Leaving it to age would make pausing a relationship contribute to it being flagged `Stalled` on resume, which is what the pause rules exist to prevent.

A bare, exact keyword is still a keyword during the concern detail request. The `C` is already recorded and the badge already raised, so nothing is lost, and the alternative files `PAUSE` as the text of someone's hardest week while ignoring a request to step back. Prose containing the word is unaffected, because matching is whole-message.

### Inbound messages from participants

Participants have no dashboard and no account, so texting back is their only channel. A recognized keyword from a participant is acknowledged and raised as an admin follow-up item. Unrecognized free text draws one acknowledgement pointing them to their ministry, rate-limited, raising no item — an item for every "thanks!" would bury the Care Needed view.

## Open questions

**OPEN** — Retention and visibility rules for raw concern text.
