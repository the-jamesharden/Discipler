# 31 - The AI guide

> **Triaged 2026-10-31 against the spec's "The AI guide", its mock-up 4 decisions and its triage decisions.**
> The screens and the face's SVG are in `.lavish/ai-guide/` (`build.mjs` holds the words and the SVG).

**What to build:** Ask Discipler, a bubble in the bottom-right of every Admin page that answers questions from Discipler's help docs only, on Claude Sonnet 5.5 through the Vercel AI Gateway.

**Blocked by:** 26, 34

**Status:** ready-for-human

## The bubble and the chat

- Face B, the Chat friend, with the gold "AI" tag, in mock-up 2's place; only on signed-in Admin pages, never on sign-in, sign-up or Leaders' pages.
- Until setup reaches 100% the label "Start your onboarding here!" always shows beside it; after that it reads "Ask Discipler" and shows only on hover.
- Pressing it opens a card above it, 384 pixels wide and up to 576 tall; on a phone the chat fills the screen.
  Its head: the face, "Ask Discipler", "Answers from the Help center" and a close button.
- Before 100%: "Hi! I can walk you through setting up Discipler, or answer any question about how it works.", the Admin's next setup step with its button (ticket 26), then "How do check-ins work?", "How do I add people to my Roster?" and "How do I pair a discipler with a disciple?".
- After 100%: "Hi! Ask me anything about how Discipler works." and "What does Needs Follow-Up mean?", "How do check-ins work?" and "How do I change the check-in time?".
- The box reads "Ask about Discipler…", with "Please don't paste names, phone numbers or prayer requests." under it, and "{n} questions left today" from 5 left down.
- A minus on the bubble's corner tucks it into a slim tab on the right edge, on every page, until the tab is pressed; that collapsed state is stored on the Admin and read through the page session.
- Opening the chat hides ticket 29's unpaired pop-up, which comes back when the chat closes.

## The words (approved 2026-10-31)

- About a person: "I can't see anyone in your church, so I can't answer about a particular person or relationship. Their row on Check-Ins shows every answer they have sent.", followed by the help page that fits.
- The 31st question: "That's 30 questions today, the most for one day. You can ask again tomorrow. The Help center has every answer I give, any time.", with the box greyed and reading "You can ask again tomorrow".
- A failed answer: "Sorry, I couldn't answer just now. Please try again in a minute."; it does not count toward the 30.

## The rule

- Its context is the system prompt, the help docs and the Admin's own messages; the route never adds the church's name, the Admin's name or any Roster data.
- No tools.
- Zero data retention is required on every request (`providerOptions.gateway.zeroDataRetention`).
- Replies render as sanitized Markdown with raw HTML and images off, linking only to `/help`, and each ends with a link to the Help page it came from.
- 30 questions a day per Admin, counted in Postgres.
- The AI Gateway spend is capped at $50 a month (James, triage 2026-10-31); past the cap the guide gives the failed-answer message and support@ is emailed once.
- The chat carries on while the Admin stays signed in; a new sign-in starts a fresh chat, and there is no New chat button.
- Chats are stored per Admin with the church, readable only by their author, never listed, and deleted after 90 days.
- Logs hold counts and token use, never message text.

## Acceptance

- The 31st question in a day is refused with the message above.
- A reply with an image or an outside link renders neither.
- A chat older than 90 days is gone.
- A new sign-in opens an empty chat.
- A request that reaches the Gateway past the $50 cap shows the failed-answer message, not an error page.

## For James

1. Turn on AI Gateway for the `discipler` Vercel project with its $50 monthly budget, if the agent's own access can't.

## Comments

### 2026-11-04: built on `wave4/31`, not merged, and not yet run against the real model

**What was built.**
`AskDiscipler` in `app/ask-discipler.tsx` draws the bubble from the page's one read, in both Admin shells, and `app/ask-discipler-bubble.tsx` is the chat.
The routes are `/help/ask/question`, `/help/ask/chat` and `/help/ask/tuck`.
`createAskDiscipler` in `src/service/ask-discipler.ts` holds the rule, `createPostgresAskDisciplerStore` holds the writes, and `src/platform/ai-gateway/guide-model.ts` is the one place a model is called.
`app/help/ask/reply.ts` makes a stored answer safe to draw, on every read, so a stored answer gets today's rule too.
The migration `20261104110031_ask_discipler.sql` adds `ministry_member.ask_discipler_tucked`, the tables `ask_discipler_question` and `ask_discipler_spend_stop`, the page function `ask_discipler_page`, and the field on `app.page_session()`, keeping every other field.
The tick deletes what is past the launch's keeping time, and reports it as `askDisciplerChats`.
`ai` is added at an exact version, 7.0.162.

**How it was checked.**
The full locked suite passed: 343 files with none skipped, and 5710 tests passed with 1 skipped, the older `it.skip` in `tests/integration/invitation-over-http.test.ts`.
The type check is clean.

`tests/integration/ask-discipler.test.ts` covers the limit, a burst, the church's midnight, a failed answer, a real 402 through the real adapter and route, the one email, what reaches the model, the logs, the author-only read, a new sign-in and the deleting.
`tests/integration/ask-discipler-over-http.test.ts` drives a built server, and no question in it reaches the model.

A production build in headless Chrome, at 390 and 1440 pixels, with real input events, beside every state of the mock-up.
For this the server process had a stand-in at the gateway's address, a fake key and canned answers, and it counted its own hits:

- Dots while answering, a starter, Enter, Shift-Enter growing the box, and the count going from 4 down to "1 question left today".
- The thirtieth answer, followed at once by the limit's words and the greyed box.
- A canned image, an outside link and an address written out, none of them drawn as an image or a link.
- A real 402 gave the failed-answer message, and the question stayed uncounted.
- The chat was read once on opening and never on page load, and it came back after a reload and was empty after a new sign-in.
- The minus and the tab across pages, and the pop-up above the bubble, hidden while the chat is open and back when it closes.
- The server log held none of the typed words, only counts and tokens.
- No horizontal scroll in any state, and no browser error.

That look found these, all fixed:

- A written-out address stayed on the screen as text, so it is now removed like one in angle brackets, and an email address stays.
- A phone's keyboard would have come up on opening, over the starters, so the box now takes the focus only where a device can hover.
- The box's text was under 16 pixels on a phone, which zooms the page on iOS, so it is 16 there.
- A pressed starter dropped the focus, so it now goes back to the box.

**What was not done, and could not be here.**
No real model call was made, as instructed, so how the model actually words an answer, whether it ends on the `Source:` line, and whether it says the words about a person exactly are all unobserved.
Those are what James should try first, with a few questions on Preview once the gateway is on.
`src/platform/ai-gateway/guide-model.ts` was read against the installed SDK's docs and the gateway's public model list, and its request shape was tested at the wire with a stand-in.
Nothing was changed in Vercel.

**What production needs.**
No provider key.
On Vercel the gateway provider signs in with the project's own OIDC token, and `AI_GATEWAY_API_KEY` is only for running it off Vercel.
No Anthropic key is used, and none should be added.

1. Turn on AI Gateway for the `discipler` project, with credits.
2. Set the $50 budget, which is Vercel's and not enforced in this code: check `vercel ai-gateway budgets set --help`, then something like `vercel ai-gateway budgets set project discipler --limit 50 --refresh-period monthly`.
3. Check the team's plan, because Vercel's docs say request-level zero data retention is only for Pro and Enterprise, and a request that asks for it with no such route fails.
   On a lesser plan every question would be a failed answer, and it would not look like a plan problem.
4. Set `ASK_DISCIPLER_ON=true` on the `discipler` project, and only then does anybody see the bubble.
5. Ask it a question about a person, one about the check-in time and one that is off the subject.

**Corrections to the ticket.**

- The gateway's name for the model is `anthropic/claude-sonnet-5.5`, with a dot, from its live list.
- Zero data retention needs the plan named above, which the ticket does not say.
- The ticket says past the cap "support@ is emailed once", and the build reads that as once in a month, the budget's own period.

**Decisions on gaps, each with the alternative.**

- `ASK_DISCIPLER_ON`, off unless it reads `true`.
  The alternative was no switch, which would go live on merge with no budget set and no gateway on, so every Admin would see a guide saying sorry, and spending would have no cap once it did work.
- Only the Anthropic route (`only: ['anthropic']`), because the privacy policy names Anthropic.
  All four routes that serve this model have zero data retention, so the alternative was any of them, with more uptime and a promise broken quietly by a fallback.
- The day is the church's own, counted to its midnight.
  The alternative was UTC, which starts a Pacific pastor's new day at 4pm.
- The limit's words and the greyed box come straight after the 30th answer, as the mock-up's `limit` draws, and the server also refuses a 31st with 429.
  The alternative was to wait for a 31st try, which matches "The 31st question" more literally and costs the Admin a question typed for nothing.
- One table, a row per question and answer, with a chat being the rows of one sign-in's `session_id`.
  The alternative was a chat table and a message table, with nothing to say on the chat row.
- A failed answer deletes its row, so it does not count.
  A process that dies between asking and answering leaves its row counted, which costs one question and is never shown, rather than holding a lock while a vendor thinks.
- The last 10 exchanges of a chat go along with each question.
  The alternative was all of them, and a sign-in can last a year, so each question would cost more than the last.
- A question over 1,000 characters is stopped by the box, and the server treats one that gets past as a failed answer, uncounted.
  The alternative was new refusal words for a case no Admin can reach by typing.
- Low effort, at most 2,048 tokens, 45 seconds and one retry, and an answer cut off or declined by the model is a failed answer.
  The alternative was to show part of an answer.
- Any 402, budget or credits alike, sends the one email, recorded per UTC month in an operator-only table, and a send that fails takes the record back so the next question tries again.
  The alternative was to rely on the email vendor's own idempotency, which lasts a day.
- The source link is drawn by the product from the model's last line, and a missing or unknown one reads "Help center" and goes to `/help`.
  The alternative was to trust the model to write the link, and a made-up page would go nowhere.
- A reply about a person also gets the source link, because the ticket says each answer does.
  The mock-up's `refusal` draws no such row, so James may want it gone there.
- Links in the chat open a new tab, so the chat stays.
  The alternative was the same tab, which leaves the chat behind, since Help pages have no bubble.
- The routes are under `/help/ask/`, so no new top-level name is taken, and the chat is read on opening, so pages stay one read.
- The bubble's onboarding state reads the church's progress and not `SETUP_METER_ON`, so an unmetered church still leads with its next step.
- The minus is always shown where a device cannot hover, since the mock-up only draws it on hover and a phone could otherwise never tuck.
- Search's "Ask Discipler" entry stays undrawn, because the circle has no address and the switch could make a link go nowhere.
  This is in `docs/open-questions.md` under *search once Ask Discipler ships*, with the alternatives.

**Draft words for James.**
Everything on screen is the mock-up's, in `app/help/ask/copy.ts`.
The drafts are the email to support@, `askDisciplerSpendStopped` in `src/service/support-alerts.ts`, the screen-reader labels, and the model's instructions in `app/help/ask/instructions.ts`.
They are also in `docs/open-questions.md` under *sign-up's numbers and wording*.

**What later tickets build on.**

- A new reader of the help docs goes through `helpCenterAsText()`, and any help page added is in the guide's next answer, with its address.
- A migration replacing `app.page_session()` keeps `ask_discipler_tucked`.
- A new page in an Admin shell has the bubble with no work, and its pop-ups need `body:has(.ask-wrap, .ask-tab)` in mind, as `.unpaired` has.
- The base of this branch is behind `launch/wave-4`, and `aa02c4f` was cherry-picked here for the suite to pass, so it should merge with no conflict.
