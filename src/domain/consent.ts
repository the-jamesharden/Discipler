/**
 * The version of the consent wording a Person agreed to, recorded on every consent
 * record alongside its own timestamp.
 *
 * Existing records are never migrated forward: each one keeps pointing at the
 * wording that was actually on the screen. Changing any wording in
 * `docs/consent-language.md` means changing this identifier, and the two are only
 * correct together.
 */
export const CONSENT_VERSION = '2026-11-v1'

/**
 * Where the SMS agreement's two links go. Part of the wording a Person agrees to,
 * so moving one is a change to `docs/consent-language.md` and to the version above.
 */
export const PRIVACY_POLICY_URL = 'https://trydiscipler.com/privacy/'
export const TERMS_OF_SERVICE_URL = 'https://trydiscipler.com/terms/'
