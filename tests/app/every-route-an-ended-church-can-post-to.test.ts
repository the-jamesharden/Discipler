import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { changesTheChurchsWork } from '~/domain/read-only'

/**
 * The rule read against the routes that exist (Exponential launch, ticket 33). A route that
 * writes is refused to an ended church unless it is on this list, so a mistake in the rule
 * shows here as a name, whichever way it went.
 */
const STAYS_OPEN = new Set([
  'account',
  'auth',
  'cron',
  'help',
  'intake',
  'invitation',
  'login',
  'material',
  'r',
  'setup',
  'signup',
  'sms',
  'stripe',
])

const routesIn = (directory: string): readonly string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const at = join(directory, entry.name)
    if (entry.isDirectory()) return routesIn(at)
    return entry.name === 'route.ts' ? [at] : []
  })

const WRITES = /export (async function|const) (POST|PUT|PATCH|DELETE)\b/

const writingRoutes = routesIn('app')
  .filter((file) => WRITES.test(readFileSync(file, 'utf8')))
  .map((file) => `/${relative('app', file).replace(/\/?route\.ts$/, '')}`)

describe('every route that writes', () => {
  it('finds them', () => {
    expect(writingRoutes.length).toBeGreaterThan(30)
  })

  it.each(writingRoutes)('%s is refused, or stays open by name', (path) => {
    const first = path.split('/')[1]!
    const billing = path.startsWith('/settings/billing/')
    const seen = path === '/settings/setup-seen'
    expect(changesTheChurchsWork('POST', path)).toBe(!STAYS_OPEN.has(first) && !billing && !seen)
  })

  it('leaves the rest of Settings refused, past the one note of what an Admin has seen', () => {
    expect(changesTheChurchsWork('POST', '/settings/setup-seen')).toBe(false)
    expect(changesTheChurchsWork('POST', '/settings/setup-seen-not')).toBe(true)
    expect(changesTheChurchsWork('POST', '/settings/language')).toBe(true)
  })
})
