# A Ministry's Own Word Goes in Noun Position, and Names the Reader

## Status

accepted

## Decision

`leader_noun` and `participant_noun` are used in message copy under two rules, and every
message written from now on has to obey both.

**The word appears in noun position and never as a verb.** *"you've been matched with
someone to be their mentor"* — not *"someone to mentor"*.

**The word names the role of whoever is reading the message.** The Leader's Starter
Message calls the reader a `leader_noun`; the Participant's calls the reader a
`participant_noun`. Neither message uses the other side's word.

Three messages carry a noun today, and they are the only three that name a role at all:

- `invitationMessage` — *"David, you've been matched with someone to be their mentor.
  Have a look and let us know: …"*
- `starterMessageToLeader` — *"You're now Emily Johnson's mentor. We'll check in with you
  each week…"*
- `starterMessageToParticipant` — *"Great news! You're now David Ellis's mentee, and they
  will reach out to you soon…"*

The defaults are `mentor` and `mentee`, stored lowercase because that is where they
appear: mid-sentence, in a message. The word is stored exactly as an Admin typed it,
trimmed and with internal whitespace collapsed, and is never capitalised, pluralised or
inflected on their behalf.

The settings form's preview is composed by the two Starter Message functions above — one
for each word, so a Ministry sees each of its words in the message the person who reads
that word actually gets. It is composed by calling them, not by imitating them, so what an
Admin reads on the screen is the message: prefix, opt-out disclosure and all.

## Context

`CONTEXT.md` has always said that the Ministry Language is *the nouns a Ministry uses for
the two roles in a relationship, applied to every message it sends*, and that Mentor and
Mentee *belong in message copy, not in the model*. Ticket 22 asks for the two nouns, and
for a preview *showing the ministry its own words in its own messages*.

No message named a role. `invitationMessage` said *someone to disciple*,
`starterMessageToLeader` said *you're now meeting with*, and
`starterMessageToParticipant` said *you have been paired with … for discipleship*. There
was nowhere for a Ministry's word to go, and a preview of a message that used neither noun
would have been a preview of nothing.

So the copy had to be rewritten, and that raises two problems that only look like
grammar.

**A word a Ministry typed cannot be conjugated.** *Someone to mentor* is a fine sentence
and *someone to coach* is a fine sentence, but *someone to discipler* is not, and neither
is *someone to discipleship coach*. Verb position works for exactly the subset of nouns
that happen to also be verbs, which is a property of English and not of the setting.

**A word a Ministry typed cannot be pluralised either.** *Sarah is your mentor* reads well
for a one-to-one and becomes *David and Ruth is your mentor* for a group with two Leaders.
Appending an `s` is wrong often enough to be worse than not trying, and Discipler holds one
word per role rather than a singular and a plural — asking a coordinator for four words
where two will do is the kind of settings form this product is supposed to not have.

Both problems are invisible at the moment the copy is written, because whoever writes it
has `mentor` in their head, and `mentor` is the one word for which every shape works.

## Considered options

**Verb position, as it reads most naturally.** Rejected. *You've been matched with someone
to mentor* is the better sentence for the default word and a broken one for most of the
others, and the failure surfaces as a text a congregation receives rather than as anything
a test would catch.

**Two words per role, singular and plural.** Rejected for V1. It doubles the Language
section to answer a problem that naming the reader's own role removes entirely — the
reader is always one person.

**Pluralising with a rule.** Rejected. English plurals are not a rule, and a settings
surface that guessed at one would be wrong in public.

**Storing the nouns and using them nowhere yet.** Rejected. It makes the preview a picture
of a message Discipler does not send, and the Language section is the part of the settings
surface that has to be trustworthy: the whole of its value is that a Ministry can see, in
advance, what its people will read.

## Consequences

Every future message that wants to name a role is constrained to the two rules above. That
is the point, and it is written down here because the constraint is not discoverable from
reading the copy — the copy reads perfectly well.

Some sentences are unavailable. *You have been paired with Sarah for discipleship* became
*You're now Sarah's mentee*, which is a shorter sentence and a slightly different one: it
names what the reader now is, where the old one named what happened. That is the trade,
and it is the reason the Starter Messages had to change at all rather than gaining a noun.

The group possessive carries the plural case: *Emily, Sarah and Anna's mentor* is one
person to three, which is what a group Leader is. A name ending in *s* produces *James's
mentor*, which is correct and slightly awkward, and is left alone.

`from_name` sits beside the nouns and follows the same principle: it is the name a message
*reads as*, resolved once at the store as `coalesce(nullif(btrim(from_name), ''), name)`
so that nothing downstream has to remember which of the two a message carries. Null means
*speak as the display name*, and it is deliberately null rather than a copy of the name —
a Ministry that renames itself has renamed itself, and a copy would leave its messages
speaking as whoever it used to be until somebody noticed.
