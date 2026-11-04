/**
 * A church's referral code, as `/r/<code>` carries it (Exponential launch, ticket 20).
 * The code is made by `app.a_referral_code` in the database, which is the one place a
 * code comes from, and whose check this repeats: ten letters of Crockford's base32.
 *
 * Case does not matter, because a link pasted through a text or an email may not keep it.
 */

const REFERRAL_CODE = /^[0-9a-hjkmnp-tv-z]{10}$/

/** The code as it is stored, or null for something that could not be one. */
export const readReferralCode = (given: string | null | undefined): string | null => {
  const code = given?.trim().toLowerCase() ?? ''
  return REFERRAL_CODE.test(code) ? code : null
}

/** The link as the Refer page shows and copies it: `app.trydiscipler.com/r/<code>`. */
export const referralLinkShown = (appUrl: string, code: string): string =>
  `${appUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '')}/r/${code}`

/** What Copy puts in the note: with its scheme, since some text apps need one to make it a link. */
export const referralLinkCopied = (shown: string): string => `https://${shown}`
