# 27 - The onboarding modal and the tour

> **Triaged 2026-10-31 against the spec's "Setup meter and onboarding", its mock-up 3 decisions and its triage decisions.**
> The screens are `.lavish/onboarding/s0-welcome.html`, `s1-modal.html`, `s1-modal-existing.html` and `demo.html`, built by `demo.mjs`.

**What to build:** The first-run onboarding modal with James's welcome video, its three cards and its "what happens next" checklist, and the seven-step product-demo tour.

**Blocked by:** 26, 30

**Status:** ready-for-agent

## The modal

- Eyebrow "ONE LAST THING", headline "Get {Ministry} running", and the setup meter's "{n}% complete · {done} of 7" with its progress line.
- It opens on each Admin's first sign-in after this ships, including the Admins of churches that existed before launch, and has a close button.
- On that first opening only, James's welcome video plays first and waits for Continue, which opens the cards.
  Restart onboarding in the Help menu opens straight to the cards at the church's current progress.
- The video's address lives in a repo file; while it is empty the modal opens straight to the cards.
- The three cards, each with a picture on top and its button level with the others, anything extra sitting above the button:
  - "Take the 2-minute tour", "Watch Example Ministry, a church already running on Discipler, at work.", Start the tour (Take it again once done), over a crop of Overview.
  - "Send yourself a test check-in", over a phone showing the real composed first text; the card's body and button belong to ticket 28.
  - "Speak with the team directly!", "Office hours on Zoom every 2 weeks. Next: {date}, at {time}.", Join on Zoom, over a photo of James; the date, time and link come from ticket 30's office hours file.
- "What happens next", with an Edit settings link to Settings' check-in section: six lines with green checks, generated from the church's settings and the real constants (the check-in day and hour, `REMINDER_AFTER_HOURS` in `src/domain/check-in.ts`, `ACCEPTANCE_REMINDER_DAYS` and `ACCEPTANCE_ESCALATION_DAYS` in `src/domain/relationships.ts`, `INVITATION_LIFETIME_DAYS`), never hand-typed numbers, worded as `s1-modal.html` words them.

## The tour

- A full-screen product demo of Example Ministry in seven steps, exactly as the spec's mock-up 3 decisions describe: the gold DEMO bar with "{n} of 7" at its right once started, the Start your demo button on the dimmed page, a moving and clicking cursor, a camera that glides and never puts anything under the bar or the caption, Back and Next at the middle of the screen's edges, Next faint until the scene ends, and the last step's three stops at Help, Settings and the account menu.
- Nothing on its pages can be clicked, and none of it is the church's own data.
- Its pages are built from Example Ministry's real screens; `.lavish/onboarding/demo.mjs` is the script to follow, and a script in the repo regenerates them, so a changed screen can be recaptured rather than redrawn.
- On a phone it shows the app's phone layout at full size, the camera only glides up and down, Back and Next sit in the caption's footer, and a note the caption would hide shows above what it points at.
- The last Next reads Done, and only Done ticks setup step 2.

## Acceptance

- Changing the check-in hour in Settings changes the checklist's line.
- An Admin's first sign-in plays the video; closing the modal and choosing Restart onboarding opens the cards at the same progress, with no video.
- Leaving the tour on step 4 does not tick step 2; pressing Done does.
- An existing SAU BCM Admin sees the modal on their first sign-in after launch.

## For James

1. Provide the photo of yourself.
2. Record the welcome video and give its address.
