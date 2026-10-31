# 15 - Sign-up: are you human, email and phone

**What to build:** The first two pages of sign-up at `app.trydiscipler.com/signup`: the automatic human check, then one page asking for an email and a mobile phone.

**Blocked by:** 11

**Status:** needs-info

## The pages

- Page one runs Cloudflare Turnstile, automatically when it can, and goes on by itself when it passes.
- Page two asks for an email and a mobile phone.
- Under the phone field, word for word: "By continuing, you agree to receive texts from Discipler at this number, including sign-in codes and test check-ins. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help."
- Continuing sends the email code (ticket 11) and records nothing permanent yet.
- The phone's consent is recorded with `consent_source` `ministry_setup` when the church is opened in ticket 17, not before.
- A referral code or `EXPO26` arriving in the address is carried through the flow in the address or a hidden field, not a cookie.

## Acceptance

- Without a valid Turnstile token no code is sent.
- A non-US mobile number is refused with a plain message.
- The fine print appears exactly as above.
- The pages work at phone width with no sideways scrolling.

## For James

1. Approve mock-up 1 before this is built.
