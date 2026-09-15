# 02 - I meant to sign up for mentorship

**What to build:** The line under step three's actions, "Looking for one-to-one discipleship instead? I meant to sign up for mentorship.", linking to the discipleship wizard's first question with age band, gender and availability carried in the query string, as S-7 of `.lavish/materials/design.html` draws it.

**Blocked by:** nothing

**Status:** ready-for-agent

## Acceptance

- The line appears on step three of the group form and nowhere else, styled as the design's `card-note` under the form actions.
- The link is built from the wizard machine's query for the answers already given, plus `via`, and never from hand-written parameter lists.
- Following it opens the discipleship wizard on the mentor-or-mentee question with age band, gender and availability already answered, so pressing Back from there shows them filled and Continue moves past them.
- Nothing is written by following the link; the group form's own answers are not submitted.
- No reverse link is added to the discipleship wizard.
- Over-HTTP: answer the group form's first two steps, follow the switch, land on the discipleship wizard's first question, finish it, and find the Person on the Roster with the side they declared and the availability they gave on the group form.

## Comments
