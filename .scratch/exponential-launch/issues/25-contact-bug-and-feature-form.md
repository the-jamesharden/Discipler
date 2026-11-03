# 25 - Contact, bug and feature form

> **Triaged 2026-11-03 against the spec's "Help, What's new and office hours", "Search, nav and Settings", "Email" and "Security", and approved mock-up 2, at James's instruction to build it now.**
> Mock-up 2 (`.lavish/top-nav-search/v-b2-help.html`, the Round 2 section of `build.mjs`) draws the Help menu and its "Contact support" row, and no form behind it, so the form's words are drafts for James.
> `docs/legal/privacy-policy.md` already promises what is built here: a bug report records the page's address and the browser, Turnstile guards the signed-out form, and messages are deleted after 12 months.

**What to build:** One form from the Help menu for contacting support, reporting a bug or asking for a feature, stored and emailed to support@.

**Blocked by:** 10, 23

**Status:** ready-for-agent

## What was true before

- The Help menu's "Contact support" row is written in `HELP_MENU` in `app/top-nav-menus.ts` with a null address, so it is not drawn.
- `/help` is public and reads no session, and says "Still stuck? Write to support@".
- `EMAIL_KINDS` already routes `supportRequest`, `bugReport` and `featureRequest` to support@, and `EmailField.quoted` was written for this form's message.
- `createTurnstile` and `HumanCheck` exist, with actions for sign-up only.
- No job deletes anything after 12 months, and the privacy policy promises it of these messages.

## The rule

- The form is one page, `/help/contact`, with one choice of three: get help, report a bug, request a feature.
- It is under `/help`, so it needs no new reserved short name.
- The Help menu's "Contact support" opens it, and so does the Help pages' "Still stuck?" line, which is the signed-out way in.
- A signed-in Admin's submission is stored with the church, under `discipler_command` for that one church, readable by nobody in the app; a page holds no grant on it.
- Anybody else's is stored operator-only, behind Turnstile and a per-network limit.
- A bug report attaches the page address and the browser, never the page's content or a screenshot.
- The address is the path alone: no query string, no fragment, and any segment that is not a plain route word (a person's ID, a token) shown as `{id}`.
- Neither is kept on a request for help or a feature.
- The email to support@ is plain text with every field escaped, and nothing submitted goes into a header: the subject is the kind and Discipler's own reference.
- The typed address is in the body and not in `reply_to`, which stays support@ as the sender's rule says.
- Submissions are kept 12 months, then deleted, by the tick.
- The sender is not changed.

## Not in this ticket

- The Admin's own email on file: no account has one until ticket 17, so the form asks.
- Deleting mail from the support@ inbox after 12 months, which the privacy policy also promises and is a setting in the mailbox, not code.

## Acceptance

- A bug report from the Roster carries its address and browser and no names.
- A signed-in Admin is limited to a few submissions an hour.
- A signed-out submission is refused without a passed Turnstile token, and over the network's limit.
- Nothing a page can read holds a submission.
- The tick deletes a submission older than 12 months and keeps one younger.

## For James

1. Mock-up 2 was approved for the menu's row; the form behind it was not drawn, so look at it and its words.
2. Push the migration with the rest of the launch.
