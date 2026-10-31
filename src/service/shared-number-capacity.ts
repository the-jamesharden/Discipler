import type { Clock } from '~/domain/clock'
import { capacityConcerns, type CapacityConcern } from '~/domain/shared-numbers'
import type { SharedNumberCapacity, SupportAlerts } from './ports'

export interface CapacityWatch {
  readonly numbers: SharedNumberCapacity
  readonly alerts: SupportAlerts
  readonly clock: Clock
}

/**
 * Tells support@ when the shared numbers run near capacity, which replaced the
 * planned email at 40 numbers (Exponential launch, ticket 06). Run by the scheduled
 * tick once a pass, after every church's own work, because the set belongs to none
 * of them.
 *
 * Once per concern for each size of the set. Told, then recorded: an email that
 * did not go is not recorded, so the next pass tries again. If the record is what
 * failed, the retry carries the same day, so an email sender that keys on it drops
 * a same-day second email.
 *
 * Returns the concerns it told support@ about on this pass.
 */
export const watchSharedNumberCapacity = async ({
  numbers,
  alerts,
  clock,
}: CapacityWatch): Promise<readonly CapacityConcern[]> => {
  const load = await numbers.load()
  const told: CapacityConcern[] = []

  for (const concern of capacityConcerns(load)) {
    if (await numbers.alreadyRaised(concern, load.numbers)) continue

    await alerts.sharedNumbersNearCapacity({
      concern,
      numbers: load.numbers,
      recipients: load.recipients,
      mostChurchesOnOnePhone: load.mostChurchesOnOnePhone,
      day: clock.now().toISOString().slice(0, 10),
    })
    await numbers.recordRaised(concern, clock.now(), load)
    told.push(concern)
  }

  return told
}
