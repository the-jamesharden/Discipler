# trydiscipler.com/sms-opt-in: the sign-up section

> **Draft, not yet published or reviewed by a lawyer.**
> Written for James and a lawyer to review; it is not legal advice.
> The page lives on trydiscipler.com, the marketing site, which is not in this repository, so James publishes it there by hand.
> It describes the second way Discipler gets consent to text: an administrator's agreement when they sign a church up.
> The carrier registration for the new Standard campaign (ticket 38) points at this page, and self sign-up stays off in production until it, the Privacy Policy and the Terms of Service are published.
> Everything in [square brackets] is still to be filled in before publishing.
> Delete this box, and everything from "Other changes on the same page" down, before publishing.

## Where it goes

The live page has six numbered sections: 01 The opt-in form, 02 How opt-in works, 03 Program details, 04 Opting out and getting help, 05 Sample messages, and 06 Privacy.
This becomes the new 02, straight after 01, so the two opt-in forms sit side by side, and the sections after it are renumbered 03 to 07.
It uses the page's existing styles: the section number, the section title, body paragraphs, a sample card like 01's, and the message list from 05.

## The section, as it should read

**02**

### The sign-up opt-in, for church administrators

Sample, not a live sign-up form

A church or ministry signs itself up for Discipler at app.trydiscipler.com/signup.
The person signing up becomes the church's first administrator.
The sign-up page asks for their email address and their own mobile phone number, and shows this wording directly under the phone number field, before the button that continues:

> By continuing, you agree to receive texts from Discipler at this number, including sign-in codes and test check-ins. Msg frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.

[SCREENSHOT: the sign-up page's "Your email" step, as it looks on a phone.
It shows the Discipler wordmark, "Create an account", "Step 1 of 3, Your email", the Email field, the Mobile phone field with the wording above directly under it, and the "Email me a code" button.
Use an example email and number, never a real person's.
Take it from the live page once sign-up (ticket 15) is built, not from the Lavish mock-up, which carries a "Mock-up, not built" label.
Alt text: "Discipler's sign-up page, with the text-message consent wording directly under the mobile phone field."]

- The administrator enters their own mobile number, and agrees for that number only.
  Discipler never adds an administrator's number on anyone else's behalf.
- The agreement covers only the texts it names: a code that confirms the administrator's phone, and test check-ins the administrator sends to their own phone to see what their church's mentors receive.
  It does not enroll the administrator in any discipleship program; that still takes the intake form in section 01.
- Discipler records the agreement, with the time and the version of the wording shown.
- An administrator receives a text only when they ask for one: a code when they confirm their phone, and the messages of each test check-in they send, at most 3 test check-ins a day.
- Reply STOP to any message to stop receiving them, and HELP for help, as section 05 describes.

**Sample messages**

Phone confirmation code

> Your Discipler verification code is: 123456

[Confirm against the wording the Twilio Verify service named "Discipler" actually sends (ticket 09).]

Test check-in, first message

> Riverside Chapel via Discipler: This is your test check-in, the same one your mentors get. Did you meet with your mentee this week? Reply 1 for yes, 2 for no. Msg & data rates may apply. Reply STOP to opt out, HELP for help.

Test check-in, last message

> Riverside Chapel via Discipler: Thank you! Glad you are getting to experience what Discipler can do for your ministry!!

The rates line, "Msg & data rates may apply. Reply STOP to opt out, HELP for help.", appears on the first text a phone may carry it on in a month, so a test check-in's first message may not show it.

## Other changes on the same page

The rest of the live page, as read on 2026-10-31, says things this launch makes untrue.
Each needs changing when the section above is published.

- **Live since 2026-11-03, no change needed:** the opt-in form in section 01 now matches the real intake form word for word, as James asked, and the contact line says Carrollton.
  The real checkbox is required and reads: "I agree to receive text messages from [Ministry Name] through Discipler about my discipleship relationship, including a weekly check-in. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. See our Privacy Policy and Terms of Service."
  The two names are links to the published pages, on the page and on the intake form.
- **The introduction** says "Only people enrolled as participants in one of those programs receive messages, and only after they opt in themselves."
  Suggested: "Only people enrolled in one of those programs, and the administrators who sign a church up, receive messages, and only after they opt in themselves."
- **How opt-in works** says "This form is the only opt-in method used for this program."
  Suggested: "There are two opt-in methods: the intake form above, for people taking part in a program, and the sign-up page in section 02, for the administrator who signs a church up. There is no verbal, paper, in-store, or keyword-based opt-in."
  Its sentence "Consent is not required to participate in the mentorship program." came off on 2026-11-03.
- **Program details**, Recipients, gains: "Church administrators who opted in when signing their church up, for codes and test check-ins they request."
  Message types gains: "Phone confirmation codes and test check-ins, for administrators."
  Sender gains: "Messages come from phone numbers Discipler owns and shares across the ministries it serves."
- **Sample messages:** the confirmation, check-in prompt and follow-up samples went live on 2026-11-03 matching the product, the follow-up as "How did the meeting go?" with the four answers and no STOP sentence.
  Still to do:
  - The product's own HELP reply differs from the live sample: "[Ministry Name] via Discipler: Reply PAUSE to pause your check-ins, RESUME to start them again, or SWAP to ask about a different match. For anything else, please contact [Ministry Name] directly. Msg & data rates may apply. Reply STOP to opt out, HELP for help."
  - [Text HELP and STOP from a test phone and match the samples to what arrives. Discipler sends no STOP reply of its own, so that one comes from Twilio, and Twilio may answer HELP as well as Discipler.]
- **Privacy** keeps its two sentences, and both still hold.

## For James

1. Publish the section and the other changes above on trydiscipler.com/sms-opt-in, with the screenshot, before sign-up is switched on in production and before the Standard campaign (ticket 38) is submitted.
2. The sign-up wording is consent by continuing, with no checkbox, and giving a phone number is required to sign up.
   Carriers sometimes question an opt-in that is a condition of using a product.
   The real intake form has an unchecked box that must be ticked to continue, so it makes the same condition.
   James reviewed this on 2026-11-02 and kept the wording as drafted, with no checkbox.
