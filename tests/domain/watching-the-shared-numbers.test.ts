import { describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import type { CapacityConcern, SharedNumberLoad } from '~/domain/shared-numbers'
import type {
  SharedNumberCapacity,
  SharedNumbersNearCapacity,
  SupportAlerts,
} from '~/service/ports'
import { watchSharedNumberCapacity } from '~/service/shared-number-capacity'

/**
 * support@ is emailed when the shared numbers run near capacity (Exponential launch,
 * ticket 06), once for each concern at each size of the set: told again only after a
 * number has been added and the bigger set fills up too.
 */
const world = (start: SharedNumberLoad, now = '2026-11-09T15:00:00Z') => {
  let load = start
  const raised: { concern: CapacityConcern; numbers: number; at: Date }[] = []
  const told: SharedNumbersNearCapacity[] = []
  let failing = false

  const numbers: SharedNumberCapacity = {
    load: async () => load,
    alreadyRaised: async (concern, size) =>
      raised.some((one) => one.concern === concern && one.numbers === size),
    recordRaised: async (concern, at, size) => {
      raised.push({ concern, numbers: size.numbers, at })
    },
  }
  const alerts: SupportAlerts = {
    async sharedNumbersNearCapacity(alert) {
      if (failing) throw new Error('the sender is down')
      told.push(alert)
    },
    async billingEventRefused() {},
  }
  const clock = createTestClock(new Date(now))

  return {
    told,
    raised,
    becomes: (next: SharedNumberLoad) => {
      load = next
    },
    senderFails: (fails: boolean) => {
      failing = fails
    },
    watch: () => watchSharedNumberCapacity({ numbers, alerts, clock }),
  }
}

describe('Watching the shared numbers', () => {
  it('tells support@ nothing while there is room', async () => {
    const it_ = world({
      numbers: 8,
      recipients: 61,
      mostChurchesOnOnePhone: 1,
    })

    expect(await it_.watch()).toEqual([])
    expect(it_.told).toEqual([])
  })

  it('tells support@ once the set is near capacity, in counts and the day it read them', async () => {
    const it_ = world({
      numbers: 8,
      recipients: 1300,
      mostChurchesOnOnePhone: 1,
    })

    expect(await it_.watch()).toEqual(['recipients'])
    expect(it_.told).toEqual([
      {
        concern: 'recipients',
        load: { numbers: 8, recipients: 1300, mostChurchesOnOnePhone: 1 },
        day: '2026-11-09',
      },
    ])
  })

  it('names the day in UTC, whatever the hour', async () => {
    const it_ = world(
      { numbers: 8, recipients: 1300, mostChurchesOnOnePhone: 1 },
      '2026-11-09T23:30:00-05:00',
    )

    await it_.watch()
    expect(it_.told[0]?.day).toBe('2026-11-10')
  })

  it('does not tell support@ again on the next tick while nothing has been added', async () => {
    const it_ = world({
      numbers: 8,
      recipients: 1300,
      mostChurchesOnOnePhone: 1,
    })
    await it_.watch()

    it_.becomes({ numbers: 8, recipients: 1350, mostChurchesOnOnePhone: 1 })
    expect(await it_.watch()).toEqual([])
    expect(it_.told).toHaveLength(1)
  })

  it('tells support@ again once a number was added and the bigger set fills too', async () => {
    const it_ = world({
      numbers: 8,
      recipients: 1300,
      mostChurchesOnOnePhone: 1,
    })
    await it_.watch()

    it_.becomes({ numbers: 9, recipients: 1350, mostChurchesOnOnePhone: 1 })
    expect(await it_.watch()).toEqual([])

    it_.becomes({ numbers: 9, recipients: 1450, mostChurchesOnOnePhone: 1 })
    expect(await it_.watch()).toEqual(['recipients'])
    expect(it_.told).toHaveLength(2)
  })

  it('tells each concern on its own', async () => {
    const it_ = world({
      numbers: 3,
      recipients: 61,
      mostChurchesOnOnePhone: 2,
    })

    expect(await it_.watch()).toEqual(['one_phone'])
    it_.becomes({ numbers: 3, recipients: 500, mostChurchesOnOnePhone: 2 })
    expect(await it_.watch()).toEqual(['recipients'])
    expect(it_.told.map((one) => one.concern)).toEqual(['one_phone', 'recipients'])
  })

  it('records nothing when the email did not go, so the next tick tries again', async () => {
    const it_ = world({
      numbers: 8,
      recipients: 1300,
      mostChurchesOnOnePhone: 1,
    })
    it_.senderFails(true)

    await expect(it_.watch()).rejects.toThrow('the sender is down')
    expect(it_.raised).toEqual([])

    it_.senderFails(false)
    expect(await it_.watch()).toEqual(['recipients'])
    expect(it_.raised).toEqual([
      {
        concern: 'recipients',
        numbers: 8,
        at: new Date('2026-11-09T15:00:00Z'),
      },
    ])
  })
})
