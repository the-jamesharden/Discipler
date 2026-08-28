/**
 * The version of the consent wording a Person agreed to, recorded on every consent
 * record alongside its own timestamp.
 *
 * Existing records are never migrated forward: each one keeps pointing at the
 * wording that was actually on the screen. Changing any wording in
 * `docs/consent-language.md` means changing this identifier, and the two are only
 * correct together.
 */
export const CONSENT_VERSION = '2026-09-v1'
