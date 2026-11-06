import { emailKeyOf, type PendingSignup, type SignUpAttemptToken } from '~/domain/sign-up-attempt'
import type { PendingSignups } from '~/service/ports'

/**
 * `PendingSignups` with no database, for the scenarios in `sign-up-scenarios.ts` to
 * run without the shared stack. The same scenarios run against the real tables in
 * `tests/integration/the-email-code-at-sign-up.test.ts`, which is what keeps this
 * honest. `calls` is every port call in order, for proving two paths take the same
 * steps.
 */
export const createInMemoryPendingSignups = () => {
  const rows = new Map<string, PendingSignup & { sends: number }>()
  const sends: { email: string; network: string | null; at: Date }[] = []
  const accounts = new Set<string>()
  const calls: string[] = []
  let nextId = 1

  const change = (attempt: SignUpAttemptToken, patch: Partial<PendingSignup & { sends: number }>) => {
    const row = rows.get(attempt)
    if (row) rows.set(attempt, { ...row, ...patch })
  }

  const store: PendingSignups = {
    async begin(attempt, at) {
      calls.push('begin')
      rows.set(attempt, {
        id: `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`,
        humanPassedAt: at,
        email: null,
        phone: null,
        agreedAt: null,
        codeDigest: null,
        codeSentAt: null,
        codeTries: 0,
        verifiedAt: null,
        spentAt: null,
        sends: 0,
      })
    },

    async read(attempt) {
      calls.push('read')
      return rows.get(attempt) ?? null
    },

    async sending(attempt, email, network, work) {
      calls.push('sending')
      const emailKey = emailKeyOf(email)
      return work({
        pending: rows.get(attempt) ?? null,
        async recentSends(since) {
          calls.push('recentSends')
          const recent = sends.filter((send) => send.at.getTime() > since.getTime())
          return {
            forEmail: recent.filter((send) => send.email === emailKey).length,
            forNetwork: recent.filter((send) => network !== null && send.network === network).length,
          }
        },
        async emailHasAccount() {
          calls.push('emailHasAccount')
          return accounts.has(emailKey)
        },
        async issue({ phone, codeDigest, at }) {
          calls.push('issue')
          const row = rows.get(attempt)!
          const sendNumber = row.sends + 1
          change(attempt, {
            email,
            phone,
            agreedAt: row.phone === phone ? row.agreedAt : at,
            codeDigest,
            codeSentAt: at,
            codeTries: 0,
            sends: sendNumber,
          })
          sends.push({ email: emailKey, network, at })
          return sendNumber
        },
      })
    },

    async trying(attempt, work) {
      calls.push('trying')
      return work({
        pending: rows.get(attempt) ?? null,
        async recordWrongTry() {
          change(attempt, { codeTries: rows.get(attempt)!.codeTries + 1 })
        },
        async markVerified(at) {
          change(attempt, { verifiedAt: at, codeDigest: null })
        },
      })
    },

    async codeNotSent(attempt) {
      calls.push('codeNotSent')
      change(attempt, { codeDigest: null, codeSentAt: null })
    },

    async opening(_attempt, work) {
      calls.push('opening')
      return work()
    },
  }

  return {
    store,
    calls,
    giveAccount: async (email: string) => {
      accounts.add(email.toLowerCase())
    },
    /** What opening the church does to the attempt, in a transaction this fake has no part in. */
    spend: (attempt: SignUpAttemptToken, at: Date) => change(attempt, { spentAt: at }),
  }
}
