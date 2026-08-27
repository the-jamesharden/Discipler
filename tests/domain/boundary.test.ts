import { describe, expect, it } from 'vitest'
import { handleCommand } from '~/domain/boundary'
import { createTestClock, weeks } from '~/domain/clock'
import { createSequentialIds, ministryId } from '~/domain/ids'

const ministry = ministryId('11111111-1111-1111-1111-111111111111')

describe('the command boundary', () => {
  const clockAt = (iso: string) => createTestClock(new Date(iso))
  const ids = () => createSequentialIds()

  it('returns effects rather than performing them', async () => {
    const result = handleCommand(
      { type: 'scheduled.tick', ministryId: ministry },
      { ministryId: ministry, clock: clockAt('2026-03-02T09:00:00Z'), ids: ids() },
    )

    expect(result).toEqual({ effects: [] })
  })

  it('is pure: the same command against the same context yields the same effects', () => {
    const command = { type: 'scheduled.tick', ministryId: ministry } as const
    const context = { ministryId: ministry, clock: clockAt('2026-03-02T09:00:00Z'), ids: ids() }

    expect(handleCommand(command, context)).toEqual(handleCommand(command, context))
  })

  it('takes its time from the context, so a tick weeks later is still a plain call', () => {
    const clock = clockAt('2026-03-02T09:00:00Z')
    const command = { type: 'scheduled.tick', ministryId: ministry } as const

    clock.advanceBy(weeks(3))

    expect(handleCommand(command, { ministryId: ministry, clock, ids: ids() }).effects).toEqual([])
  })
})
