import type { Clock } from '~/domain/clock'
import { SUPPORT_SUBMISSIONS } from '~/domain/launch-terms'
import { HUMAN_CHECK_ACTIONS } from '~/domain/sign-up-attempt'
import {
  LIMIT_WINDOW_MS,
  readSupportForm,
  submissionsKeptSince,
  supportEmail,
  type SupportFormRefusal,
  type SupportSubmission,
  type TypedSupportForm,
} from '~/domain/support-form'
import { whyNotSent } from './email-sender'
import type { EmailSender, HumanCheck, SupportSubmissions } from './ports'

/**
 * The Help menu's form, from what was typed to support@'s inbox (Exponential launch,
 * ticket 25).
 *
 * **Kept first, then emailed.** Once it is kept the person is told so, whatever the
 * mail vendor does: a send that fails leaves the row waiting, and the tick sends it
 * on its next pass, so a Resend outage loses nothing and nobody is asked to type a
 * message twice. The vendor's idempotency key is the row's ID, so a retry within a
 * day is the same email.
 *
 * Nothing is logged but a row's ID and why a send failed, in words that cannot hold
 * what the email held.
 */

export type SupportFormAnswer = { readonly sent: true } | { readonly refusal: SupportFormRefusal }

export interface SupportSweep {
  /** Older than the privacy policy promises to keep, and gone. */
  readonly deleted: number
  /** Waiting after a failed send, and sent on this pass. */
  readonly emailed: number
  readonly stillWaiting: number
}

export interface SupportForm {
  /** From a signed-in Admin. The church and the Admin come from the session, never the form. */
  fromAChurch(
    request: TypedSupportForm & {
      readonly ministryId: string
      readonly churchName: string
      readonly submittedBy: string
    },
  ): Promise<SupportFormAnswer>
  /** From anybody else: spends a Turnstile token, and counts against the network. */
  signedOut(
    request: TypedSupportForm & { readonly humanToken: string; readonly network: string | null },
  ): Promise<SupportFormAnswer>
  /** The tick's pass: deletes what has been kept long enough, and sends what is waiting. */
  sweep(): Promise<SupportSweep>
}

/** More than this waiting at once is a vendor that is down, and the next pass takes more. */
const WAITING_ON_ONE_PASS = 25

export const createSupportForm = ({
  submissions,
  humanCheck,
  sender,
  clock,
}: {
  readonly submissions: SupportSubmissions
  readonly humanCheck: HumanCheck
  readonly sender: EmailSender
  readonly clock: Clock
}): SupportForm => {
  /**
   * Whether it reached the vendor and that was recorded. Never throws, because it is
   * already kept: a row the tick finds still unmarked goes again, under the same key.
   */
  const email = async (submission: SupportSubmission): Promise<boolean> => {
    try {
      await sender.send(supportEmail(submission))
      await submissions.markEmailed(submission.id, clock.now())
      return true
    } catch (error) {
      console.error(`Support submission ${submission.id} was not emailed: ${whyNotSent(error)}`)
      return false
    }
  }

  const limitSince = (at: Date, most: number) => ({ since: new Date(at.getTime() - LIMIT_WINDOW_MS), most })

  return {
    async fromAChurch({ ministryId, churchName, submittedBy, ...typed }) {
      const reading = readSupportForm(typed)
      if ('refusal' in reading) return reading

      const at = clock.now()
      const id = await submissions.keepFromAChurch({
        fields: reading.fields,
        ministryId,
        submittedBy,
        at,
        limit: limitSince(at, SUPPORT_SUBMISSIONS.perAdminPerHour),
      })
      if (id === null) return { refusal: 'support.too_many' }

      await email({ ...reading.fields, id, churchName })
      return { sent: true }
    },

    async signedOut({ humanToken, network, ...typed }) {
      const reading = readSupportForm(typed)
      if ('refusal' in reading) return reading

      // Asked before the store's lock is taken, because no lock waits on Cloudflare.
      if (!(await humanCheck.verify(humanToken, HUMAN_CHECK_ACTIONS.contactSupport))) {
        return { refusal: 'support.not_human' }
      }

      const at = clock.now()
      const id = await submissions.keepSignedOut({
        fields: reading.fields,
        network,
        at,
        limit: limitSince(at, SUPPORT_SUBMISSIONS.perNetworkPerHour),
      })
      if (id === null) return { refusal: 'support.too_many' }

      await email({ ...reading.fields, id, churchName: null })
      return { sent: true }
    },

    async sweep() {
      const deleted = await submissions.deleteSubmittedBefore(submissionsKeptSince(clock.now()))

      const waiting = await submissions.waitingForEmail(WAITING_ON_ONE_PASS)
      let emailed = 0
      for (const submission of waiting) {
        // The first failure is a vendor that is down, and the rest would only fail too.
        if (!(await email(submission))) break
        emailed += 1
      }

      return { deleted, emailed, stillWaiting: waiting.length - emailed }
    },
  }
}
