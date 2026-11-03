# 26 - The setup meter and the badge

> **Triaged 2026-10-31 against the spec's "Setup meter and onboarding", its mock-up 3 decisions and its triage decisions.**
> The screens are `.lavish/onboarding/s1-modal.html` (the bar at 0%), `s3-sent.html` (29%), `s6-popup.html` (57%) and `s8-badge.html` (the badge).

**What to build:** "Jumpstart discipleship", a slim bar under the tabs on every Admin page that counts seven setup steps for the church, and a badge once per Admin at 100%.

**Blocked by:** 23

**Status:** ready-for-agent

## The steps

Each step's words and the button shown when it is next, as drawn:

1. Confirm your check-in time - Edit settings (opens Settings' check-in section).
2. Take the 2-minute tour - Start the tour.
3. Send yourself a test check-in - Send test.
4. Add people to your Roster - Add people.
5. Get your first Intake back - Share your link.
6. Create your first relationship - Pair someone.
7. First relationship accepted - See who is waiting.

What ticks each one (James, triage 2026-10-31, for step 1):

1. An Admin presses Save on Settings' check-in day and hour, changed or not.
2. An Admin presses Done on the tour's last step (ticket 27).
3. An Admin sends a test check-in (ticket 28).
4. The Roster holds one person who is not an Admin of the church.
5. The church receives its first Intake submission.
6. The church's first relationship is created.
7. The church's first relationship is accepted.

## The bar

- It sits under the tabs, above each page's own content, on every Admin page until 100%; never on Leaders' pages, sign-in or sign-up.
- Folded: "Jumpstart discipleship", "{n}% complete · {done} of 7", a thin progress line, and "Next: {step}" with that step's button.
- Hovering over it for 0.4 seconds, focusing it, or tapping it on a phone grows it to show all seven steps as checkboxes that cannot be clicked, with the next step highlighted and carrying its button.
  Passing the pointer over it does nothing.
- A step this Admin has not seen completed pops its checkbox the next time they see the bar, throws confetti from it and draws a line through its words.
  With reduced motion asked for, it is simply ticked.
- There is no meter pill in the header and no points anywhere.

## The rule

- The meter belongs to the church, is the same for every Admin, and never goes down, even if a step is later undone.
- Each step is derived from the church's stored history, not from a counter.
- Nothing about ratings, meetings or Follow-Up counts.
- Which completed steps and whether the badge each Admin has seen is stored on the Admin, so the confetti and the badge play once per Admin.
- The percentage and the steps come through the one page-session read (`app.page_session()`, ADR-0023).
- Churches that existed before launch (SAU BCM, Anthem, Example Ministry) show their real progress from their history (James, triage 2026-10-31).

## The badge

- At 100% it plays once for each Admin, on their next Admin page: a green seal with a sprout and gold rays and no word on it, over "{Ministry} is up and running", "All seven steps are done, and your first relationship has been accepted. Check-ins go out every {day} at {time}." and a "Thank you!" button.
- After it, the bar is gone for good for that Admin.

## Acceptance

- A church with three steps done shows "43% complete · 3 of 7".
- Ending the only relationship leaves the bar where it was.
- Pressing Save on the check-in section without changing it ticks step 1.
- A second Admin sees the badge once, on their next sign-in after 100%, and never again.
- SAU BCM shows its real progress on the first sign-in after launch.

## Comments

**Built (2026-11-03, branch `launch/26-setup-meter`).**
`supabase/migrations/20261104102600_the_setup_meter.sql` adds `app.setup_meter_of(ministry)` and one key, `setup`, to `app.page_session()`, copied from the newest definition with nothing else changed.
The bookmark is two columns on `ministry_member`: `setup_steps_seen` and `setup_badge_seen_at`.
`src/domain/setup-meter.ts` holds the steps and the history names, `app/setup-meter-copy.ts` holds every word and each step's address, and `app/setup-meter-bar.tsx` plays it.

**One read, counted.**
From the Kong log, with the bar drawn on each page, each of these made exactly one REST call: `/overview`, `/check-ins`, `/suggested-pairs`, `/follow-up`, `/materials`, `/materials/new`, `/roster`, `/roster/{person}`, `/settings`, `/intake-forms`, `/account`, `/relationships`.
Each "has this happened" is a single probe of a partial index, `ministry_event_setup_step_idx`, and the whole thing short-circuits once this Admin has seen the badge.

**Decided: Start the tour and Send test (steps 2 and 3).**
Their tickets are not built, so each step's address in `STEP_COPY` is `null`.
A step with no address is listed in the bar with no button, and "Next:" passes over it to the first step that has one.
The alternatives were a "Next:" line with no button, a greyed button, or hiding the bar until 27 and 28 ship; the first two lead an Admin to something that does nothing, and the third loses SAU BCM's real progress at launch.
The consequence, on purpose: no church can reach 100% or see the badge until 27 and 28 ship, and a church with only those two left, SAU BCM's shape at 5 of 7, shows no "Next:" line at all.
Each of 27 and 28 has one line to change, the address, and one thing to record.

**Decided: what 27 and 28 record.**
Ticket 27 appends `setup.tour_finished` with the builder `tourFinished`, and ticket 28 appends `setup.test_check_in_sent` with `testCheckInSent`, both in `src/domain/setup-meter.ts`.
The alternative was reading ticket 28's table, which does not exist yet and would have had this migration name it.
The SQL already reads both, so neither ticket has to touch the meter's read.

**Decided: an unchanged Save writes its own event.**
It appends `setup.check_in_time_confirmed`, not an empty `ministry.settings_changed`, because that event's meaning is that something changed.
Pressing Save unchanged over and over appends each time, which I accepted as rare and harmless.
Any Save on the one Settings form counts, since the form has one button, and any past `ministry.settings_changed` counts for a church from before launch.

**Decided: row or event for steps 4 to 7.**
Each reads its event or the row, because a church from before launch has rows that no event describes, such as a pilot's hand-made people.
The event half is what keeps a step from going down: ending or removing the row leaves the event.
A row-only step could still go down if that row were deleted, which is the pre-launch shape only.
Production was not read, so this is proven against a fixture of SAU BCM's shape and not its real numbers.

**Decided: the bar opens itself to play.**
The ticket's checkboxes are hidden when the bar is folded, so unseen steps grow it, pop in turn, and fold it again.
The alternative was waiting until the Admin opens it, which most would never see.
An Admin at a church from before launch sees all its done steps pop once, in turn.

**Decided: the badge is recorded as it plays.**
It plays once however the Admin leaves it, rather than replaying until "Thank you!" is pressed.
A reload in the moment before the record lands can replay it, which is harmless.
"Thank you!" is still a real form that works with no script, landing on Overview.
Steps are not played separately when the badge is due.

**Decided, smaller.**
"Pair someone" and "See who is waiting" both go to `/roster`: Follow-Up lists unaccepted relationships only after the escalation wait, and the empty Overview already says to pair from the Roster.
Every undone step with an address carries its button when grown, as the mock-up draws, with the next one highlighted.
The route is `/settings/setup-seen`, so no new top-level name.
Pages under `PageShell` have the bar under the header, since they have no tabs.
Help pages have no Admin tabs and are not counted as Admin pages; the reset-done page draws outside the shell and has no bar.
The seen bookmark is not ministry history and writes no event.

**Words.**
All from this ticket and the mock-ups, except one draft: "(done)", the text only a screen reader hears on a ticked step.

**For ticket 27.**
A first sign-in at a church from before launch would play the bar's confetti behind the onboarding modal, so the bar should hold back while the modal is open; ticket 27 carries the same note.
