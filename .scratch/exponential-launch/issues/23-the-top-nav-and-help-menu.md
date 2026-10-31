# 23 - The top nav and Help menu

**What to build:** The Admin shell gets a Settings gear, an avatar with the Admin's initials and name, a place for the setup meter, and a Help menu.

**Blocked by:** Nothing

**Status:** needs-info

## What is true today

- `AdminShell` in `app/shell.tsx` has an Account menu whose summary reads "Account" and deliberately shows no name, to save a read.
- `initialsOf` in `app/initials.ts` is used only by Roster rows.

## The rule

- The Admin's name, the setup percentage, the What's new state and the AI bubble's collapsed state come from the one page-session read, `app.page_session()` (ADR-0023), so the shell adds no read.
- The Account menu shows the avatar and the name.
- A Settings gear goes in the top nav.
- The Help menu has six items, including Restart onboarding and the contact, bug and feature form.
- One church per person, so there is no switch-organization control.
- Admins only for now.

## Acceptance

- Every Admin page renders the name and initials with the same number of database calls as before.
- `npm run smoke:pages` passes.

## For James

1. Decided 2026-10-29 (Q77): Help center, Ask Discipler, Restart onboarding, What's new, Office hours, Contact support (with bug and feature choices inside).
