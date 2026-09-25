# 02 - The Roster: one list, with the Everyone menu

**What to build:** The All / Disciplers / Disciples toggle goes, and one menu replaces it.
Its button reads **Everyone ▾** and never *Filter*, and names what is shown once anything is ticked.
Every pairing in the Paired with cell says its direction.
Spec: `.scratch/roles-per-pairing/spec.md`, *The Roster*. Mock-ups: `.lavish/roles-per-pairing/mock-roster-all.html` and `mock-roster-b.html`.

**Blocked by:** 01 (the popup takes its side from the Roster's `list` until 01 gives it its own)

**Status:** ready-for-agent

## Acceptance

- [ ] One list; the toggle and the `list` it set are gone, and an old address carrying `list=` still opens the Roster.
- [ ] The menu has **Everyone** at the top, which clears it, then **Pairings** (tick any, a person matches every one ticked): Disciples somebody, Being discipled, In a group, Unpaired, Offered to disciple, not yet discipling, Awaiting Intake; **Gender** (pick one): Men and women, Men, Women; **Access**: Admins.
- [ ] Each option means what the spec's *What each Pairings option means* says.
- [ ] Every option shows a count over the whole Roster, not narrowed by the other options ticked.
- [ ] The button reads *Everyone* with nothing ticked, and otherwise names what is shown joined by `·` (*Being discipled · Women*). No chips.
- [ ] What is ticked lives in the address, survives a refresh, and works without script.
- [ ] The stats line reads *N shown · M on the Roster* while anything is ticked, and total, paired and unpaired while nothing is.
- [ ] Every pairing in the Paired with cell names its direction: *disciples*, *discipled by*, *leads*, *in*, with its size tag.
- [ ] Pair on a row opens the popup on the side ticket 01 presets.
- [ ] `.scratch/manual-pairing/spec.md`, *The Roster*, points to this spec for the toggle.
- [ ] Checked by eye in a real browser against the mock-ups, menu open and closed, at desktop and phone width.
