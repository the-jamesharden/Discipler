# 25 - Contact, bug and feature form

**What to build:** One form from the Help menu for contacting support, reporting a bug or asking for a feature, stored and emailed to support@.

**Blocked by:** 10, 23

**Status:** needs-info

## The rule

- A signed-in submission is stored with the church, readable by nobody in the app; a signed-out one is stored operator-only, behind Turnstile and a per-network limit.
- A bug report attaches the page address and the browser, never the page's content or a screenshot.
- The email to support@ is plain text with every field escaped, and nothing submitted goes into a header.
- Submissions are kept 12 months, then deleted.

## Acceptance

- A bug report from the Roster carries its address and browser and no names.
- A signed-in Admin is limited to a few submissions an hour.

## For James

1. Approve the form in mock-up 2.
