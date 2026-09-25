# 03 - The change text, to Leaders

**What to build:** What each person was told about each relationship's Material, the tick's rule for when a pending change is sent, and the Leader's text, as `spec.md` *The change text* describes and M-5 of `.lavish/richer-materials/mockup.html` words.

**Blocked by:** 01

**Status:** ready-for-agent

## Acceptance

- [ ] An append-only `material_notice` table: ministry, person, relationship, the Material told (nullable), its content fingerprint, when, and the outbound message it rode on.
- [ ] `app.material_content_fingerprint(material)` hashes the text and items and not the title; a title-only edit leaves it unchanged.
- [ ] The tick's context carries each recipient's pending changes, the time of the last change feeding them, and whether they have had a Material text today in the Ministry's timezone; the rule is decided in the domain against the injected clock.
- [ ] Domain tests with a test clock: a change then an hour's quiet sends; a second change inside the hour waits; five changes in an afternoon send once; a change after today's text waits for tomorrow and goes after 8am; a change undone before sending sends nothing; a paused relationship waits for the resume; a title-only edit sends nothing; a Leader of three relationships changed together gets one text.
- [ ] The text is `no_reply`, may carry the rates line, and its wording is exactly what James approved in M-5, in `src/domain/outbound-copy.ts` with a `tests/domain/outbound-copy.test.ts` case per variant.
- [ ] `docs/adr/0027-a-material-change-is-texted-once-it-settles.md`; a **Supersedes** note under *Settled: No Interface Action Sends a Message*; the text added to the rates-line rule's list; `CONTEXT.md` gains **Material Notice** with no numbers.
- [ ] Integration: assign from the folder, run the tick an hour later on the test clock, and read the one `outbound_message` row for the Leader.
