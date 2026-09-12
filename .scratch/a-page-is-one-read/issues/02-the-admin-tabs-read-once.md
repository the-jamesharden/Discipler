# 02 - The Admin tabs read once

**What to build:** The Overview, Check-Ins, Suggested Pairs, Follow-Up, Roster, person and Pair pages each read their page function once through a reader in `src/platform/supabase/`, derive what they show from the document with the parsing and domain rules they have now, and pass the Follow-Up badge count to `AdminShell`, whose own read is removed.

**Blocked by:** 01

**Status:** claimed

## Acceptance

- `the-overview.test.ts`, `this-weeks-check-ins.test.ts`, `care-needed.test.ts`, `relationship-state-and-care.test.ts` and `pause-resume-and-expiry.test.ts` pass through the new readers, with the Overview isolation case restated as the spec says.
- Every over-HTTP suite that touches these pages passes unchanged.
- Loading each tab once against the local stack logs exactly one `/rest/v1/rpc/` call in PostgREST.

## Comments

Done on 2026-09-12.
`src/platform/supabase/page.ts` is how a reader asks for a document and reads the verdict off the top of it; `adminPage` pairs the verdict with what the page derives.
`relationship-history.ts` parses the `history` part of a document with the checks the separate reads had; `overview-reader.ts`, `care-needed-reader.ts`, `check-ins-reader.ts` and `roster-reader.ts` each split into a pure derivation over the document and a thin page reader.
The Overview, Check-Ins, Suggested Pairs, Follow-Up, Roster, person and Pair pages each call one page reader; the reveal on Follow-Up is an argument of `follow_up_page`; the concern view route finds its item in the same document.
`AdminShell` requires `followUpCount` and no longer reads.
The direct reader tests keep passing through `readOverview`, `readCareNeeded`, `readOpenFollowUpItems` and `readThisWeeksCheckIns`, which now read the page function and answer empty for a Ministry the session does not administer, which is the isolation case restated.
