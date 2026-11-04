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
 * The wording an Admin agrees to on sign-up's email and phone page, recorded on their
 * `ministry_setup` consent (Exponential launch, ticket 17). It is different wording from
 * Statement 1, so `docs/consent-language.md` gives it an identifier of its own, and
 * neither one ever stands for the other.
 */
export const SIGN_UP_CONSENT_VERSION = '2026-11-signup-v1'

/**
 * The Terms of Service a church agrees to on "Set up your account": the effective date
 * in `docs/legal/terms-of-service.md`, which a test reads. New terms mean a new date here.
 */
export const TERMS_VERSION = '2026-11-03'

/**
 * Where the SMS agreement's two links go. Part of the wording a Person agrees to,
 * so moving one is a change to `docs/consent-language.md` and to the version above.
 */
export const PRIVACY_POLICY_URL = 'https://trydiscipler.com/privacy/'
export const TERMS_OF_SERVICE_URL = 'https://trydiscipler.com/terms/'
