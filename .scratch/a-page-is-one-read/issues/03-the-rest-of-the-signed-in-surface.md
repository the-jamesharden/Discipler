# 03 - The rest of the signed-in surface

**What to build:** `/`, `/account`, `/settings`, `/intake-forms` and `/relationships` each read their page function once. `resolveAdmin` reads `signed_in_admin()`. The Leader Dashboard's per-relationship and per-person loops become reads of the document; the signed PDF URL stays the one extra call, only when a material carries a PDF.

**Blocked by:** 01

**Status:** claimed

## Acceptance

- `the-leader-dashboard-over-http.test.ts`, `ministry-settings-over-http.test.ts`, `the-ministry-intake-link-over-http.test.ts`, `editing-the-discipleship-goals-over-http.test.ts`, `joining-a-group-over-http.test.ts`, `changing-a-password-over-http.test.ts`, `resetting-a-password-over-http.test.ts` and `admin-signs-in.test.ts` pass unchanged.
- `/relationships` verifies the session once, not twice.

## Comments

Done on 2026-09-11.
`/relationships`, `/settings` and `/intake-forms` each read their page function once through the port it declares: `readRelationshipsPage`, `readSettingsPage`, `readIntakeFormsPage`.
`leader-dashboard.ts` derives the `RelationshipLed` list from the `relationships_page` document with every parsing check, ordering rule and the overlay computation it had; the signed PDF URL is the one call that stays separate.
`intake-forms-reader.ts` is new and holds the group, join request and goal option parsing; `discipleship-goals.ts` is deleted and the container hands out `getIntakeFormsReader` in its place.
`/` and `/account` were already one read through `resolveAdmin` and are untouched.
Four integration files drive `signed_in_admin`, `settings_page`, `intake_forms_page` and `relationships_page` through signed-in clients, including the ended-session case and the other-Ministry case, and the last one also proves the reader's derivation.
Not done here: the over-HTTP suites in the acceptance list were not run, because the database and the port are shared with ticket 02 mid-flight; they are the proof that nothing on a screen changed and belong to the run that follows both tickets.

The over-HTTP suites in the acceptance list were run on 2026-09-12 at `b423817`, three full runs in a row against a freshly built server, all green; see the verification note on ticket 02.
Loaded once against the local stack, `/relationships`, `/settings`, `/intake-forms`, `/` and `/account` each made one `/rest/v1/rpc/` call.
