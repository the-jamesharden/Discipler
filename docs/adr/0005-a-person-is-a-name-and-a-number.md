# A Person Is a Name and a Number

## Status

accepted

## Decision

A Person's identity within a Ministry is **their name together with their phone
number**, never the number alone:

```sql
create unique index person_ministry_identity_uniq
  on person (ministry_id, phone, lower(regexp_replace(btrim(full_name), '\s+', ' ', 'g')))
  where phone is not null;
```

`rosterKey` in `src/domain/roster.ts` computes the same key for the importer, so the
rule the import applies and the rule the database enforces are one rule.

Case and internal whitespace are folded, so `  emily   johnson ` and `Emily Johnson`
are the same person. Nothing cleverer is attempted: nicknames, initials and fuzzy
matching are guesses about people, and this product does not guess about people.

## Context

CSV import has to answer a question the Roster never had to answer before. When the
same spreadsheet is uploaded twice, or a corrected export is uploaded a month later,
how does Discipler recognise somebody it already holds?

The obvious answer is the phone number. Everything a Person receives is SMS, inbound
routing resolves a sender's number to a Person, and the column is already normalised
to E.164. A unique index on `(ministry_id, phone)` makes recognition free and makes
duplicates impossible.

It is also wrong, and wrong in a way that is expensive to discover later.

A shared phone is ordinary in a congregation: a married couple with one mobile, a
parent and a teenager, a household landline. A church roster is a congregation, not a
list of account holders, and the second person on a shared number needs discipling
like anybody else.

The product is already built on this. The per-phone prompt serialisation says, in as
many words, that *a phone can only hold one thread regardless of how many people are
reachable on it*. That rule has nothing to serialise if a number reaches exactly one
Person. Inbound routing stays unambiguous not because a number names one human, but
because serialisation guarantees only one prompt on that number is open at a time —
the two are a pair, and keying identity on the number alone quietly discards one.

## Considered options

**The phone number alone.** Smallest key, free recognition, no near-duplicates. It
makes the second person on a shared phone unrepresentable, and it fails silently:
importing a couple produces one Person and one refused row reading *already on the
Roster*. An Admin scanning a few hundred rows has no reason to look twice, and the
wife is simply not in the product. Nobody finds out until she is one of the people
nobody discipled — the exact failure this ticket's *report, never drop* rule exists to
prevent. Rejected.

**A surrogate key with no uniqueness at all.** Every upload of the same spreadsheet
files the whole congregation again. Rejected.

**Name and number together.** Chosen.

## Consequences

- The importer reports a row as `already_on_the_roster` only when the name *and* the
  number match. Two people sharing a phone both import.
- Near-duplicates become possible: *Emily Johnson* in one export and *Em Johnson* in
  the next, on the same number, are two Person rows. This is the right side of the
  trade — a near-duplicate is visible on the Roster, next to itself, sorted by name,
  and can be merged; a congregant who was never imported is invisible, and no screen
  will ever show her absence.
- Merging two Person rows that turn out to be one human is unbuilt. It belongs with
  Roster completeness, and nothing here forecloses it.
- The per-phone serialisation is keyed on the phone number and not on the Person, and
  this ADR is why that distinction is load-bearing rather than incidental.
- Ministry isolation is unaffected: the index is scoped to a Ministry, and one human
  belonging to two congregations holds two Person rows that share nothing.

## Amendment — the number recognises, the name confirms

*Accepted after the ticket 06 review.*

The decision above holds: identity is name **and** number, the index is unchanged, and
two people on a shared phone are two Person rows. What was wrong was leaving *recognition*
entirely to the pair, because it made an unmatched name mean "new Person" by default —
and that default is what turns a rename into a duplicate.

Acceptance stores the name a Leader typed, which is often not the name the spreadsheet
held. Re-uploading that same unchanged spreadsheet then filed a second Emily, silently.
The product itself had made the near-duplicate, which is not the case this ADR reasoned
about: it accepted near-duplicates arising from *two exports disagreeing*, not from
Discipler renaming somebody and then failing to recognise them.

So recognition is now two-stage, and neither stage guesses:

1. **The number decides whether Discipler has seen this line before.** A number already on
   the Roster is a match, whatever name the row carries.
2. **The name decides what kind of match it is.** The same name is
   `already_on_the_roster` and changes nothing, as before. A different name is
   `same_number_different_name`, which files nobody and reports the row.

`same_number_different_name` is the honest answer to a question with two ordinary
answers — the same Person renamed, or the second person on a shared phone — and the
Admin who uploaded the file is the one who knows which. Merging still does not happen
automatically and still belongs with Roster completeness; what has changed is that the
ambiguity now reaches somebody instead of being resolved by a default.

The rejected option remains rejected: the number *alone* is still not identity, and two
people on a shared phone are still two rows. The number is the matching key; the name is
what the match has to confirm.
