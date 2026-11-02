# 35 - Docs and ADRs

**What to build:** Every amendment and ADR the spec lists, so the docs say what the product now does.

**Blocked by:** nothing

**Status:** shipped

## The list

- A new ADR superseding ADR-0019: a church signs itself up; Setup Links remain for comped churches.
- A new ADR superseding ADR-0008 for Admins: an Admin signs in with email or phone.
- A new ADR: the test check-in texts an Admin.
- A new ADR: the AI help assistant, help docs only.
- A new ADR: a shared set of Discipler numbers replaces a number per church.
- Discipler only ever sends texts it writes, as a permanent rule, in the shared-numbers ADR or its own.
- `docs/product-rules.md`: "Settled: No Interface Action Sends a Message" becomes "no interface action sends free-form text"; sign-up, billing states, referrals and Settings' Billing row.
- `docs/non-goals.md`: points and What's new come off; gamification stays.
- `docs/open-questions.md`: "Open: a church signs itself up" is closed.
- `docs/pastor-dashboard.md`, `docs/product-flow.md`, `docs/consent-language.md`.
- `CONTEXT.md`: glossary entries only, with no durations or caps.

## Acceptance

- Each ADR names the trade-off and what it supersedes.
- No doc still says there is no sign-up surface.

## Comments

### Built (2026-10-31)

- Six ADRs, numbered after ADR-0028 (0024 is a parked number on an unmerged branch, so it is left unused):
  - `docs/adr/0029-a-church-signs-itself-up.md`, superseding ADR-0019 as the usual door; the Setup Link stays for comped churches.
  - `docs/adr/0030-an-admin-signs-in-with-email-or-phone.md`, superseding ADR-0008 for an Admin with a verified email.
  - `docs/adr/0031-the-test-check-in-texts-an-admin.md`, turning *No Interface Action Sends a Message* into *No Interface Action Sends Free-Form Text* and amending ADR-0010.
  - `docs/adr/0032-the-ai-guide-answers-from-the-help-docs-only.md`, the approval `docs/non-goals.md` asks for, for this assistant only.
  - `docs/adr/0033-a-shared-set-of-discipler-numbers.md`, superseding a number per church, the stacked `Discipler:` prefix and the Setup Link's number.
  - `docs/adr/0034-discipler-writes-the-frame-of-every-text.md`, the permanent frame rule as its own ADR, amending ADR-0015.
- Status lines added to ADR-0008, 0010, 0015 and 0019 pointing at what supersedes or amends them.
- `docs/product-rules.md`: the renamed *No Interface Action Sends Free-Form Text*; new sections *A Church Signs Itself Up*, *Prices and Offers*, *The Billing States*, *Referrals* and *Settings Has a Billing Card and a Billing Page*; amendment notes on consent, passwords, the Ministry's voice, the A2P prefix, the Silence Gap, Settings and the sign-in credential; *There is no sign-up surface* removed from the Setup Link section.
- `docs/non-goals.md`, `docs/open-questions.md`, `docs/pastor-dashboard.md`, `docs/product-flow.md`, `docs/consent-language.md` and `CONTEXT.md` as listed below.
- Of the three files the main checkout holds uncommitted edits to, this touches only `docs/pastor-dashboard.md`: one sentence under *Shape* and new sections appended at the end, away from the Overview text the other session edits. `docs/vision.md` and ADR-0005 are untouched.

### Decisions made on gaps

- **Non-goals: "points" stays on the list.**
  The spec says "points and the What's new item come off the list", but the spec also says "Points are removed from the plan entirely", and `docs/non-goals.md` has no What's new item.
  Removing "points" would read as approving points, which nothing does.
  So the list is unchanged, and a note under it names what this launch approved (the setup meter and its one badge, the What's new and office hours cards, Ask Discipler) as approved for these features only.
  Alternative: delete "points" from the list as the spec's sentence literally says.
- **Open questions: "Open: a church signs itself up" is not on `origin/main`.**
  It exists only on `ship/waves-2026-09-22` (commit b326bd4, not merged).
  This branch adds *Resolved: a church signs itself up* after the provisioning question, carrying the original question's text, so the merge with that branch keeps one answered entry.
  Alternative: leave open-questions alone until that branch merges.
- **Also closed or narrowed in open-questions:** *nothing puts `Discipler:` on the first text after a Silence Gap* is marked resolved as moot (every text starts "via Discipler"), and *how a Ministry's only Admin gets back in* is answered for an Admin with a verified email.
- **The billing states let texts go out during a failed payment's retries.**
  The spec's Billing section says "everything keeps running during Stripe's retries", while Q32 and ticket 05 say texts go out only while trialing or active; Stripe calls the retry period `past_due`.
  The docs follow "everything keeps running".
  Alternative: stop texts on `past_due`, which contradicts the payment-failed banner's own words.
- **The referral line follows the mock-up 5 decisions, not the older ticket line about a tracker and an opt-in name**: no page lists invited churches, and the only thing one church learns is an applied credit on Billing.
- **The sign-up consent needs its own consent version identifier**, never `2026-09-v1`, because it is different wording; `docs/consent-language.md` says so and leaves the identifier to ticket 17, which records the consent.
- **A Setup Link church texts only while billed outside Stripe**, which follows from the texting gate; written down in ADR-0029 and the glossary.

### For James

- ADR-0031 records a conflict instead of resolving it: the test check-in's first text, "the same one your {leader noun}s get", pluralises the church's noun, which ADR-0015 says Discipler never does.
  Either the wording changes (for example "the same one your {leader noun} gets" or "the same one we send each week") or ADR-0015 gains an exception.
- Ticket 40 still lists the reply choices as "Reply A for outstanding, B for good, C for concern.", the three-rating copy; there are four ratings since 2026-10-12.

### Closed out (2026-11-02)

Merged in PR #35 (49d4bb2) and its migrations are on production.
What is left for James moved to `docs/open-questions.md`: *"{leader noun}s" in the test check-in's first text*, *whether "points" comes off the non-goals list*, *whether a past-due church keeps texting* and *the reply choices ticket 40 lists*.
