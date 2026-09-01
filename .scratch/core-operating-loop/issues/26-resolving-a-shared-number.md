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
than inventing an event kind here. *Left open and not answered: the rename writes no
event. What it does write is `held_import_row.renamed_from` — the name the Person was
called until then — because `person.full_name` is overwritten in place and ticket 07
cannot settle whether a rename is an event if the fact that event would carry has
already been destroyed.*

**Blocked by:** 02

**Status:** shipped

- [x] An import report row carrying `same_number_different_name` offers both answers
- [x] "Same person" renames the existing Person and creates nobody
- [x] "Someone else" creates a second Person on the shared number
- [x] Neither answer is a default, and neither is chosen without an Admin acting
- [x] Resolving a row does not require re-uploading the file
- [x] A row left unresolved stays visible rather than expiring silently

## Comments

### Why the importer half shipped first

The importer was filing duplicates for a Person the product had itself renamed at
Acceptance, and that is a data problem that gets worse with every upload. Reporting the
row stops the bleeding and is provable on its own; the resolution screen is a surface with
its own decisions and is worth reviewing separately.

Within one file, two rows sharing a number with different names are still both imported —
that is the couple case ADR-0005 protects and it is not ambiguous, because neither row was
already on the Roster. Only a collision *against the existing Roster* is reported.


### The row outlives the report, because it had to, 2026-09-01

The import report is a redirect. It carries line numbers and codes, deliberately no
names and no numbers, and it is gone on the next navigation. Two of the criteria above
are therefore not about the report at all: *resolving does not require re-uploading*
and *a row stays visible* both mean the row has to be stored, and a report line cannot
be answered because there is nothing left of it to answer.

So `held_import_row` keeps the row as the file had it -- the name that collided, the
number, the email beside them -- and the Roster reads it on every load rather than only
after an upload. The heading is *Rows waiting on you* and it sits above the Roster, not
inside the import panel: a question nobody has answered is still waiting a week later,
and the panel it arrived in is about one upload.

Only `same_number_different_name` is held. The other row problems are a spreadsheet to
fix, and holding one would put a question on the Roster that nothing on the screen could
close.

### *The same person* is a question with as many answers as the number has names

The ticket describes two answers, which assumes the number reaches one Person. ADR-0005
has always allowed two -- the couple case is the whole reason the identity index is
keyed on the name as well as the number -- so a row colliding with a number that already
holds Chris and Dana Miller has three answers, not two: rename Chris, rename Dana, or
add a third person.

The report offers one *Same person as X* per name on the number, and *Someone else on
this number* once. With one name on the number that is exactly the two answers the
ticket describes; with two it is three, and none of them is Discipler's to pick. The
alternative -- offering the rename only when it is unambiguous -- would have made the
product silently unable to answer the case ADR-0005 exists to protect.

### What neither answer can fix

A row is refused with `import_row.name_is_already_on_this_number` when that exact name
lands on that number between the import and the answer, from some other route. Both
answers would then make a duplicate `person_ministry_identity_uniq` refuses, so the
Admin is told rather than shown a constraint -- and the row stays, saying so.

Nothing here closes it. There are two answers and neither is a default, so Discipler has
no third thing to do with a question that has been overtaken. It is rare -- the importer
itself cannot produce it, and the row lock plus `held_import_row_one_open_question` close
the two races that look like it -- and a *dismiss* control would be a third answer the
ticket does not ask for. If it turns out to matter in a pilot, it belongs with ticket 16,
beside merging.

### Merging is still unbuilt, and nothing here forecloses it

*Same person* is a rename: one Person row throughout, `person.id` never moves, and every
relationship, message and history event stays theirs. Two Person rows that already exist
are still not mergeable, still belong with Roster completeness, and are still untouched
by this.


### Review fixes

Three of them were mine to have caught.

**A congregant's number was one REST call away.** `grant select on held_import_row to
authenticated` put `phone` on a table PostgREST serves, which is exactly what
`20260910000100_the_leader_dashboard.sql` dropped the table grant on `person` to stop —
and it says there that a column privilege cannot be subtracted from a table grant
afterwards. The grant now names its columns and `phone` is not among them, so
`public.contact_to_share` is still the only path a browser session has to a number. The
migration's own comment had claimed *the number itself never leaves* while the grant
below it said otherwise.

**The rename destroyed a fact.** `update person set full_name` overwrote the previous
name and nothing kept it, against *preserve historical ministry events rather than
overwriting past facts with current values*. ADR-0014 has the precedent: a reworded
Discipleship Goal writes the wording it used to carry before the update runs. So the row
carries `renamed_from`. That is not the history event the **Open:** question is about —
it is the fact that question will need in order to be answerable at all.

**An answered row died with the Person.** `on delete cascade` on the Person the answer
landed on would have deleted the record of who decided what — and ticket 16's merge is
the first thing that would delete a Person, which makes it the ticket that most needs
these rows to survive. It is `on delete set null (person_id)` now, like `resolved_by`
beside it, and the whole-answer check no longer requires a Person to still exist.

Two smaller ones: the upsert that dedupes a re-uploaded file now writes `full_name` as
well as the line — the conflict is on the *normalised* name, so two spellings land on one
row and the answer has to write the one actually in front of the Admin — and the import
report now points at the panel where a `same_number_different_name` row can be answered,
rather than reporting the row and saying nothing about where it went.
