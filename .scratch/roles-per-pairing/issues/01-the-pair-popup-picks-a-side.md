# 01 - The Pair popup: pick a side, then a person

**What to build:** Anybody who has completed Intake can be picked on either side of a pairing.
The Pair popup gets a side chooser, *In this pairing, {first name}* **Disciples somebody** · **Is discipled**, and each side lists everybody it can, the usual people first and everybody else folded.
This is the bug fix: today Emily, who finished Intake and said nothing about mentoring, cannot be picked to disciple Sarah from anywhere.
Spec: `.scratch/roles-per-pairing/spec.md`, *The Pair popup*. Mock-ups: `.lavish/roles-per-pairing/mock-pair-emily.html` and `mock-pair-sarah.html`.

**Blocked by:** nothing

**Status:** ready-for-agent

## Acceptance

- [ ] The popup has the side chooser directly under its title, and one press switches it without losing anything else in the address.
- [ ] Which side it is on lives in the address on its own, apart from the Roster's `list`, so a refusal the pairing route sends back reopens the popup on the side it was posted from.
- [ ] It opens preset by today's rule (leads an open relationship, answered Mentor, or is the discipler in an import's plan opens on *Disciples somebody*; everybody else on *Is discipled*). The preset never limits who can be picked.
- [ ] **Disciples somebody** behaves as today's popup from a Discipler (any number ticked, the shape toggle, the Group gender toggle, the Groups), and its list opens on **Asked to be discipled**: people who have completed Intake, are not opted out, hold no open participant membership and would not open as *Disciples somebody* themselves.
- [ ] **Is discipled** behaves as today's popup from a Disciple (one choice, the Groups), and its list opens on **Disciples somebody already, or offered to** (*Disciples*, not *Disciple*), with *leads N* as today.
- [ ] Everybody else the gender rule allows is under **Everyone else · N**, folded, one press to open, without script as well as with it. A row there has a second line saying what they do now (*Discipled by Rachel Adams*, *In Tuesday Women's*).
- [ ] Greyed rows keep their reasons: Awaiting Intake, Opted out, *Already in a 1:1 with {name}* where the shape makes a 1:1. The person themselves and whoever gender leaves out are not drawn, as today.
- [ ] The summary sentence names both sides and what the picked Discipler goes on doing: *Emily Davis will disciple Chloe Park, one to one. Emily is sent an invitation to accept, and goes on being discipled by Grace Lee.*
- [ ] Pairing Emily to disciple Sarah works end to end through the real route: Emily is invited as any Discipler is and gains an account by accepting; Sarah hears nothing until then.
- [ ] Links into the popup from Follow-Up and Suggested Pairs open it on *Is discipled*; old Pair page addresses still redirect into it.
- [ ] `CONTEXT.md`: **Discipler / Disciple** becomes the Admin-screen words for the two sides of one pairing, not lists a person is on; **Declared Side** presets the popup and feeds Suggested Pairs and no longer makes anybody a Discipler.
- [ ] Checked by eye in a real browser against the mock-ups, at desktop and phone width.

## Not in this ticket

- The greyed row *Disciples {first name} already*. It needs the rule that two people are never paired both ways round, which is question 1 of `.lavish/planned-pairs-and-sides/` and lands with that ticket.
- The Roster's toggle and lists. That is ticket 02.
