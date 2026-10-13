# 01 - The flower stays in the margins

**What to build:** The watercolour painting behind every Admin tab and sign-in keeps its top-right and bottom-left sprays and loses the vine that runs between them across the middle, so it frames the content and never sits behind it.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *The flower background*.
Today: `public/discipler.css`, *the botanical frame*, draws `/botanical/blossom-*.webp` fixed over the whole window, and `scripts/botanical/compose.mjs` composes those images from `blossom.webp`.

**Blocked by:** nothing

**Status:** ready-for-agent

## Acceptance

- [ ] The middle vine is gone from every image variant, regenerated through `scripts/botanical/compose.mjs` rather than edited by hand.
- [ ] The top-right and bottom-left sprays stay, and show in the margins outside the content column on every Admin tab and on sign-in.
- [ ] Nothing of the painting shows behind the content column, including in the gaps between cards.
- [ ] Narrow windows and phones still look deliberate: where there is no margin, the sprays stay at the corners and clear of the content, or go.
- [ ] The tabs that wear their own painting (PR #22) follow the same rule.
- [ ] Print still hides it.
- [ ] Checked by eye in a real browser on every Admin tab and sign-in, at desktop and phone width.

## Not in this ticket

- Any other change to the look of the Admin surface.
