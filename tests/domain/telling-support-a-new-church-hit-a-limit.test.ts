import { describe, expect, it } from 'vitest'
import type { EmailEnvelope } from '~/domain/email'
import { ministryId } from '~/domain/ids'
import { limitsHitBy } from '~/domain/new-church-limits'
import { createEmailSender } from '~/service/email-sender'
import { createEmailSupportAlerts } from '~/service/support-alerts'

/** What support@ reads when a church hits a limit on its first weeks (Exponential launch, ticket 37). */
describe('telling support@ a new church hit a limit', () => {
  const church = ministryId('00000000-0000-4000-8000-0000000000aa')

  const told = async (limit: 'roster' | 'texts') => {
    const delivered: EmailEnvelope[] = []
    const alerts = createEmailSupportAlerts(
      createEmailSender({
        async deliver(envelope) {
          delivered.push(envelope)
        },
      }),
    )
    await alerts.newChurchLimitHit({ church, churchName: 'Riverside Chapel', limit })
    return delivered[0]!
  }

  it('names the church and the limit, to support@, and says what to do', async () => {
    const email = await told('roster')

    expect(email).toMatchObject({
      to: ['support@trydiscipler.com'],
      subject: 'Riverside Chapel hit a limit on a new church',
      idempotencyKey: `newChurchLimitHit/new-church-limit:${church}:roster`,
    })
    expect(email.text).toContain('300 people on its Roster')
    expect(email.text).toContain(`Riverside Chapel (${church})`)
    expect(email.text).toContain('npm run new-church-limit -- lift')
    expect(email.text).toContain('Someone filling in its Intake form is still added')
  })

  it('says of the texts that nothing is lost', async () => {
    const email = await told('texts')

    expect(email.text).toContain('1,500 texts in seven days')
    expect(email.text).toContain('nothing is lost')
    expect(email.idempotencyKey).toBe(`newChurchLimitHit/new-church-limit:${church}:texts`)
  })
})

describe('what counts as hitting a limit', () => {
  it('is reaching it, not passing it', () => {
    expect(limitsHitBy({ people: 299, textsThisWeek: 1_499 })).toEqual([])
    expect(limitsHitBy({ people: 300, textsThisWeek: 1_499 })).toEqual(['roster'])
    expect(limitsHitBy({ people: 299, textsThisWeek: 1_500 })).toEqual(['texts'])
    expect(limitsHitBy({ people: 301, textsThisWeek: 1_501 })).toEqual(['roster', 'texts'])
  })
})
