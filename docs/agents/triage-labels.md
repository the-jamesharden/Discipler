# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |
| —                          | `shipped`            | Every acceptance criterion met and merged |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the right-hand column to match whatever vocabulary you actually use.

## `shipped` is local to this repo

The five canonical roles are all pre-implementation states, so a finished ticket had
nowhere to go and kept whatever label it was picked up under. `shipped` is the
terminal state: every acceptance criterion is checked, the work is merged, and every
item the ticket raised for a human is either resolved in the ticket or migrated to
`docs/open-questions.md`. A question parked in `open-questions.md` does not hold a
ticket open — that is what parking it there means.

`ready-for-human` therefore keeps its canonical meaning here: *this needs a human to
implement it*. It is not a review state.
