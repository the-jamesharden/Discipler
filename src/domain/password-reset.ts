import { emailBody, EmailField, emailHtml, emailSubject, type Email, type EmailAddress } from './email'
import type { Branded } from './branded'
import { PASSWORD_RESET_LINK_MINUTES } from './launch-terms'

/**
 * "Forgot your password?" (Exponential launch, ticket 22; ADR-0030). An Admin with a
 * verified email is emailed a link, and the link's page takes a new password. Its words
 * and its design are James's, from mock-up 6's `m1-reset-email.html`.
 *
 * How many times somebody may ask is `sendAllowed` in `./sign-up-attempt`, the caps on
 * sign-up's emails; where a link is kept is `PasswordResetLinks`.
 */

/** The random value in the email's link: 256 bits, base64url. */
export type PasswordResetToken = Branded<string, 'PasswordResetToken'>

/**
 * What came from an address, or null when it cannot be a link. Typed off a screen as
 * often as tapped, so nothing reaches a query until it has the shape of one.
 */
export const readPasswordResetToken = (raw: string | null | undefined): PasswordResetToken | null =>
  typeof raw === 'string' && /^[A-Za-z0-9_-]{43}$/.test(raw) ? (raw as PasswordResetToken) : null

/** When a link asked for now stops working. */
export const passwordResetLinkExpiry = (at: Date): Date =>
  new Date(at.getTime() + PASSWORD_RESET_LINK_MINUTES * 60_000)

export interface PasswordResetEmail {
  /** The link's own row ID, which is new with each link: all that makes this email this email. */
  readonly once: string
  readonly to: EmailAddress
  readonly link: URL
  readonly logo: URL
}

/**
 * The reset email. It names no church and nobody at all, so it holds no congregation
 * data, and the link is the only thing in it that is not Discipler's own sentence.
 */
export const passwordResetEmail = ({ once, to, link, logo }: PasswordResetEmail): Email<'passwordReset'> => {
  const choose = EmailField.link(link)
  const image = EmailField.link(logo)
  const minutes = EmailField.line(String(PASSWORD_RESET_LINK_MINUTES))

  return {
    kind: 'passwordReset',
    to,
    once,
    subject: emailSubject`Reset your Discipler password`,
    body: emailBody`Reset your password

Somebody asked to reset the password on your Discipler account. If that was you, choose a new one here. This link works once, for ${minutes} minutes.

Choose a new password: ${choose}

If it wasn't you, you can ignore this email, and your password stays as it is.

If you need a hand, reply to this email.

You're receiving this because a password reset was asked for on your Discipler account at app.trydiscipler.com.
`,
    html: emailHtml`<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;padding:24px 16px;background:#eceae6;font-family:'DM Sans',system-ui,-apple-system,'Segoe UI',Arial,sans-serif;color:#2d2d2d;line-height:1.6">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e8dfd5;border-radius:8px;overflow:hidden">
<div style="background:#f5f1eb;padding:22px 32px;border-bottom:1px solid #e8dfd5"><img src="${image}" alt="Discipler" height="34" style="height:34px;width:auto;display:block"></div>
<div style="padding:29px 32px 26px;font-size:15px">
<h1 style="font-family:'Crimson Pro',Georgia,serif;color:#2d5016;font-size:26px;line-height:1.2;font-weight:600;margin:0 0 16px">Reset your password</h1>
<p style="margin:0 0 16px">Somebody asked to reset the password on your Discipler account. If that was you, choose a new one here. This link works once, for ${minutes} minutes.</p>
<a href="${choose}" style="display:inline-block;background:#2d5016;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:6px;margin:5px 0 21px">Choose a new password</a>
<p style="margin:0 0 16px">If it wasn't you, you can ignore this email, and your password stays as it is.</p>
<p style="margin:0 0 16px">If you need a hand, reply to this email.</p>
</div>
<div style="padding:16px 32px 22px;font-size:12px;color:#888888;border-top:1px solid #f0ebe4">You're receiving this because a password reset was asked for on your Discipler account at app.trydiscipler.com.</div>
</div>
</body></html>
`,
  }
}
