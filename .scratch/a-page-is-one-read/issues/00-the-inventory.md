# 00 - The inventory

**Status:** resolved

What every signed-in page reads today, in execution order, taken from the code on 2026-09-11 at `1b054e8`.
File and line references are to that commit.

## Every page pays for the Admin first

`resolveAdmin` (`src/platform/supabase/current-admin.ts`) is three round trips in a row after the local token check:
`rpc('session_is_live')`, then `ministry_member` (`ministry_id, ministry(name)` where `user_id`, `tier = 'admin'`, ordered by `created_at`, limit 1), then `person` (`id` where `ministry_id`, `user_id`).

`AdminShell` (`app/shell.tsx:166`) reads the whole Care Needed list when a page does not pass `followUpCount`.
Overview and Follow-Up pass it; Check-Ins, Suggested Pairs and Roster do not.

## The shared history reads (`src/platform/supabase/relationship-history.ts`)

- `timeZoneOf`: `ministry.timezone` where `id`.
- `membersOf`: `relationship_member` (`relationship_id, person_id, role`) where `ministry_id`, `ended_at is null`; then `person` (`id, full_name`) in the member ids.
- `weeksOf`: `rpc('relationship_weeks')`.
- `pausesOf`: `rpc('relationship_pauses')`.
- `concernsOf`: `concern` (`id, relationship_id, raised_by, raised_at, resolved_at`) where `ministry_id`, ordered `raised_at desc`; then `person` names for `raised_by`.
- `answersOf`: `rpc('relationship_week_answers')`.

## Per page

- `/`: the Admin, then a redirect. 4 calls.
- `/overview`: the Admin; then in parallel `readOverview` (timezone, `relationship` with `id, created_at, accepted_at, ended_at`, then five history reads in parallel with two name lookups behind them) and `readCareNeeded` (timezone again, `relationship` with `id, accepted_at, ended_at`, then `follow_up_item` (`id, kind, raised_at, relationship_id, person_id, payload` where `resolved_at is null`, ordered `raised_at desc`) with two sequential lookups behind it, plus the same four history reads). 22 to 24 calls, 8 stages deep.
- `/check-ins`: the Admin; timezone; `rpc('relationship_week_answers')` and members in parallel; then the shell's Care Needed. About 19 calls.
- `/suggested-pairs`: the Admin; then the shell's Care Needed. About 15 calls for a badge.
- `/follow-up`: the Admin; Care Needed; `rpc('contact_to_share')` only on a reveal. Passes the badge.
- `/roster`: the Admin; `rpc('roster')`, members, `relationship` (`id, accepted_at`) in the named ids, `rpc('intended_pairings')`, `rpc('held_import_rows')`, all sequential; then the shell's Care Needed. About 20 calls, 13 stages deep.
- `/roster/[personId]` and `/roster/pair`: the Admin; the whole roster read for one row or the pairing form; `intake_link` only when asked.
- `/relationships`: the Admin; then `signedInUserId` again; `person` ids for the caller; leaderships; four reads in parallel including `rpc('material_periods')` and `rpc('relationship_pauses')` once per Ministry in a loop; names; then per relationship in series `rpc('relationship_availability')`, `material` when a period is open, and `rpc('contact_to_share')` per person.
- `/settings`: the Admin; `rpc('ministry_settings')`.
- `/intake-forms`: the Admin; `rpc('ministry_groups')`, `rpc('group_join_requests')`, `rpc('discipleship_goal_options')`, the whole roster for names, all sequential.
- `/account`: the Admin only.

## Access today

Tables read directly are policed by row-level security for `authenticated`: `ministry` by membership, `ministry_member` by own rows, `person` by Admin of the Ministry or self or led (columns `id, ministry_id, full_name, created_at, user_id, email` only), `relationship` and `relationship_member` by Admin or leads, `concern` by Admin (no `detail`), `follow_up_item` by Admin, `intake_link` by Admin, `material` by Admin or leads.
`roster`, `intended_pairings`, `held_import_rows`, `relationship_pauses`, `contact_to_share`, `relationship_availability`, `ministry_settings`, `discipleship_goal_options`, `ministry_groups`, `group_join_requests` and `session_is_live` are `security definer` with their gate in the body.
`relationship_weeks`, `relationship_week_answers` and `material_periods` are `security invoker`.
No function returns json today.

## Direct reader tests

`readOverview`, `readCareNeeded`, `readOpenFollowUpItems`, `readThisWeeksCheckIns` and `readContactToShare` are called directly with `signInAs(ministry)` clients in `the-overview`, `care-needed`, `relationship-state-and-care`, `pause-resume-and-expiry`, `this-weeks-check-ins`, `revealing-contact-details` and `reopening-intake`.
The Roster, Leader Dashboard, settings and goals readers are covered over HTTP only.
