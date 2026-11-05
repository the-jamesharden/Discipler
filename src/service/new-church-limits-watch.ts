import type { Clock } from '~/domain/clock'
import { limitsHitBy } from '~/domain/new-church-limits'
import type { NewChurchLimits, SupportAlerts } from './ports'

export interface NewChurchLimitsWatch {
  readonly limits: NewChurchLimits
  readonly alerts: Pick<SupportAlerts, 'newChurchLimitHit'>
  readonly clock: Clock
}

/** What one pass did: the tick reports it, so the cron log shows the watch ran. */
export interface NewChurchLimitsOutcome {
  /** Emails sent and recorded on this pass. */
  readonly told: number
  /** Emails that could not be finished; each is tried again on the next pass. */
  readonly failed: number
}

const nameOf = (error: unknown): string => (error instanceof Error ? error.name : 'unknown')

/**
 * Emails support@ when a church hits a limit on its first weeks (Exponential launch, ticket
 * 37), once per church per limit. Run by the scheduled tick once a pass, after every
 * church's own work, so it counts what that pass sent.
 *
 * **Recorded, then told, then marked told**, like the over-200 watch. The row is the memory
 * a stateless tick does not have. An email that failed stays recorded and untold, and the
 * next pass sends what is owed, under a key that drops a repeat within a day.
 *
 * Reading the standings finds a Roster or a week that reached a limit. A refused import
 * adds nobody, so the import route records its own hit, and it is told here with the rest.
 *
 * One email failing is logged by the church's ID and costs nobody else theirs.
 */
export const watchNewChurchLimits = async ({
  limits,
  alerts,
  clock,
}: NewChurchLimitsWatch): Promise<NewChurchLimitsOutcome> => {
  const now = clock.now()

  for (const standing of await limits.standings(now)) {
    for (const limit of limitsHitBy(standing)) {
      await limits.recordHit(standing.church, limit, now)
    }
  }

  let told = 0
  let failed = 0
  for (const hit of await limits.untold()) {
    try {
      await alerts.newChurchLimitHit(hit)
      await limits.recordTold(hit.church, hit.limit, clock.now())
      told += 1
    } catch (error) {
      failed += 1
      console.error(`Telling support@ about ministry ${hit.church} and its ${hit.limit} limit failed: ${nameOf(error)}`)
    }
  }

  return { told, failed }
}
