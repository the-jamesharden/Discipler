# The Exponential launch: self sign-up, billing, onboarding and the shared numbers

**Status:** needs-triage

Everything James and Claude settled in the grilling of 2026-10-25 to 2026-10-29, written down so it can be built.
James confirmed shared understanding on 2026-10-29.
It started from a list of features James liked in Fathom's first-run experience, and grew to include a church signing itself up, Stripe billing, and a shared set of Discipler texting numbers.
No feature is cut.
Where a later answer replaced an earlier one, only the later answer is written here.

## The dates

- Exponential, the church-planting conference, starts on Sunday 2026-11-08 and ends on 2026-11-13.
- Everything in this spec is live on production by Wednesday 2026-11-04.
- James rehearses the whole booth flow on his own phone on Thursday 2026-11-05: scan the QR code, sign up with a real card and refund it, send a test check-in, and finish onboarding.
- Friday 2026-11-06 and Saturday 2026-11-07 are kept for fixes.
- Work with no screen starts at once; each screen is built as soon as James approves its Lavish mock-up.

## The mock-ups

Every new screen, button or message is shown to James as a Lavish mock-up made from the real captured page before it is built.
They come one at a time, in this order:

1. Sign-up and Checkout, including the sign-in box and "Forgot password?".
2. The top nav and search, with several search-bar variants, the Settings gear, the avatar, the setup meter and the Help menu.
3. The onboarding modal, the tutorial, the test check-in, the unpaired pop-up, the What's new card and the office hours card.
4. The AI guide bubble, with three SVG variants of a smiley friend icon carrying an AI badge.
5. The Refer page, and Settings with its Billing row and the billing banners.

Words sent to a real phone are James's, so each composed text is shown in the mock-up that introduces it.

## Self sign-up

A church can now sign itself up at `app.trydiscipler.com/signup`.
This reverses ADR-0019, which rejected a sign-up page, and `docs/product-rules.md` ("There is no sign-up surface").
Setup Links stay, for churches James chooses to comp.
The flow is modelled on Planning Center's sign-up.

1. **Are you human.** A Cloudflare Turnstile check runs on its own page, automatically when it can.
   The token is verified on the server before anything costs money.
2. **Email and mobile phone.** One page asks for both.
   Under the phone field sits this fine print, word for word: "By continuing, you agree to receive texts from Discipler at this number, including sign-in codes and test check-ins. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help."
   Continuing records a consent for that phone with a new `consent_source` value, `ministry_setup` (the enum is `('pastor_link', 'qr_code')` today, from `20260827000200_intake_is_the_consent_gate.sql`).
   That consent lets Discipler text the Admin without changing their Roster status, because participation still needs an Intake.
3. **Verify your email.** A 6-digit code is emailed through Resend.
   It expires after 10 minutes, allows 5 tries, and can be resent after 60 seconds.
4. **Set up your account.** One page, headed "Set up your account" with "* indicates required information" under it, asks in this order:
   - Church or organization name*.
   - Full name*.
   - Where did you hear about us? (optional dropdown: Instagram, Online (Google), A friend, Another ministry, Conferences, Other media). A referral link preselects "Another ministry".
   - Login email, already filled in, greyed out and locked.
   - Choose a password (minimum 8 characters)*.
   - Timezone, labelled optional, a dropdown of common zones with US zones first, preselected from the browser and never stored empty.
   - Is your church a church plant? (optional, Yes or No, No preselected). Yes opens the application on the same page (James, round 3: the plant questions come before payment, which reverses Q49).
   - How would you like to pay?* Monthly or Yearly ("Save 20%"), each showing one price and the offer's percentage: the only place a price appears in sign-up.
   - A checkbox agreeing to the Terms of Service and the Privacy Policy, each hyperlinked, recorded with the terms version and the time.
   The **Start free trial** button turns on only when every required field holds a real entry.
   Under it: "Next, you'll add a card or bank account. You won't be charged today."
5. **Payment.** Stripe's Payment Element (Apple Pay and Link through the Express Checkout Element, card, and US bank account by instant bank sign-in) inside Discipler's own sign-up card, headed "Add a card or bank account", with the trial end date and no prices, and a "Start my free trial" button.
   This replaces Stripe Checkout because Checkout always repeats its own price summary and James wants prices shown once (mock-up 1, round 3).
   The subscription is created on the server with its trial, and the Element confirms its setup intent; card data stays in Stripe's frames.
   A card or bank account is required up front.
6. **Overview.** The Admin lands signed in on Overview with onboarding open.

Decided in the mock-up 1 review (2026-10-29):

- Every sign-up page is subtitled "Create an account".
  On the sign-in page, "Create an account" is a full-width green button styled like "Sign in", and "Sign in" is the plain, not highlighted, button.
- The human-check page has no explanatory line under the widget.
- During sign-up, dollar amounts appear only on Stripe's payment form.
  After sign-up they do show: on Billing, its Settings card, the restart page and the trial-ending email (James, mock-up 5).
- The email code is one box.
- The help lines under the password ("Use at least 8 characters.") and the timezone stay; the one under "Where did you hear about us?" is removed. An `EXPO26` link prefills "Conferences", a referral link "Another ministry".
- Stripe names the product "Discipler for Churches", with no description.
- The special-offer screen fires confetti once from the top and bottom edges (none when the device asks for reduced motion), and does not say "applied automatically".

The marketing site gets a "Start your ministry" button.
`trydiscipler.com/r/<code>` redirects to sign-up carrying a referral code.

## Signing in

- Sign-in is one box, "Email or phone", and a password.
  This supersedes ADR-0008 for Admins who signed up with an email.
- An Admin with a verified email can use "Forgot password?", which emails a one-time reset link that expires in 30 minutes.
  Leaders keep today's Admin reset.
- The password minimum is 8 everywhere, with a blocklist of common passwords and a maximum of at least 64 characters.
  `minimum_password_length` in `supabase/config.toml` (6 today) is brought to 8 so it matches `SHORTEST_PASSWORD` in `src/domain/accounts.ts`.
- An authenticator-app second step for Admins is the first ticket after the conference, and is not part of this spec.

## Prices

- One flat price, billed monthly or yearly (James, mock-up 1).
- Yearly is 20% off monthly: $931.20 a year for up to 200 people, $1,411.20 a year above 200.
- Each billing choice shows one price and the offer as a percentage, never two prices: "$97 a month, 20% off your first year", "$931.20 a year, 20% off your first year".
  Only the restart page, which has no offer, strikes through twelve monthly payments under Yearly (James, mock-up 5).
- Nothing is charged at sign-up: the trial's first invoice is $0, the card or bank account is saved, and the first real charge comes when the free days end (James, mock-up 1).
- $97 a month for a church with up to 200 people in active relationships, Disciplers and disciples counted together.
- $147 a month above 200.
- Every church starts on $97.
- A church that stays above 200 for a whole month causes an email asking someone to follow up.
  There is no automatic upgrade.
- Every church gets a 30-day free trial, with a card or bank account required up front.
- Stripe Tax stays off.

## Offers

### The Exponential special offer

- It is presented as the "Exponential special offer", never "founding church rate" and never as a coupon.
- Opening sign-up with `EXPO26` first shows the offer over the whole screen, bold and in capitals ("EXPONENTIAL SPECIAL OFFER", "60 DAYS FREE", "THEN 20% OFF YOUR FIRST YEAR"), closed by "Claim my offer".
- The code is `EXPO26`.
  The booth QR code opens sign-up with the code already applied, and it can also be typed in from a flyer.
- It gives 60 days free instead of 30, then 20% off the first 12 months (or the first year's bill for a yearly church), shown to the church only as "20% off your first year".
- The 12 months start at the first paid bill, after the free days.
- The code works until the end of 2026-12-11, Pacific time.
  After that it is refused with "That code has expired, but your free trial still applies.", and sign-up carries on at the normal price.
- Each church can use it once, and it has no overall limit.

### A church invited by another church

- The invited church's first paid month is free, as a 100%-off first invoice after the trial.
- It does not stack with the Exponential special offer; whichever saves the church more applies, which is the Exponential special offer.
- The inviting church still earns its credit when the invited church pays its first real bill, whichever offer the invited church got.

### Church plants

- A church plant gets 12 months free, after its trial, once James or Lerone approves it.
- A church plant is one that launched in the last 3 years or is launching in the next 12 months (preselected in mock-up 1; James said nothing else needed changing).
- The application's lead pastor field is prefilled with the Admin's name and can be changed.
- The application asks for the launch date, the sending or partner church, average weekly attendance, the lead pastor, and anything else.
- A submitted application emails james@trydiscipler.com and lerone@trydiscipler.com.
- The church starts its ordinary trial at once.
  Approval is an operator command, run the way a Setup Link is made today, which turns on the free year and emails the church.
  There is no approve link in the email, because whoever can read that inbox could then approve plants.
- A plant that signed up with `EXPO26` gets 60 days free, then its approved free year, then the Exponential special offer's year at 20% off.
- A plant offer and a referral month do not combine, and the plant offer wins.

## Billing

- Stripe comes through the Vercel Marketplace, using Stripe's Payment Element inside Discipler's sign-up card and the hosted Customer Portal.
- The Stripe webhook is the only writer of billing state.
- Payment failure: everything keeps running during Stripe's retries, with a banner for Admins.
- When a subscription ends, check-ins stop, the dashboard turns read-only with a page to restart, history is kept, and participants are never texted about billing.
- Any Admin of the church can manage billing.
- Settings gains a Billing page of Discipler's own (James, 2026-10-29: "make sure to have it be discipler page that shows the stripe part").
  It shows the plan, the trial or next payment date and amount, any offer in force, the card brand and last four or the bank name, and past invoices, all read from Stripe on the server.
  Its buttons open Stripe's billing page straight at the right step (update the payment method, cancel), using Customer Portal flow links, because Stripe does not let its billing page be framed inside another site.
- A church may cancel itself; the cancellation takes effect at the end of the month it has paid for (Q80).
- A church opened before Checkout that leaves Stripe's page is kept with no subscription, sends no texts, and is returned to Checkout at its next sign-in (Q82).
  It gets one automated reminder email (James, 2026-10-29) at 9am the next morning in the church's timezone, and none once Checkout completes.
  Subject "Finish setting up {church} on Discipler", signed by James, reply-to support@, with one "Start" button that opens sign-in and then Checkout (it never signs anyone in by itself), and James's words: "{First name}, we are so excited that you are considering Discipler for your church. We want to help you help your people by making mentorship something that is easy to manage. All that's left is clicking start and initiating your free trial! If anything got in the way, please let us know and we are happy to help."
  With `EXPO26` it adds "Your Exponential special offer is saved until December 11."
- SAU BCM and Anthem Community Church carry an operator flag, "billed outside Stripe", and keep working without a subscription.
- Discipler emails the church 7 days before a trial ends, and Stripe sends its own reminder.
- A bank account is accepted only through Stripe's instant bank sign-in (Financial Connections), never by microdeposits.
  Changing to a different bank account goes through support@trydiscipler.com.

## Referrals

- Each church has one referral code, random and unguessable (for example `/r/k7m2qp9x`), never a church-name slug.
- "Get a new link" replaces the code at once, with no question (James, mock-up 5).
- The Refer page has one Copy button, which copies an approved note together with the link (James, mock-up 5).
  Discipler itself sends no invitations.
- No page lists the churches a church invited (James, mock-up 5); an applied credit shows on Billing.
  Sign-up has no "Let {inviting church} know we joined" box, and an invited church is never named to the church that invited it (James, mock-up 5).
- The credit is one month free for the inviting church, applied automatically on the invited church's first invoice with a real amount.
- The credit waits 30 days after that payment, and is cancelled if the payment is refunded or disputed.
- When both churches pay with the same card or bank account, or share an email domain, the credit goes to James for review instead.

### Decided in the mock-up 5 review (2026-10-31)

- The Refer page is, in order: the title with "Know a church that would love Discipler? Share your link.", a large green offer, "Give a month free. Get a month free." over "Their first paid month is free, and when they pay their first bill, you get a month free too.", the three steps, and the Your link card.
- The Your link card has the link, one Copy button and, under it, "Copy puts a short note and your link on your clipboard, ready to paste into a text or email."
  Copy copies the note and the link together and reads "Copied" for a moment.
  The approved note: "Hi! At {church} we use Discipler to keep our discipleship relationships meeting week to week, and I think your church would love it. Sign up with our link and your first paid month is free: {link}"
- "Get a new link" is a small plain text link under the card's help line, not a button in a box, and replaces the link at once.
- The card ends with "Your month free waits 30 days after their first payment, and is taken back if that payment is refunded. It shows on Billing when it is applied."
- There is no text box, no email draft and no list of invited churches, and sign-up has no "Let {inviting church} know we joined" box (round 2).
- The Billing card is the first card in Settings: one line ("Free trial until December 30, 2026, then $77.60 a month · Visa ending 4242") and an "Open billing" button.
- The Billing page is drawn in `.lavish/refer-billing/` in four states: in the trial, paying (with a referral credit), canceled and ending (with "Keep my subscription"), and payment failed.
- The payment-failed banner sits on every Admin page, under the tabs and above the setup bar, until the payment goes through, and cannot be closed: "Your last payment didn't go through. Discipler keeps running while Stripe tries again." with "Update payment method".
- The ended banner sits in the same place: "Your subscription has ended. Check-ins have stopped and these pages are read-only. Everything is still here." with "Restart Discipler".
- A church that restarts gets no second trial and is charged that day ("You'll be charged today.").
  Under Yearly, the restart page strikes through twelve monthly payments ($1,164) beside $931.20; sign-up keeps one price per choice (round 2).
- Every offer ends with its subscription; a church that restarts pays the normal price.
- The trial-ending email is approved as drawn: subject "Your free trial ends {date}", heading "Your free trial ends in a week", the charge with the card and amount, an "Open Billing" button, signed James Harden, Founder and CEO.

## The texting numbers

Each church no longer gets its own number.
Discipler keeps one shared set of Discipler-owned numbers, in the Messaging Service `discipler-sms`, for every church.

- Each person always hears from the same Discipler number.
- Every text starts "{Messages read as} via Discipler:" (James, mock-up 3), for example "Riverside Chapel via Discipler: Did you meet with Jordan this week? Reply 1 for yes, 2 for no."
  Messages read as is the existing `from_name` setting in Settings, the church's name unless an Admin changes it, so a church where one person runs discipleship can text as that person.
  This includes a person's first-ever text, which today starts "Discipler: Riverside Chapel:", and replaces the stacked `Discipler:` prefix in `src/domain/outbound-copy.ts`.
  Settings' help line under Messages read as gains "followed by \"via Discipler\"".
- A person in two churches gets a different Discipler number for each church, so their replies never mix and a STOP to one leaves the other running.
- Replies are already routed by the sender's phone (`app/sms/inbound/route.ts` ignores `To` today); for a person in two churches, `To` now decides which church a reply belongs to.
- The three numbers in use today (+13185316138, +15674303906, +14129606955) join the shared set.
- Five more numbers are bought now, at about $1.15 a month each, and a number is added when volume needs one, not when a church signs up.
- An email warns support@ when the shared numbers run near capacity, which replaces the planned email at 40 numbers.
- Every church can text the moment it signs up, so there is no waiting list for numbers.
- The toll-free number +18335050572, whose toll-free verification Twilio rejected, is taken out of `discipler-sms` and kept.
- Discipler writes the frame of every text it sends, as a permanent rule: the "{Messages read as} via Discipler:" start, the reply choices and the rates and opt-out lines are always Discipler's.
  A church may reword only the check-in's sentences inside that frame, in Settings (James, mock-up 3, 2026-10-30).

### The daily cap

Today's registration is Low Volume Standard: about 2,000 texts a day to T-Mobile users and about 6,000 across all carriers, counted per EIN.
Texts over it fail with Twilio error 30023 until midnight Pacific.

- Check-ins are spread across the check-in hour instead of all being sent at once.
- When Twilio reports that the daily limit is reached, Discipler holds the remaining texts and sends them after midnight Pacific.
- support@ gets an email the first time that happens each day.

### The full registration

- Discipler LLC's brand gets secondary vetting ($41.50), asked for in a support ticket that also asks Twilio to classify Discipler as a direct customer or a platform (ISV).
- A new Standard campaign, use case Mixed, on a new Messaging Service, describes both ways to opt in: the Intake form and the Admin's consent at sign-up.
- The campaign costs $15 to review and $10 a month.
- Launch runs on today's approved Low Volume campaign, and the numbers move over once the new campaign is approved.
- `trydiscipler.com/sms-opt-in` gains a second section showing the sign-up consent wording with a screenshot.

### The Twilio balance

- Auto-recharge adds $500 when the balance falls below $100, with a backup card.
  It is one switch for the whole account, not per church.
- Discipler's scheduled tick reads the Twilio balance every few minutes and emails support@ when it is below $75, which can only happen if a recharge failed.
- A Twilio usage trigger emails when one day's spending passes a set amount.

### Verify

- A Twilio Verify service named "Discipler" sends 6-digit codes to US numbers only.
- The Admin's phone is verified with it on their first test check-in.

## Setup meter and onboarding

- Points are removed from the plan entirely.
- The setup-completion meter is a slim one-line bar titled "Jumpstart discipleship", under the tabs on every Admin page until 100% (mock-up 2), always showing "{n}% complete · {done} of 7", a thin progress line and "Next: {step}" with that step's button.
  Hovering over it, focusing it, or tapping it on a phone grows it to show all seven steps as checkboxes, which cannot be clicked.
  A hover grows it only after the pointer rests on it for 0.4 seconds, so passing over it does nothing; focus and tap open it at once (James, mock-up 3).
  The next step is highlighted with its own button (for example "Add people").
  Steps check themselves when the thing actually happens, never by the Admin ticking them.
  A newly completed step pops its checkbox the next time that Admin sees the bar, throws confetti from it, and draws a line through its words; no animation when the device asks for reduced motion.
  There is no meter pill in the header.
- It is shared by every Admin of a church, never goes down, and counts seven steps:
  1. Check-in time confirmed.
  2. Tutorial finished.
  3. Test check-in sent.
  4. People added to the Roster.
  5. First Intake received.
  6. First relationship created.
  7. First relationship accepted.
- Nothing about ratings, meetings or Follow-Up earns progress.
- At 100% a badge animation plays once for each Admin, and then the bar goes away.
  The badge is a green seal with a sprout and gold rays, with no word on it, over "{Ministry} is up and running" and a "Thank you!" button (mock-up 3).
- The onboarding modal has a progress bar, the eyebrow "ONE LAST THING" and the headline "Get {Ministry} running".
  It opens on each Admin's first sign-in, has a close button, and "Restart onboarding" in the Help menu brings it back.
- Inside it, a "what happens next" checklist of six lines is generated from the church's settings and the real constants, with green checks and an Edit settings link to the check-in section of Settings.
- The tour is the full-screen product demo in the mock-up 3 decisions below (not the six slides first planned), and counts as finished only on Done.
- The preview thumbnails are a crop of Overview, a phone showing the real text, and a photo of James.

### Decided in the mock-up 3 review (2026-10-30)

- On each Admin's first sign-in, and only then, James's welcome video plays inside the modal before the setup cards, and waits for a click; Continue opens the cards.
  Restart onboarding opens straight to the setup cards.
  James records the video, and it is also listed under Setup videos.
- The modal's three cards are the tour, the test check-in, and "Speak with the team directly!", which shows the next office hours and a Join on Zoom button over a photo of James.
- The three cards' buttons sit level; anything extra in a card (the agreement for an Admin from before sign-up, the Verify code) goes above its button.
- Setup step 2 reads "Take the 2-minute tour".
- The tour is a full-screen product demo of Example Ministry, not a slideshow of screenshots.
  So that no pastor mistakes it for their own church, a thin shiny gold bar across the top reads just "DEMO", it opens on the dimmed page behind one shiny gold Start your demo button with no border and no other words, and nothing on its pages can be clicked.
  It fills the whole screen with no frame or border, with the close button in the bar, Back at the middle of the left edge and Next at the middle of the right; the camera keeps the app clear of them.
  It has seven steps, one per press of Next, and in each a cursor moves and clicks and the camera glides smoothly to what it clicked: Overview's numbers count up, the Roster's Pair pop-up pairs Grace Lee with Emily Davis, Mark Wilson's texted answers land on Check-Ins and its counts change, Follow-Up shows what needs the Admin, the Intake link is copied, and last, Help, Settings and the account menu are opened in turn.
  Each page's step shows its caption and then one note, on the one most important thing on that page, such as "Grace is texted a link to accept. Nothing starts until she says yes." on the Roster.
  The last step stops three times, with a note at each: the question mark opens help, the gear opens the settings, and the initials open the account.
  The Intake step reaches its page the way an Admin does: the camera first glides up to the header, the account menu opens, and its Intake forms row lights up under the cursor before the click.
  For the last step the camera zooms out, a little under the page's full width, so the header, each open menu and its note all fit between the bar and the caption.
  Which step it is ("6 of 7") sits at the bar's top right, not in the caption, and shows only once the demo has started.
  The camera never puts anything under the bar or the caption: the room it frames is measured from the bar's real height and from the new step's caption.
  While a scene plays, Next is faint; when it finishes, Next turns green, shows the word Next and glows, so nobody waits for more.
  The caption is only the step's title and its sentence, with the dots below; there is no "Demo" line and no "Press Next" hint in it.
  The last Next reads Done, and only Done ticks step 2.
  On a phone it shows the app's phone layout at full size and the camera only glides up and down; Back and Next sit in the caption's footer beside the dots instead of over the page, and a note the caption would hide shows above what it points at.
- The test check-in asks about "your {participant noun}", and its first text reads "{Messages read as} via Discipler: This is your test check-in, the same one your {leader noun}s get. Did you meet with your {participant noun} this week? Reply 1 for yes, 2 for no."
  It ends with "Msg & data rates may apply. Reply STOP to opt out, HELP for help." when it is the first text that phone may carry the rates line on that month, as `docs/consent-language.md` says.
- The test's last text is James's, word for word: "{Messages read as} via Discipler: Thank you! Glad you are getting to experience what Discipler can do for your ministry!!"
- The unpaired pop-up's Pair them opens Suggested Pairs, and Send Intake links opens the Roster showing only people who haven't sent an Intake.
- Settings gains "What the check-in says", under the check-in day and hour, at James's request: each sentence of the check-in is a line an Admin can rewrite, "[name]" stands for the {participant noun}'s name, a blank line falls back to Discipler's words, and a live phone shows the result.
  The "{Messages read as} via Discipler:" start, the reply choices and the rates line stay fixed, and the test check-in uses the church's words.
- The Messages read as help line says a church run by one person can use that person's name.
- How far a church may change the check-in's words: each sentence, inside Discipler's fixed frame (James, round 3).
  This changes the rule that Discipler only ever sends texts it writes; see the shared numbers rule above.
  James asked to see the other two answers too, so mock-up 3 draws "keep Discipler's words" and "fully free text" for comparison only.
- The unpaired pop-up is a little bigger than first drawn: wider, with larger words and buttons.

### The unpaired pop-up

- It counts Ready to Pair people in no relationship, and No Intake Submitted people, leaving out Admins and anyone opted out.
- It is a dismissible card in the bottom right, saying how many people need pairing or need an Intake link, with Pair them and Send Intake links buttons.
- It shows on the first Overview visit of each sign-in and of each new day, and goes away when the Admin moves to another tab.

### The test check-in

- It texts only the signed-in Admin's own phone, at most 3 times a day, using the same check-in steps and the church's own wording.
- It has its own table and state machine, and the reply router checks for an open test before anything else.
- It is refused while a real question is open on that phone: "You have a check-in waiting on your phone. Please answer it first, then try the test again. Thank you!"
- The limit message is: "You've sent three test check-ins today. Please try again tomorrow. If something isn't working, please email support@trydiscipler.com and we'll help. Thank you!"
- Tests show in Check-Ins with a Test tag and are never counted anywhere.
- The test check-in's copy is friendlier than "answer your open check-in", and says please and thank you.

## The AI guide

- It answers from the help docs only, and never sees any church's data.
- It runs on Claude Sonnet 5.5 through the Vercel AI Gateway, with zero data retention required.
- Its icon is a smiley friend with an AI badge.
  Its tooltip reads "Start your onboarding here!" until setup reaches 100%, then "Ask Discipler".
- Each Admin may ask 30 questions a day.
- Chats are kept per Admin, readable only by the Admin who wrote them, and deleted after 90 days.
- Under the box: "Please don't paste names, phone numbers or prayer requests."
- Whether the bubble is collapsed is stored on the Admin.
- It has no tools, links only to help pages, and its replies cannot contain HTML or images.

### Decided in the mock-up 4 review (2026-10-31)

- Its face is B, the Chat friend: a white speech bubble with a green smile on the green circle, with the gold "AI" tag (`.lavish/ai-guide/build.mjs` holds the SVG).
- The bubble keeps mock-up 2's place in the bottom-right corner.
  Until setup reaches 100% the "Start your onboarding here!" label always shows beside it; after that the label reads "Ask Discipler" and shows only on hover.
- Pressing it opens a card above the bubble, 384 pixels wide and as tall as the screen allows up to 576; on a phone the chat fills the screen.
  Its head shows the face, "Ask Discipler", "Answers from the Help center" and a close button.
- Before setup reaches 100% the chat opens led by the Admin's next setup step and its button, then three suggested questions about getting started; after, it opens on three suggested questions alone.
- The chat carries on while the Admin stays signed in, and a new sign-in starts a fresh chat; there is no New chat button, and older chats are kept for 90 days but never listed.
- Each answer ends with a link to the Help center page it came from.
- A minus on the bubble's corner tucks it into a slim tab on the right edge, on every page, until the tab is pressed; that is the collapsed state stored on the Admin.
- Opening the chat hides mock-up 3's unpaired pop-up, which comes back when the chat closes.
- The on-screen words, as drafted in mock-up 4 and approved when James called it done on 2026-10-31:
  - About a person: "I can't see anyone in your church, so I can't answer about a particular person or relationship. Their row on Check-Ins shows every answer they have sent.", followed by the help page that fits.
  - "3 questions left today" under the box, shown from 5 left down.
  - The 31st question: "That's 30 questions today, the most for one day. You can ask again tomorrow. The Help center has every answer I give, any time.", with the box greyed and reading "You can ask again tomorrow".
  - A failed answer: "Sorry, I couldn't answer just now. Please try again in a minute."; it does not count toward the 30.

## Help, What's new and office hours

- Help docs are Markdown in the repo, served at `/help`.
- The Help menu has six items, including Restart onboarding and the contact, bug and feature form.
- The contact, bug and feature form is stored and emailed to support@; a bug report attaches the page address and the browser, never page content.
- What's new entries live in a repo file, and each Admin dismisses them for themselves.
- Office hours are a Zoom call every 2 weeks with the team (James, mock-up 3), set in a repo file; the card hides itself once the date has passed.
- The What's new and office hours cards sit in a row at the top of Overview (mock-up 3).

## Search, nav and Settings

- Search is a directory, not a question box.
- It lists pages (the tabs, each Settings section, Intake forms, the Help pages, Account, Refer and Billing), plus people, relationships and Materials by name, and never reply text.
- It opens with ⌘K, with `/`, or by clicking the search bar at the right end of the tab row (layout B, mock-up 2), which grows into a longer bar when clicked.
- With nothing typed it is a directory of pages; typing groups results under People, Relationships, Materials and Help, each saying where it opens. No arrow-key hint is shown.
- The Account menu in `app/shell.tsx` becomes a circle with the Admin's initials (`initialsOf` in `app/initials.ts`), opening: their name and "Admin, {Ministry}", The relationships you lead, Intake forms, Change your password, Sign out.
  "The relationships you lead" leaves the header; "Ministry settings" becomes the gear.
- The header buttons, right-aligned on a phone: "Refer a church" (with a gift), Help, the Settings gear, the initials.
- On a phone the tab names show three at a time: a discreet "›" at the right end shows the other three and a "‹" slides back, each shown only when there is more that way; the church name and its subtitle sit on a soft, mostly opaque backing so the botanical frame does not blend into them.
- The Help menu: Help center, Restart onboarding, What's new (with a New tag), Office hours, Contact support, then a Learn section with Setup videos and Blog.
  Setup videos are short Loom or YouTube videos James records, listed on a Help page from a file in the repo.
  Blog links to trydiscipler.com/blog in a new tab, and is hidden until that page exists.
- Ask Discipler is a persistent circle in the bottom-right of every Admin page, not a Help menu item (mock-up 4 designs it).
  It sits only on the signed-in Admin dashboard (James, 2026-10-30): never on the sign-in or sign-up pages, never for anyone without an account, and not on Leaders' pages in this launch.
  Its icon is an even, centred smiling face with a small gold "AI" tag (mock-up 2); mock-up 4 offers variants.
- The Admin's name, the setup percentage, the What's new state and the bubble's collapsed state are folded into the one page-session read (`app.page_session()`, ADR-0023).
- One church per person; there is no switch-organization control.
- A Settings gear goes in the top nav.
- All of this is for Admins only for now, and may extend to Leaders later.

## Email

- Discipler sends email from `notify.trydiscipler.com`, through Resend from the Vercel Marketplace, with replies going to support@trydiscipler.com.
- The apex domain's SPF `-all` and DMARC `p=quarantine` are left untouched.
- New sign-ups, support and bug reports, feature requests, the over-200 follow-up and the capacity and balance alerts go to support@trydiscipler.com.
- Church-plant applications go to james@trydiscipler.com and lerone@trydiscipler.com.
- No email carries congregation names, phone numbers or Concerns.

## Security

### The required protections (Q23)

1. Card and bank details are typed only on Stripe's pages, and Discipler stores only Stripe's IDs, the card brand and the last four digits.
2. The Stripe webhook verifies the signature on the raw body, refuses everything when the secret is unset, refuses events from the wrong mode, records each event once by its ID, and always re-reads the subscription from Stripe instead of trusting event order.
3. Billing rows are written under `discipler_command` scoped to one church, found through a narrow definer function from the stored Stripe customer, never with `service_role`.
4. The server decides which church is paying and never takes a church ID from the browser; the "payment complete" page unlocks nothing.
5. Stripe metadata holds only Discipler's IDs, and Discipler uses a restricted Stripe key.
6. Turnstile is verified on the server before an email code is sent and again before an account is created, and Supabase's public sign-up stays off (`enable_signup = false`).
7. Email codes are stored only as an HMAC, expire in 10 minutes, allow 5 tries, are rate-limited per email address and per network, and are never logged.
8. "Send me a code" answers the same whether or not the email has an account, and the owner of an existing account is sent a "someone tried to sign up with your email" notice instead of a code.
9. Sign-up creates the church through `provisionMinistry` in `src/platform/supabase/provisioning.ts`, in one transaction, so a double click cannot open two churches, and the browser only ever sees refusal codes.
10. Tables that belong to no single church (pending sign-ups, referrals, the Stripe event inbox) are operator-only, and `tests/integration/rls-coverage.test.ts` is extended to prove every table is either church-scoped or operator-only.
11. Emails carry no congregation data, and the support form is escaped, rate-limited, and behind Turnstile when nobody is signed in.
12. The AI has no tools, sees no church data, links only to help pages, and cannot return HTML or images.
13. Logs record Stripe event IDs only, never codes, passwords, tokens or AI chat text.

### The other decisions

- Referral codes are random (Q24).
- The inviting church sees status rows only, and a name only with the invited church's consent (Q25).
- The referral credit is held 30 days, reversed on refund or dispute, and shared payment details or email domains go to review (Q26).
- Church plants are approved by operator command (Q27).
- Passwords are 8 characters with a blocklist, and two-step sign-in follows after the conference (Q28).
- Admins with a verified email get an emailed reset link (Q29).
- The privacy policy and terms in `docs/legal/` are updated, reviewed by James or a lawyer, and published by James before sign-up goes live, and sign-up stays off until they are (Q30).
- Bank accounts only through instant verification (Q31).
- A church's texts go out only while its subscription is trialing or active, or it is billed outside Stripe, checked in the one query every outbound text passes through (Q32).
- Stripe keys exist only on Production, and Preview deployments need a Vercel sign-in (Q33).
- The sign-in guessing hole is tested first, and if it is real, Discipler adds its own limit of 10 failures per account and per network per 15 minutes (Q34).
- AI chats are deleted after 90 days, readable only by their author, and sent with zero data retention (Q35).
- A staging environment with its own database, Stripe in test mode and no real texting is built, and every billing and sign-up change is tested there first (Q56).
- The extra hardening is built too: browser security headers, Stripe webhooks accepted only from Stripe's published addresses, a cap on texts and Roster size for a new church's first weeks with an email on spikes, one first free month and one church-plant year per card, a reminder before a long trial ends, and support submissions kept 12 months (Q57).

The research behind these is in the session scratchpad, `security-research.md`.
`.scratch/security-hardening/spec.md` covers the same sign-in door (its F2) and headers (its F3); whichever ships first, the other ticket builds on it.

## Docs and ADRs this work amends or adds

Written as part of ticket 35, not in this spec.

- A new ADR superseding ADR-0019: a church signs itself up, and Setup Links remain for comped churches.
- A new ADR superseding ADR-0008 for Admins: an Admin signs in with email or phone.
- A new ADR: the test check-in texts an Admin, a reversal of "no interface action sends a message".
- A new ADR: the AI help assistant, a reversal of the non-goal on speculative AI, kept to help docs only.
- A new ADR: Discipler sends from a shared set of Discipler numbers, replacing a number per church.
- A new ADR, or a section of the shared-numbers ADR: Discipler writes the frame of every text (its start, reply choices, and rates and opt-out lines) as a permanent A2P rule, and a church may reword only the check-in's sentences inside it.
- `docs/product-rules.md`: "Settled: No Interface Action Sends a Message" becomes "no interface action sends free-form text", sign-up, billing states, referrals, and Settings' Billing row.
- `docs/non-goals.md`: points and the What's new item come off the list; gamification stays a non-goal.
- `docs/open-questions.md`: "Open: a church signs itself up" is closed.
- `docs/pastor-dashboard.md`, `docs/product-flow.md` and `docs/consent-language.md` for the onboarding, the unpaired pop-up, the test check-in and the new consent source.
- `CONTEXT.md` gains glossary entries only, with no durations or caps.

## Decided in triage (2026-10-31)

James answered these when tickets 26 to 33 and 40 were triaged.

- Churches that existed before launch (SAU BCM, Anthem, Example Ministry) show their real setup progress from their history, and their Admins get the onboarding modal on their first sign-in after launch.
- Setup step 1 ticks when an Admin presses Save on Settings' check-in day and hour, changed or not.
- An unanswered test check-in ends after 1 hour, and ends at once whenever a real check-in is about to be texted to that phone, so a reply is never caught by a test.
- Each sentence of "What the check-in says" is at most 160 characters, with a counter once it passes 120.
- The AI Gateway spend for the AI guide is capped at $50 a month.
- "Get a new link" retires the old code: the old link opens sign-up at the normal price, with no free month and no credit.
- A church billed outside Stripe sees Refer like any church, and its earned credit goes to James for review, to settle by hand.
- When a subscription has ended, links people were already texted (Intake forms, accept links, Material pages) keep working and their answers are kept, but nothing is texted until the church restarts.

## Open risks

- **Twilio may classify Discipler as a platform (ISV).** If it does, each church needs its own registration and EIN, which James rejected in Q65; the shared numbers are the best case, not a certainty, and the solution is worked out with James when Twilio answers.
- **Campaign review is taking 10 to 15 days,** so the new Standard campaign will not be approved before 2026-11-08, and launch runs on the Low Volume campaign under its daily cap.
- **A low Trust Score** after vetting can keep the T-Mobile cap at 2,000 a day.
- **Six days** from confirmation to live, for a very large scope.
- **James's everyday Twilio login** cannot see Billing or open tickets, so the organization owner has to act.

## For James

1. Sign in to Twilio as the organization owner and file the support ticket, whose text is in the session scratchpad at `/private/tmp/claude-501/-Users-jamesharden-Downloads-discipler-grill-baseline-v2/ac230775-cc76-4e87-b11e-3122394e4d41/scratchpad/twilio-support-ticket.md`.
2. As owner, turn on auto-recharge (add $500 below $100) with a backup card.
3. As owner, give your everyday login Billing and Support access.
4. Be the authorized representative on the Standard registration, confirm the EIN and legal name match the IRS letter, press Submit, and pay the fees.
5. Add the three Resend DNS records at GoDaddy for `notify.trydiscipler.com`: MX and SPF TXT on `send.notify`, and the DKIM TXT on `resend._domainkey.notify`.
6. Review, have reviewed, and publish the updated Terms of Service and Privacy Policy on trydiscipler.com.
7. Publish the second section of `trydiscipler.com/sms-opt-in`, and the "Start your ministry" button and `/r/<code>` redirect on the marketing site.
8. Provide a photo of yourself for the onboarding thumbnail.
9. Provide the Zoom link and the next date for office hours every 2 weeks, and record the welcome video for onboarding.
10. Print the Exponential booth QR code and flyer carrying `EXPO26`.
11. Approve each Lavish mock-up, ideally the same day.
12. Rehearse the full flow on 2026-11-05.

## The tickets

| Ticket | What | Status | Blocked by |
| --- | --- | --- | --- |
| 01 - Operator-only tables and the coverage test | Every table is church-scoped or operator-only, proven by the test | shipped | Nothing |
| 02 - Staging | A copy with its own database, Stripe in test mode and no real texting | ready-for-human | Nothing |
| 03 - Billing records and the Stripe webhook | The only writer of billing state | shipped | 01 |
| 04 - Prices, offers and the Checkout session | $97, $147, the trial, the offers, and the hosted Checkout | ready-for-agent | 03 |
| 05 - The texting gate | No text leaves for a church without a live subscription | ready-for-agent | 03 |
| 06 - The shared numbers | A Discipler number per person per church, replacing a number per church | shipped | Nothing |
| 07 - The daily cap | Spread check-ins, hold texts on error 30023, alert once a day | needs-info | 06 |
| 08 - The Twilio balance and spend alarm | An email before an empty balance stops every text | shipped | 10 |
| 09 - Verify | The Twilio Verify service and the Admin's phone check | shipped | Nothing |
| 10 - Email from notify.trydiscipler.com | Resend, the domain, and the no-PII sender | shipped | Nothing |
| 11 - Email codes and the human check | Turnstile and the 6-digit email code, on the server | shipped | 01, 10 |
| 12 - Password policy | 8 characters, a blocklist, 64 and more allowed | shipped | Nothing |
| 13 - The sign-in guessing limit | Test the hole, and close it if it is real | shipped | Nothing |
| 14 - The over-200 follow-up | An email when a church stays above 200 people for a month | ready-for-agent | 03, 10 |
| 15 - Sign-up: are you human, email and phone | Steps 1 and 2 of sign-up | needs-info | 11 |
| 16 - Sign-up: verify your email | Step 3 of sign-up | needs-info | 15 |
| 17 - Sign-up: set up your account | Step 4, opening the church through `provisionMinistry` | needs-info | 12, 16 |
| 18 - Sign-up: Checkout and landing on Overview | Steps 5 and 7 | needs-info | 04, 17 |
| 19 - Sign-up: the church-plant question and application | Step 6, and the operator approval command | needs-info | 18 |
| 20 - Sign-up: the Exponential special offer and referral links | `EXPO26`, the booth QR link and `/r/<code>` | needs-info | 18 |
| 21 - Sign in with email or phone | One box for both | needs-info | 17 |
| 22 - Forgot password | The emailed reset link for Admins | needs-info | 10, 21 |
| 23 - The top nav and Help menu | The gear, the avatar, the meter's place and the six Help items | shipped | Nothing |
| 24 - Search | The directory behind ⌘K, `/` and the search bar | needs-info | 23 |
| 25 - Contact, bug and feature form | Stored and emailed to support@ | needs-info | 10, 23 |
| 26 - The setup meter and the badge | Seven steps, never going down, one badge per Admin | ready-for-agent | 23 |
| 27 - The onboarding modal and the tour | The modal, the welcome video, the three cards, the checklist and the seven-step demo tour | ready-for-agent | 26, 30 |
| 28 - The test check-in | A check-in to the Admin's own phone, never counted | ready-for-agent | 05, 09, 27, 40 |
| 29 - The unpaired pop-up | The bottom-right card on Overview | shipped | Nothing |
| 30 - What's new and office hours | The two cards, from repo files | ready-for-agent | 23 |
| 31 - The AI guide | Help-docs-only answers through the AI Gateway | ready-for-agent | 26, 34 |
| 32 - Refer and the referral credit | The Refer page and the credit | ready-for-agent | 04, 20 |
| 33 - Billing in Settings and the billing states | The Billing row, the banners and the restart page | ready-for-agent | 04, 05 |
| 34 - Help docs | Markdown at `/help` | shipped | Nothing |
| 35 - Docs and ADRs | Every amendment and ADR listed above | shipped | Nothing |
| 36 - Legal pages and the opt-in page | Drafts James publishes | shipped | Nothing |
| 37 - Security headers and the extra hardening | Q57's list | ready-for-agent | 03, 05 |
| 38 - The Standard registration | Vetting, the Mixed campaign and moving the numbers | ready-for-human | 06, 36 |
| 39 - The rehearsal | James's run of the booth flow on 2026-11-05 | ready-for-human | Every other ticket |
| 40 - The check-in's words in Settings | Four sentences a church may reword inside Discipler's frame, with a live phone | shipped | 06 |
