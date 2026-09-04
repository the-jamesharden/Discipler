# 32 - The Account menu, and Intake forms as a page of their own

**What to build:** The header's loose links become one Account menu, and the two Ministry Intake Links with their QR codes leave the Roster for a page called Intake forms.

Every Admin page carried the same five controls in one row of underlined text: *The relationships you lead*, *Ministry settings*, *Discipleship Goals*, *Change your password*, and *Sign out*.
They are three kinds of thing.
One is a switch to the Leader surface.
Two configure the Ministry, and one of those is a child of the other.
Two are about the signed-in person.

**Blocked by:** nothing.

**Status:** claimed

## Decisions, taken in the Lavish review of 2026-09-03 (`.lavish/header-links.html`)

1. The header keeps the Ministry's name, one visible button to the Leader surface, and one Account menu. Chosen over grouping everything visibly and over making Settings a seventh tab.
2. The menu is a native `details` element with a summary reading *Account* beside a person icon. No script: it closes when its summary is pressed again. The shell stays script-free.
3. The menu has two groups. *This Ministry*: Ministry settings, Intake forms. *You*: Change your password, Sign out. A person who administers nothing sees only the second group, unlabelled.
4. *Discipleship Goals* leaves the header. It is reached from Ministry Settings, where its own back link already points.
5. *Intake forms* is a new Admin page holding the group link, the discipleship link, and both QR codes, moved from the foot of the Roster unchanged. The two QR routes move with it. The Roster stays a roster.
6. Groups and the join requests waiting to be admitted move to Intake forms with the group link, because both are about it. Their three routes move too and redirect back to Intake forms, where the receipt is shown.
7. Import from a spreadsheet stays on the Roster, in a popup under the Upload CSV button at the top right of the Roster card rather than a card below the table. The popup is a details element like the menu, open already when the last upload was refused. The upload's report shows above the table, where the other receipts are, because the upload redirects back and the report must not sit behind a button. The rows waiting on an Admin stay their own card below the table.

## Where it lands

- `app/shell.tsx`: `AccountMenu`, used by `AdminShell` and passed as `actions` by every `PageShell` page.
- `app/intake-forms/`: the page, the two QR routes, the group and join-request routes, the clipboard field, and the copy.
- `app/roster/page.tsx`: the link, group and waiting cards and their reads gone; the import is a popup; the empty state points at Intake forms.
- `public/discipler.css`: the menu.
- Tests that read the links off the Roster now read them off Intake forms, and one new file covers the menu.
