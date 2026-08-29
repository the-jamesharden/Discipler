import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
  let container: typeof import('~/service/container')

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')

    process.env.DATABASE_URL = localSupabase().databaseUrl
    // Where the links it texts point. The container reads this the same way the
    // running app does, so leaving it unset is the failure it is supposed to be.
    process.env.NEXT_PUBLIC_APP_URL = 'https://discipler.test'
    // Imported after the environment is set, because the container reads it when
    // it first builds the store.
    container = await import('~/service/container')
  })

  // The real container holds a real connection pool, so this file gives it back
  // rather than leaving it open the way the running app does.
  afterAll(async () => {
    await container.closeCommandService()
  })

  it('accepts a command through the real store without an in-memory stand-in', async () => {
    const result = await container.getCommandService().execute({
      type: 'scheduled.tick',
      ministryId: ministry.id,
    })

    expect(result.effects).toEqual([])
  })

  it('hands back the same service rather than opening a pool per call', () => {
    expect(container.getCommandService()).toBe(container.getCommandService())
  })
})
