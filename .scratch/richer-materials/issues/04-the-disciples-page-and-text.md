# 04 - The Disciple's Material page, and their text

**What to build:** The token, `/material/<token>`, the file route, and the Disciple's change text, as `spec.md` *The Disciple's Material page* describes and M-4 and M-5 of `.lavish/richer-materials/mockup.html` draw.

**Blocked by:** 01, 03

**Status:** ready-for-agent

**Built:** on `wave4/change-text`, not merged. Migration `20261013000400_the_disciples_material_page.sql` is not pushed to production.

## Acceptance

- [x] A `material_link` table, one token per Participant membership, minted the first time a text links to it and never re-minted; `app.material_link_for_token(token)` security-definer, granted to `discipler_command` only.
- [x] The page is read under row-level security for the token's Ministry, shows the Ministry name, the Material's title, text and items and nothing else, and says the link has ended once the membership is closed or the relationship has ended.
- [x] `/material/<token>/file/<item>` checks the token and that the item belongs to the Material running now, then redirects to a signed URL of a few minutes.
- [x] The Disciple's text goes by 03's rule in the same tick, is `no_reply`, links to their page, and is exactly what James approved in M-5; a move to no Material sends nothing and records the notice.
- [x] A reply to it gets the ordinary acknowledgement, tested.
- [x] `docs/adr/0028-a-disciple-is-sent-a-link-to-their-material.md` amends ADR-0011; `CONTEXT.md` gains **Material Link** with no numbers.
- [x] Over HTTP: open the page from the token a text carried; a stranger's guess is a 404; an ended membership shows the ended line; a file downloads; the page is right at 390px wide.

## Comments

### Implementer

**2026-09-24, built on `wave4/change-text` after ticket 03, not merged.**

Where things are:
the migration `supabase/migrations/20261013000400_the_disciples_material_page.sql`;
the Disciple's text in `src/domain/material-notices.ts` (the rule) and `materialMessage` (the words), the link minted in the tick in `src/domain/boundary.ts`;
the store's Participant rows and `issueMaterialLinks` in `src/platform/supabase/effect-store.ts`;
the page's reads in `src/platform/supabase/material-page-reader.ts`, the page at `app/material/[token]/page.tsx`, its words in `app/material/copy.ts`, the file route at `app/material/[token]/file/[item]/route.ts`, and `downloadLinkForAnybody` in `src/platform/supabase/material-files.ts`.

Checked:
the whole typecheck; `tests/domain` and `tests/app` whole (1782 passed), including the Disciple cases in `tests/domain/the-material-text.test.ts`;
through `scripts/locked-tests.sh`, the new `the-disciples-material-page-over-http` (the text and its link, the page naming nobody, a file downloading under its own name, a guess and another Material's item not found, the acknowledgement to a reply, no Material, and ended), with `the-material-text`, `the-scheduled-tick` and `rls-coverage`;
in Chrome in a 390px frame, all three states of the page, and a download followed to the file.

Decisions, each with its alternative:

- **The page follows M-4's own header, not the centred card the other sessionless pages use.** M-4 was approved as drawn. The alternative was the Invitation page's `Centred` card with the Discipler mark at the foot.
- **The file route signs with the service role**, after checking the token, that the link still opens, and that the item is a file on the Material running now. A Disciple has no session for a storage policy to read. The alternative, a storage policy keyed on the token, would put a secret into every storage request's evaluation.
- **A Disciple who both leads and is discipled is told about what they lead first**, and their own discipleship waits a day, since one text is the rule.
- **A Disciple in two relationships whose Materials both changed** gets the text for the one changed most recently; the other goes on a later day (spec, *The wording*).
- **"No material right now"** is new wording James has not seen: the heading and *Riverside Chapel will put one here when there is one to work through.* The New material page's lead now also says Disciples see a Material, which it did not.

For James:

- The words above, and the ended line, which is M-4's.
- The migration is the fourth of this effort, pushed after `20261013000300`.

### Review fixes, 2026-09-24

- **A file the route cannot hand down goes back to the page**
  (ended, taken off the Material, not a file, or Storage not answering), which says what there is now, rather than a bare "Not found".
- **An unknown token is still Next's not-found page.**
  The ended state names the Ministry, and a token that names nothing has no Ministry to name.
  Every other token page answers an unknown token the same way.
- **The page's title is the Material's**, where there is one.
- **The test count in the notes above (1782) came from `wave4/change-text`**, which carries the unmerged Suggested Pairs build and its tests.
  The ship branch has `main`'s Suggested Pairs, which accounts for the difference; nothing was lost.
