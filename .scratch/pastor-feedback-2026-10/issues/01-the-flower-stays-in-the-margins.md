# 01 - The flower stays in the margins

**What to build:** The watercolour painting behind every Admin tab and sign-in keeps its top-right and bottom-left sprays and loses the vine that runs between them across the middle, so it frames the content and never sits behind it.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *The flower background*.
Today: `public/discipler.css`, *the botanical frame*, draws `/botanical/blossom-*.webp` fixed over the whole window, and `scripts/botanical/compose.mjs` composes those images from `blossom.webp`.

**Blocked by:** nothing

**Status:** shipped

## Acceptance

- [x] The middle vine is gone from every image variant, regenerated through `scripts/botanical/compose.mjs` rather than edited by hand. (47a3532)
- [x] The top-right and bottom-left sprays stay, and show in the margins outside the content column on every Admin tab and on sign-in. (47a3532, dfa7cc7)
- [x] Nothing of the painting shows behind the content column, including in the gaps between cards. (dfa7cc7)
- [x] Narrow windows and phones still look deliberate: where there is no margin, the sprays stay at the corners and clear of the content, or go. (dfa7cc7)
- [x] The tabs that wear their own painting (PR #22) follow the same rule. (dfa7cc7)
- [x] Print still hides it. (dfa7cc7)
- [x] Checked by eye in a real browser on every Admin tab and sign-in, at desktop and phone width. (dfa7cc7)

## Not in this ticket

- Any other change to the look of the Admin surface.

## Comments

Decisions made while building, each with the alternative not taken:

- **The column is kept clear by the stylesheet, not by the paintings.** The frame on the Admin tabs is masked clear of the content box (the container's 1280px less its 1.5rem padding) and fades in over the 3rem beyond it, so nothing shows behind a card, a heading or the gaps between cards at any window width, for Blossom, Tulips and Trees alike. The alternative was recomposing each painting to fit the margin, which cannot work: the margin depends on the window's width and the paintings are drawn with `cover`.
- **The middle of every composition is bare paper**, and `tests/app/the-flower-stays-in-the-margins.test.ts` checks it for every design at every shape. Only Blossom changed: Tulips and Trees regenerate byte for byte.
- **Admin tabs below 1424px wide show no painting.** Below that the margin beside the content is under 6rem, which would show only a sliver at each window edge; the ticket allows the sprays to go where there is no margin. The alternative was keeping a faded sliver down to 1280px, which reads as a mistake rather than a frame. A 1366px laptop therefore loses the painting; a 1440px one keeps about 100px of it in each margin.
- **Sign-in keeps the painting round its card, unmasked.** The card is opaque and is the only content, so nothing shows behind it at any width. On a phone (720px and narrower) the card sits at the top, over the top-right spray, so the top quarter of the painting is masked away and only the bottom-left spray shows, below the card. The alternative was masking a 520px column on sign-in too, which would cut the bottom-left spray with a vertical edge below the card for no gain.
- **Pages on the tab bar that wear no painting (Check-Ins, Suggested Pairs, Materials) and Intake Forms, which is outside the Admin shell, are unchanged.**
