# 03 - The change text, to Leaders

**What to build:** What each person was told about each relationship's Material, the tick's rule for when a pending change is sent, and the Leader's text, as `spec.md` *The change text* describes and M-5 of `.lavish/richer-materials/mockup.html` words.

**Blocked by:** 01

**Status:** ready-for-agent

**Built:** on `wave4/change-text`, not merged. Migration `20261013000300_the_material_text.sql` is not pushed to production.

## Acceptance

- [x] An append-only `material_notice` table: ministry, person, relationship, the Material told (nullable), its content fingerprint, when, and whether a text went with it (see Implementer).
- [x] `app.material_content_fingerprint(material)` hashes the text and items and not the title; a title-only edit leaves it unchanged.
- [x] The tick's context carries each recipient's pending changes, the time of the last change feeding them, and whether they have had a Material text today in the Ministry's timezone; the rule is decided in the domain against the injected clock.
- [x] Domain tests with a test clock: a change then an hour's quiet sends; a second change inside the hour waits; five changes in an afternoon send once; a change after today's text waits for tomorrow and goes after 8am; a change undone before sending sends nothing; a paused relationship waits for the resume; a title-only edit sends nothing; a Leader of three relationships changed together gets one text.
- [x] The text is `no_reply`, may carry the rates line, and its wording is exactly what James approved in M-5, in `src/domain/outbound-copy.ts` with a `tests/domain/outbound-copy.test.ts` case per variant.
- [x] `docs/adr/0027-a-material-change-is-texted-once-it-settles.md`; a **Supersedes** note under *Settled: No Interface Action Sends a Message*; the text added to the rates-line rule's list; `CONTEXT.md` gains **Material Notice** with no numbers.
- [x] Integration: assign from the folder, run the tick an hour later on the test clock, and read the one `outbound_message` row for the Leader.

## Comments

### Implementer

**2026-09-24, built on `wave4/change-text` (cut from the merge of tickets 01 and 02), not merged.**

Where things are:
the rule in `src/domain/material-notices.ts`, and `calendarDayOf` and `localHourOf` in `src/domain/week.ts`;
the wording in `materialMessage` in `src/domain/outbound-copy.ts`;
the tick's part near the end of `case 'scheduled.tick'` in `src/domain/boundary.ts`;
the read and the write in `materialRecipients` and `recordMaterialNotices` in `src/platform/supabase/effect-store.ts`;
the migration `supabase/migrations/20261013000300_the_material_text.sql`.

Checked:
the whole typecheck; `tests/domain` and `tests/app` whole (1770 passed), including `tests/domain/the-material-text.test.ts`, which has a test for each case in this ticket;
through `scripts/locked-tests.sh`, the new `the-material-text` (assign, tick at 30 and 61 minutes, a second change held to 8am the next day, a title-only edit texting nobody, a content edit saying updated), `the-scheduled-tick` over HTTP and not, `an-opted-out-person` and `rls-coverage`;
the migration's baseline query, read-only, against the data a test run left behind.

Decisions, each with its alternative:

- **A notice records whether a text went, not which message.** An enqueued draft has no id until the store writes it, and the one-a-day rule only needs *was this person texted today*. The alternative was giving drafts an id at the boundary for this one link.
- **The baseline records every Leader and Participant as already told** about the Material their relationship is on when the migration runs. Participants too, so that shipping ticket 04 later texts no Disciple about a Material they already had.
- **"Last changed" is the running period's start, or the last `material.edited` event on the Material it is on**, whichever is later. A title-only edit therefore restarts the hour for a text that was already pending; it never causes one. The alternative, comparing fingerprints over time, needs a history of fingerprints nothing else wants.
- **One change still settling holds a person's whole text**, so a Leader whose three relationships are moved over forty minutes gets the one *several* text rather than one now and one tomorrow.
- **A relationship accepted with a Material already chosen at pairing counts as a change from nothing**, so its Leader gets the text an hour or two after accepting. The alternative, treating acceptance as the telling, would leave a Disciple (ticket 04) never told where their page is.
- **The hours are the check-in's**, `QUIET_HOURS` in `src/domain/ministry-settings.ts`, which runs to the 9pm hour, the last one starting before 10pm.

For James:

- After pushing the migration, `select count(*) from material_notice` should roughly equal the number of people in running relationships that have a Material; if it is zero, the first tick will text all of them. Tell me the number before merging the code.
