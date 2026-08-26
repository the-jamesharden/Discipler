# Whole-Message Reply Matching

## Status

accepted

## Decision

An inbound check-in reply is matched against the **whole message**, after stripping punctuation, emoji, and a closed list of leading and trailing pleasantries. Anything that does not resolve to exactly one token is unreadable and draws a clarification.

This supersedes the earlier rule that matching "tolerates surrounding text."

## Context

Leaders answer by text, and real people write `yes`, `Yes we did!`, `y`, `nope`, `great`, and emoji. The rhythm was therefore specified to normalize generously, tolerating text around the token so that a natural reply is not punished.

Substring matching delivers that generosity and a serious defect with it. `it wasn't great` contains `great` and resolves to **A, outstanding**. `no concerns` contains both `no` and `concern`. `we didn't meet` contains `meet`.

The failure is not merely a wrong record. A misread negation converts a relationship that needs care into a healthy one, clears nothing that would be noticed, and produces no signal to anybody that it happened. The leader answered honestly, Discipler recorded the opposite, and the admin never finds out. The whole point of the check-in rhythm is to surface a fading relationship before it disappears, and this defect makes the rhythm confidently report the opposite of what it was told.

`docs/check-in-rhythm.md` also states that sentiment is never inferred from free text. A substring search over a sentence is exactly that inference, made without any of the care that rule was written to demand.

## Considered options

**Keep substring matching and add negation detection.** Rejected. Negation in English is not a word list — scope, distance, and idiom all matter, and `not bad` is a positive. Every rule added here is a rule that has to be right on someone's hardest week.

**Whole-message match with nothing stripped.** Rejected as too strict. It breaks the explicit promise the rhythm doc makes about `Yes we did!`, and a clarification for every naturally-worded reply spends a leader's patience on Discipler's rigidity.

**Bounded edit distance over the whole message.** Rejected for now. At distance two, `no` reaches `not`, `now`, `know`, and `so`; nearly every short English word is a neighbour of the two-character tokens. An enumerated list of synonyms and observed typos gives predictable coverage that can be extended from pilot data.

## Consequences

Some replies a human would read correctly are refused. This is the trade being made deliberately: a clarification costs one message, and a misread negation costs a relationship nobody knows is failing. **The failure mode is now visible rather than silent**, which is the property being bought.

The closed strippable list is load-bearing and must never contain a fragment that inverts meaning when removed. `we didn't` is part of a token, never a wrapper — stripping it from `yes we didn't` would produce the opposite of what was said. Any addition to that list needs the same scrutiny.

A reply carrying two answers is unreadable rather than helpful. Accepting `1 and it was great` would advance two steps on one message, letting a leader skip the meeting question and recording a satisfaction rating for a meeting nobody confirmed happened.

Unreadable replies are recorded in history, so the enumerated list can be extended from typos that actually occurred rather than ones that were imagined.
