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
