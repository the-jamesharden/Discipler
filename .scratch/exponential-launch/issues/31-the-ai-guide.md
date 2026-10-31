# 31 - The AI guide

> **Triaged 2026-10-31 against the spec's "The AI guide", its mock-up 4 decisions and its triage decisions.**
> The screens and the face's SVG are in `.lavish/ai-guide/` (`build.mjs` holds the words and the SVG).

**What to build:** Ask Discipler, a bubble in the bottom-right of every Admin page that answers questions from Discipler's help docs only, on Claude Sonnet 5.5 through the Vercel AI Gateway.

**Blocked by:** 26, 34

**Status:** ready-for-agent

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
