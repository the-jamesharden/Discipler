# 13 — Ending a relationship and Participant departure

**What to build:** An Admin ends a relationship with a recorded reason, so the Ministry knows later whether it completed or broke down — a relationship that ran well and finished is an outcome, not a deletion. The history is preserved exactly, and the people in it return to the Roster as `Ready to Pair` so they can be matched again, unless they have opted out.

One Participant leaving a relationship does not end it for everyone else. Their membership receives an end date and the relationship continues with whoever remains. Their past check-in weeks stay attached to the relationship exactly as recorded, so history is not rewritten by someone leaving. A relationship dropping from three Participants to one changes nothing structurally — it is still one relationship, now with one Participant, and the check-in copy switches from the relationship's name to the Person's name on its own.

`Ended` is terminal. Ending a relationship is recorded against the Admin who did it.

**Blocked by:** 10

**Status:** ready-for-agent

- [ ] An Admin can end a relationship with a recorded reason
- [ ] An ended relationship's history is preserved unchanged
- [ ] People in an ended relationship return to `Ready to Pair` unless opted out
- [ ] `Ended` is terminal in the derivation
- [ ] One Participant leaving does not end the relationship for the others
- [ ] A departed Participant's membership carries an end date rather than being deleted
- [ ] A departed Participant's past weeks stay attached to the relationship
- [ ] Check-in copy follows the remaining Participant count with no group-versus-one-to-one branch
- [ ] Ending is recorded against the acting Admin
