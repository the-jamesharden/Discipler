# 26 — Resolving a number the Roster already holds

**What to build:** The Admin-facing half of `same_number_different_name`. The importer
now recognises a number it already holds, refuses to guess whether a new name on it is a
rename or a second person, and reports the row. Nothing yet lets an Admin answer.

An import report line saying *this number is on the Roster under a different name* is
honest and currently a dead end: the Admin's only recourse is to edit the spreadsheet and
upload again, which is exactly the manual work Discipler exists to remove.

The Admin needs two answers, on the row, in the import report:

- **Same person** — the Person keeps their identity and their history, and the name on
  file becomes the one in the file. This is a rename, not a merge: one Person row
  throughout, and `person.id` never moves.
- **Someone else on this number** — a second Person is created on the shared phone, which
  is what `docs/adr/0005-a-person-is-a-name-and-a-number.md` has always allowed.

Neither answer may be a default and neither may be inferred. The whole point of the
report is that Discipler does not know, and a screen that guesses on the Admin's behalf
puts the ambiguity back where the importer just took it out of.

**Out of scope:** merging two Person rows that already exist. That is still unbuilt, still
belongs with Roster completeness (ticket 16), and nothing here forecloses it.

**Open:** whether a rename appends a history event. It changes what Discipler will call
somebody in every future message, which argues yes; it is also an Admin correcting a
spreadsheet typo, which argues no. Worth settling with ticket 07's history work rather
than inventing an event kind here.

**Blocked by:** 02

**Status:** needs-triage

- [ ] An import report row carrying `same_number_different_name` offers both answers
- [ ] "Same person" renames the existing Person and creates nobody
- [ ] "Someone else" creates a second Person on the shared number
- [ ] Neither answer is a default, and neither is chosen without an Admin acting
- [ ] Resolving a row does not require re-uploading the file
- [ ] A row left unresolved stays visible rather than expiring silently

## Comments

### Why the importer half shipped first

The importer was filing duplicates for a Person the product had itself renamed at
Acceptance, and that is a data problem that gets worse with every upload. Reporting the
row stops the bleeding and is provable on its own; the resolution screen is a surface with
its own decisions and is worth reviewing separately.

Within one file, two rows sharing a number with different names are still both imported —
that is the couple case ADR-0005 protects and it is not ambiguous, because neither row was
already on the Roster. Only a collision *against the existing Roster* is reported.
