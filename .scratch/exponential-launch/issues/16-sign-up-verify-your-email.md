# 16 - Sign-up: verify your email

> **Triaged 2026-11-03 against the spec's "Self sign-up" and "Decided in the mock-up 1 review", and the approved mock-up.**
> The screen is `.lavish/signup-checkout/s3-code.html`, and `?state=wrong` shows the wrong-code line.
> Where this ticket as first written said "Change email", the mock-up James approved says "Use a different email", and that is what is built.
> Both go through page one, as ticket 11 requires.

**What to build:** The page where the person enters the 6-digit code emailed to them.

**Blocked by:** 15

**Status:** shipped

## The page

- `/signup/code`, subtitled "Create an account", showing "Step 1 of 3" and "Check your email".
- "We sent a 6-digit code to **{email}**. Please enter it below. It works for 10 minutes."
- One box for the 6-digit code, labelled "Your code", accepting a pasted code, and a "Continue" button.
- "Send a new code in 0:42" counts down, and turns into a "Send a new code" link after 60 seconds.
- "Use a different email" goes back to page two, through page one, where the email and phone are typed again (James, 2026-11-03; ticket 15's decisions).
- Wrong, expired and too-many-tries each get a plain, friendly message.
- "Can't find it? Please check your spam or promotions folder. The email comes from notify.trydiscipler.com."

## The stopping point

Step 4 onward is ticket 17, so the flow stops cleanly after the email is verified.
The right code goes on to `/signup/account`, the address ticket 17 fills.
Until then that page shows "Step 2 of 3", "Your account", "Your email is confirmed: {email}." and "The next step, setting up your account, isn't open yet.", with no link and no button.
No account, church or consent exists at that point, and the attempt lapses by itself after an hour.
It never shows on production while `SIGN_UP_OPEN` is off, and is what staging shows until ticket 17 replaces the page.

## Acceptance

- The right code goes on to Set up your account, which is the stopping point above until ticket 17.
- A sixth try is refused even with the right code, and a new code can be requested.
- An expired code says so and offers a new one.

## For James

1. Approve the page in mock-up 1.
   Done.
2. Approve the wording of the two emails and the refusal sentences, which are still ticket 11's drafts.

## Comments

### Built (2026-11-03)

- `app/signup/code/` is the page, and `app/signup/account/page.tsx` is the stopping point.
- `tests/app/the-sign-up-pages.test.ts` renders every page through the real service on the in-memory store, and `tests/integration/sign-up-is-shut-over-http.test.ts` holds them shut on a built server.

### Decisions made

- **The box has no `maxLength`.** It would cut a pasted "482 913" to "482 91" before the page saw it, so the page keeps the first six digits of whatever arrives.
- **"Continue" stays on after the tries run out.** Pressing it says again that the code has stopped working, and the alternative was a greyed button with its reason elsewhere on the page.
- **Too many tries still waits out the 60 seconds**, because the service counts that wait for every send.
  The alternative was letting a dead code skip it, which ticket 11's caps did not plan for.
- **A new code empties the box and says so**, in a drafted line, "We sent a new code to {email}.", because the mock-up does not draw that moment.
- **The box has the focus on arriving**, so a code can be pasted at once.
  The mock-up cannot show this either way.
- **The stopping point's words are drafts** that live only until ticket 17 replaces the page.
