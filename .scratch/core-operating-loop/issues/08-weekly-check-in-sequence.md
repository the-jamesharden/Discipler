# 08 — The weekly Check-In Sequence

**What to build:** Once a week a Leader gets a single text conversation covering every relationship they lead, one after another — leading three relationships does not mean three separate threads. Relationships are asked about in a consistent order, earliest start date first, so the conversation is predictable week to week.

Per relationship: "did you meet" first, then "how did it go" only on a yes, then "what was the Concern" only on a concern. A Leader who answers no moves straight on — a missed week costs one reply, and a missed meeting is never framed as a failure. Where a closing thank-you would fall, the next relationship's opening question is sent instead; the thank-you arrives only after the final relationship, so the Leader knows the conversation is finished.

Participants receive no check-ins. Only Leaders answer — but nothing may assume one respondent per relationship, and no response record may be keyed to the relationship alone rather than to the Person who sent it, because a Ministry may ask for Participant check-ins later.

This ticket introduces the inbound webhook. One webhook handles every inbound message, and resolution is: sender's phone number → Person → their open Check-In Sequence → the question currently awaiting a reply. Nothing resolves to "the Person's relationship" — a Leader may hold several, and sequence position is what disambiguates. `STOP` is handled here as the person-level carrier opt-out.

Strict tokens only in this ticket: `1`, `2`, `A`, `B`, `C`. Generous matching is ticket 09.

Relationships in `Awaiting Leader Acceptance` and `Paused` send no check-ins and accrue no silence. Opt-out and rate-disclosure language appears on the first check-in of each calendar month; that monthly rule applies to Leaders only.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] A Leader with three relationships receives one sequence covering all three, ordered by start date
- [ ] Each answer attaches to the right relationship and to the Person who sent it
- [ ] The satisfaction question follows a yes; a no ends that relationship's turn immediately
- [ ] The Concern detail request is sent only after a concern reply
- [ ] The thank-you is sent only after the final relationship
- [ ] One webhook resolves inbound messages by phone number to the question awaiting a reply
- [ ] `STOP` opts the Person out at the person level
- [ ] Participants receive no check-ins and no Participant reply is read as a check-in answer
- [ ] Relationships awaiting acceptance or paused are skipped and accrue no silence
- [ ] The first check-in of each calendar month carries opt-out language
- [ ] The sequence advances only in response to a reply
