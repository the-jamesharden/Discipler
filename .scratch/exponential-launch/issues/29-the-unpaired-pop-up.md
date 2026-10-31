# 29 - The unpaired pop-up

> **Triaged 2026-10-31 against the spec's "The unpaired pop-up" and its mock-up 3 decisions.**
> The screens are `.lavish/onboarding/s6-popup.html` and `s6-popup-one.html`.

**What to build:** A dismissible bottom-right card on Overview telling the Admin how many people need pairing or need an Intake link.

**Blocked by:** Nothing

**Status:** ready-for-agent

## The card

- Headed "Waiting on you", with one line for each count above zero: "{n} people are ready to pair and aren't in a relationship yet." and "{n} people haven't filled in their Intake form yet.", singular when the count is one, as `s6-popup-one.html` draws it.
- Pair them opens Suggested Pairs.
- Send Intake links opens the Roster showing only people who haven't sent an Intake; the Roster has no such list today (`app/roster/lists.ts`), so this ticket adds one, reachable by its own address.
- It is the larger size drawn in round 2: wider, with larger words and buttons.

## The rule

- It counts Ready to Pair people in no relationship, and No Intake Submitted people, leaving out Admins and anyone opted out.
- It shows only when either count is above zero.
- It shows on the first Overview visit of each sign-in and of each new day, in the church's timezone.
- Closing it, or moving to another tab, hides it until the next sign-in or the next day.
- Its counts come from Overview's existing read.
- Ticket 31's chat hides it while open; that part is ticket 31's.

## Acceptance

- Signing in shows it on Overview; visiting Roster and coming back does not show it again that day.
- An opted-out person is never counted.
- Send Intake links lands on a Roster of only the people who haven't sent an Intake.
