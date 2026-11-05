# 27 - The onboarding modal and the tour

> **Triaged 2026-10-31 against the spec's "Setup meter and onboarding", its mock-up 3 decisions and its triage decisions.**
> The screens are `.lavish/onboarding/s0-welcome.html`, `s1-modal.html`, `s1-modal-existing.html` and `demo.html`, built by `demo.mjs`.

**What to build:** The first-run onboarding modal with James's welcome video, its three cards and its "what happens next" checklist, and the seven-step product-demo tour.

**Blocked by:** 26, 30

**Status:** ready-for-human

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

The setup meter's bar is off on production until this ticket and its partner ship.
Whichever of 27 and 28 ships second sets `SETUP_METER_ON=true` on production, or removes the switch, and fixes the two bar faults listed at the end of ticket 26.

## For James

1. Provide the photo of yourself.
2. Record the welcome video and give its address.

## Comments

### From building ticket 30 (2026-11-03)

The welcome window's office hours line reads `NEXT_OFFICE_HOURS` through `upcomingOfficeHours`, and `speakWithTheTeamLine` in `app/help/office-hours.ts` words it, leaving out its Next where there is no date.

### From building ticket 26 (2026-11-03)

The setup meter already reads step 2, so this ticket has only to record it and give the bar its button.

1. When an Admin presses Done on the tour's last step, append `tourFinished({ ministryId, finishedBy, at })` from `src/domain/setup-meter.ts` as history, through a command like every other Admin act.
   Leaving the tour early records nothing.
2. Set `tour`'s `href` in `STEP_COPY` in `app/setup-meter-copy.ts`.
   The button and its place in "Next:" appear from that one line, and `tests/app/the-setup-meter-words.test.ts` and `tests/integration/the-setup-meter-over-http.test.ts` are the tests that then say to change.

The bar plays a step this Admin has not seen as soon as a page mounts, and marks it seen at once.
The modal opens over it on an Admin's first sign-in, so that Admin's confetti would play behind the modal: hold the bar back while the modal is open, or let it play only once the modal has closed.

### From building ticket 27 (2026-11-04)

**What was built.**

- The modal, on Overview: the welcome step when `WELCOME_VIDEO_URL` in `app/help/setup-videos.ts` holds an address, then the three cards and the six lines, with a close button and Escape.
- Help's Restart onboarding, which is `/overview?onboarding=cards` and opens the cards at the church's current progress with no video.
- `ministry_member.onboarding_opened_at`, one per Admin, read through `app.setup_meter_of`, so an existing SAU BCM Admin sees the modal on their next Overview.
- The tour at `/overview/tour`, its seven steps ported from `demo.mjs` into `app/overview/tour/play.ts`, and Done, which runs `setup.finish_tour` and is the only thing that appends `tourFinished`.
- `npm run tour:capture`, which seeds Example Ministry through the product's own commands on a test clock and writes `app/overview/tour/pages.generated.ts` and `public/tour/overview.png`.
  It needs this checkout built and served against the local stack, under the shared lock; the head of `scripts/capture-tour.ts` says how.

**Decisions on gaps, each with its alternative.**

1. The modal is drawn on Overview only, because ticket 18 lands there and sign-in has no `next`.
   The alternative was drawing it in the shell on every Admin page, which adds to every page's read and fights with each page's own pop-ups.
2. "First sign-in" means this Admin's next Overview after shipping, so a session already open sees it too.
   The alternative was a sign-in hook, which an already signed-in Admin would miss until their session ended.
3. Opened is recorded by the page's script as the modal opens, as the bar records what it has played, so a reload does not replay it.
   The alternative was recording on the close button, which replays the video to anyone who leaves without closing.
4. The data comes through `app.setup_meter_of` rather than a replaced `app.page_session()`, which adds no read and meets no other ticket's replacement.
   The cost: a church past the badge now makes two primary-key reads there rather than one.
5. The tour is its own page, not an iframe, because ticket 37's `frame-ancestors 'none'` would refuse one.
   Its camera is `inert` and the capture strips every script, address and form action as well.
6. Close and Done both go back to the modal's cards, including when the tour was started from the bar on another page.
   The alternative was returning to the page it started from, which would need that address carried through the tour.
7. The captions are Example Ministry's words, mentors and Mondays at 9am, whatever the watching church calls theirs, because the pages behind them say so.
   The alternative was the viewer's own nouns over pages that say mentor, which reads as a mistake.
8. The modal holds back the bar's confetti, the badge and the unpaired pop-up, through `afterOnboardingCloses` in `app/overview/onboarding/hold.ts` and one CSS `:has` rule.
9. The video is a poster until pressed, so nothing third-party loads for an Admin who does not press it, and it takes Loom, YouTube (through youtube-nocookie) or a file.
   The alternative was autoplay, which the ticket's "plays" could mean, and which browsers refuse with sound; please check this is what you meant.
10. With no photo a plain figure is drawn, without the mock-up's "James's photo" tag, and the mock-up's "James's video" placeholder note is dropped.
11. The test card shows only its phone and heading until ticket 28, and the team card has no button or Next while `NEXT_OFFICE_HOURS` is null.
12. The modal's thumbnail is a PNG crop rather than the mock-up's scaled iframe, for the same reason as 5.
13. The seed is one coherent set, because the mock-up's Overview and Roster disagreed about Grace Lee.
    Grace is seeded as having answered Mentor and Emily as Mentee, so the Pair pop-up opens on Disciples somebody with Emily first, which is what the tour's note says.
    The rest of the pairs join a week apart so the growth chart climbs, reading "+2 in 6 weeks".
14. The Follow-Up note points at the concern's row, because the list has no Resolve button now: Resolve is behind opening the row.
    The note's words are unchanged.
15. The phone's check-in comes from the real composers, so it reads A to D where the mock-up's read A to C.
16. Check-in dates inside the captured pages are frozen at capture time, so the tour says "Sent Nov 2" until someone recaptures.
17. The phone sits at 8.5rem from the right rather than the mock-up's 6rem, because at 1440 wide the Next button covered its reply bubbles.
    The camera's third stop no longer goes down past the top of the page, which left bare paper under the bar.
18. A church whose subscription has ended does not have the modal open by itself, because it can do nothing the modal offers, and Restart onboarding still opens it (James, 2026-11-05).

**Draft words for James** are in `docs/open-questions.md` under *sign-up's numbers and wording*.

**For James.** The two items above still stand: the photo goes in `JAMES_PHOTO` in `app/overview/onboarding/james-photo.ts`, and the video's address in `WELCOME_VIDEO_URL`.
While the address is empty the modal opens straight on the cards, and nothing has played a real video: the welcome step was looked at with a temporary address, up to the poster, and not pressed.

**What later tickets must build on.**

Ticket 28:

- Set `test_check_in`'s `href` in `STEP_COPY` in `app/setup-meter-copy.ts`.
- Fill the slot marked in `app/overview/onboarding/modal.tsx`: the body, the agreement, Verify and the button, above the card's foot.
- Reuse `testCheckInQuestion` in `src/domain/outbound-copy.ts`, which the card's phone already draws.
- Whichever ships second is 28 now: set `SETUP_METER_ON=true` on production or remove the switch, and fix the two bar faults at the end of ticket 26. This ticket left the switch alone.

Ticket 37:

- The CSP must allow frames from `www.youtube-nocookie.com` and `www.loom.com` once a video exists.
- The tour's captured Intake page draws its QR codes as `data:` images, so `img-src` needs `data:`.
- The tour page and the modal use no inline script, and the captured pages hold a `<style>` block of the shell's.

Ticket 31: its bubble should wait for the modal through `afterOnboardingCloses`, as the bar and the unpaired pop-up do.

Anyone changing a screen the tour shows: run `npm run tour:capture` and take a look, because `tests/app/the-tour-capture.test.ts` only says that what the steps point at is still there.
