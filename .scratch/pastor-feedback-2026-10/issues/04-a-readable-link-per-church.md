# 04 - A readable link per church

**What to build:** Each Ministry's Intake forms live at a link a pastor can print on a bulletin and say from the pulpit: `/join/<short name>` for mentor/mentee and `/join/<short name>/groups` for groups.
Spec: `.scratch/pastor-feedback-2026-10/spec.md`, *The readable link per church*.
Today: the links are built from the Ministry id in `src/domain/outbound-copy.ts` (`/intake/<id>` for groups, `/intake/<id>/discipleship` for mentor/mentee), and Intake Forms draws a QR code for each.

**Blocked by:** nothing. Design: `.lavish/pastor-feedback/mock-link.html`, settled in James's Lavish review of 2026-10-12.

**Status:** ready-for-agent

## Acceptance

- [ ] A Ministry has a short name: lowercase letters, digits and dashes, unique across Discipler.
- [ ] Every existing Ministry is given one from its name when this ships, with `-2`, `-3` and so on added on a clash; a new Ministry is given one when it opens.
- [ ] `/join/<short name>` opens the mentor/mentee form and `/join/<short name>/groups` opens the group form, each with `?via=qr` meaning what it means today.
- [ ] One card at the top of Intake Forms replaces today's two link cards: the editable short name first (*Your church's short name*, the address prefix beside the field, and Save), then the two forms side by side as even tiles, each with its name, QR code, readable link, *Copy link* and *Download QR code*. No helper sentences, and nothing in the card hangs below the tiles.
- [ ] A short name already taken, or one the app's own routes need, is refused with a sentence saying why.
- [ ] Every short name a Ministry has ever had keeps redirecting to its forms, forever.
- [ ] `/intake/<ministry id>` and `/intake/<ministry id>/discipleship` keep working.
- [ ] Intake Forms shows the readable links, and both QR codes encode them.
- [ ] Every text and page that hands out an Intake link hands out the readable one.
- [ ] A rename is recorded in the Ministry's history.
- [ ] `docs/product-rules.md` and `CONTEXT.md` name the short name and the redirect rule.
- [ ] Checked by eye in a real browser against the mock-up, at desktop and phone width, the two tiles the same height, and a printed QR code scanned with a phone.

## Not in this ticket

- The Intake form editor. That is tickets 11 to 13.
