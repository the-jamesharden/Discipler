import { beforeAll, describe, expect, it } from 'vitest'
import { createMinistryWithAdmin, localSupabase, type MinistryFixture } from '../support/local-supabase'

/**
 * The composition root is where the ports meet their real implementations. The
 * rest of the suite drives the boundary with a test clock and an in-memory store,
 * which proves the rules but not the wiring -- so this exercises the wiring itself:
 * the system clock, the Postgres store, and the boundary, assembled as the running
 * app assembles them.
 */

describe('the wired-up command service', () => {
  let ministry: MinistryFixture
  let getCommandService: typeof import('~/service/container')['getCommandService']

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')

    process.env.DATABASE_URL = localSupabase().databaseUrl
    // Imported after the environment is set, because the container reads it when
    // it first builds the store.
    ;({ getCommandService } = await import('~/service/container'))
  })

  it('accepts a command through the real store without an in-memory stand-in', async () => {
    const result = await getCommandService().execute({
      type: 'scheduled.tick',
      ministryId: ministry.id,
    })

    expect(result.effects).toEqual([])
  })

  it('hands back the same service rather than opening a pool per call', () => {
    expect(getCommandService()).toBe(getCommandService())
  })
})
