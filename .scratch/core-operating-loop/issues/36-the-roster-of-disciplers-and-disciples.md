# 36 - The Roster of Disciplers and Disciples

**What to build:** The Roster and its import rebuilt to mirror the prototype James brought on 2026-09-06 (`disciplerdashboard_6.html`): two lists behind an All Disciplers / All Disciples toggle, a stats line, contact details on every row, a person page behind each name, and a paste-and-review import that can bring pairs with it.

Raised by James on 2026-09-06.
His words: it speaks the language of the customer; the current UI speaks of eligibility and the relationship, and while those are good to keep track of in the backend they confuse the user on the front end.

**Blocked by:** nothing

**Status:** claimed

## Decisions

Taken in this session's questions on 2026-09-06 and in the Lavish review of 2026-09-07 (`.lavish/roster-rebuild/index.html`).

1. Every row shows Email and Phone, for everyone.
   Reverses ticket 31; ADR-0021.
2. Admin screens use the fixed words Discipler and Disciple, plurals allowed.
   Text messages keep the Ministry's own nouns; ADR-0015 is scoped to messages by a note, and nothing migrates.
3. A Discipler is a fact, never a mark: anyone leading an open relationship, anyone who signed up as a leader on the Intake form (the mentor side), and anyone an import paired as the discipler.
   Everyone else is a Disciple.
   A person leading one relationship and discipled in another appears on both lists.
   James: the pairing of the people is the confirmation that they are accepted by the pastor.
4. The eligibility to lead feature is removed whole: the toggle, the pill, the per-row button, the route, the command, the effect and the column.
   James: the mark function should not exist; eligibility is determined by the fact that they are paired.
   History rows recording it being set stay.
   Ticket 04's leader pool becomes: offered to mentor at Intake, or leads.
5. An imported pair is recorded as an intended pairing and forms itself once both have completed Intake, by the same rules and with the same invitation as pairing by hand.
   A refusal raises a Follow-Up Item and is never retried; an Admin pairs by hand.
   ADR-0022.
6. The import is a modal with a browser-side review that shares one parser with the server; without script the same dialog imports and the server reviews.
   Both modes say: email the spreadsheet to support@trydiscipler.com and it is imported for you.
   The file input goes; the 2 MB cap moves to the pasted text.
7. Row actions (Intake link, reset password, a new invitation) move to a person page opened from the name.
   Plans are not shown on the person page.
8. Stats line: total, paired (an open relationship in that role; plans do not count), unpaired, in groups (an open relationship with more than one disciple, from live membership).
9. The status chip shows under every name, small, with the footnote explaining Ready to Pair.
10. The review's third tile says Pairs created, as the prototype does.
11. In People only mode, Role says which side of a Paired With pair a person takes; either row may carry the pair; on a row with nobody in Paired With it changes nothing.
    Heading synonyms Leader, Mentor, Participant and Mentee are accepted silently.
12. An import changes nothing about a person already on the Roster.
13. A held row shows its number.
    A held row does not keep its pairing intent (decided for later: answer the row, then paste the line again).
14. The vocabulary sweep stops at the Roster, the person page and the Pair page; the other tabs follow in a ticket of their own.
15. The default list is Disciplers.

## Where it lands

- `supabase/migrations/20260923000100_the_roster_of_disciplers_and_disciples.sql`: the column dropped, `public.roster` recreated with phone and email.
- `src/service/ports.ts`, `src/platform/supabase/roster-reader.ts`: `RosterEntry.phone/email`, `RosterRelationship.leaderNames/participantNames/participantCount`; the eligibility port gone.
- `src/domain/commands.ts`, `effects.ts`, `boundary.ts`, `src/service/command-service.ts`, `src/platform/supabase/effect-store.ts`: the eligibility command, effect and write removed.
- `app/roster/page.tsx`, `app/roster/lists.ts`, `app/roster/copy.ts`: the two lists, the four numbers, the five columns, the one rule for who is a Discipler, and every word an Admin reads.
- `app/roster/[personId]/page.tsx`: the person page, with the Intake link, the reset, a new invitation and the sentence saying why.
- `src/domain/intended-pairing.ts`, `supabase/migrations/20260923000200_intended_pairings.sql`: a plan an import made and how it is settled; ADR-0022.
- `src/domain/roster-csv.ts`: the reader, both layouts, tab or comma, the heading synonyms, Role and Paired With.
- `src/domain/roster-import.ts`: the classifier, one function for the command and the dialog.
- `app/roster/import/route.ts`, `app/roster/report.ts`: the paste posted as a form, the report with the pairs planned.
- `app/roster/import-dialog.tsx`, `app/roster/import-copy.ts`: the dialog, its live review, and its words.

## Comments

**2026-09-07.** Step 1 shipped on the branch: the migration, the ports, the reader, the eligibility removal end to end, and the test-id refactor of the two HTTP helpers as its own commit first.

**2026-09-07.** Step 2 shipped on the branch: `/roster/[personId]` with the Intake link and its result, a new invitation, the reset, and the sentence saying why they are a Discipler or a Disciple; the three routes redirect there; the row keeps Pair and links the name. `app/roster/lists.ts` holds the one rule for who is a Discipler.

**2026-09-08.** Step 3 shipped on the branch: the two lists behind All Disciplers / All Disciples, the four numbers, the five columns with email and the number as a person reads it, the `1:1` and `N members` pills, and the words -- Discipler, Disciple, pairing -- across the Roster, the person page and the Pair page. `tests/app/roster-vocabulary.test.ts` holds the line. Imports and answered held rows land on the Disciples list, where the people they add are.

**2026-09-08.** Step 4 shipped on the branch: `intended_pairing`, the two settle commands, `formRelationship` shared with the Pair page, the settle after every Intake submission, after an import and on the tick, the `intended_pairing_refused` Follow-Up kind with *Pair by hand* on it, and the plan on both Roster rows. ADR-0022. Nothing writes a plan yet but a test; the import does in step 5.

**2026-09-08.** Steps 5 and 6 shipped on the branch: the import is a paste, tab or comma, in one of two layouts -- *Already paired* (one discipler-disciple pair per row) and *People only* (one person per row, with Role and Paired With if wanted); Leader, Mentor, Participant and Mentee are read silently; Paired With is resolved within the paste and then against the Roster; `classifyImport` is the one function the command runs inside its transaction and the dialog runs in the browser for its review, and a test holds the two to the same answer. The file input is gone; the 2 MB cap is on the pasted text. The dialog is the prototype's three steps with the four tiles and the review table, opened from a link by `:target` (and by the hash after hydration, since the router rewrites the URL), posting the form with script off, with the review then coming back on the Roster as *N people were added. M pairs were planned.* Every new refusal is worded; `app/roster/import-copy.ts` is swept by the vocabulary test too. Held rows do not keep their pairing (decision 13). Step 7 stays for later.

Verified: typecheck, the full suite against a rebuilt server, and the dialog in Chrome (both layouts, the live review, a refusal held open, and a fresh load on `#import`).
