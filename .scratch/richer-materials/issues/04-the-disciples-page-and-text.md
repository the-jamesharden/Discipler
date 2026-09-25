# 04 - The Disciple's Material page, and their text

**What to build:** The token, `/material/<token>`, the file route, and the Disciple's change text, as `spec.md` *The Disciple's Material page* describes and M-4 and M-5 of `.lavish/richer-materials/mockup.html` draw.

**Blocked by:** 01, 03

**Status:** ready-for-agent

## Acceptance

- [ ] A `material_link` table, one token per Participant membership, minted the first time a text links to it and never re-minted; `app.material_link_for_token(token)` security-definer, granted to `discipler_command` only.
- [ ] The page is read under row-level security for the token's Ministry, shows the Ministry name, the Material's title, text and items and nothing else, and says the link has ended once the membership is closed or the relationship has ended.
- [ ] `/material/<token>/file/<item>` checks the token and that the item belongs to the Material running now, then redirects to a signed URL of a few minutes.
- [ ] The Disciple's text goes by 03's rule in the same tick, is `no_reply`, links to their page, and is exactly what James approved in M-5; a move to no Material sends nothing and records the notice.
- [ ] A reply to it gets the ordinary acknowledgement, tested.
- [ ] `docs/adr/0028-a-disciple-is-sent-a-link-to-their-material.md` amends ADR-0011; `CONTEXT.md` gains **Material Link** with no numbers.
- [ ] Over HTTP: open the page from the token a text carried; a stranger's guess is a 404; an ended membership shows the ended line; a file downloads; the page is right at 390px wide.
