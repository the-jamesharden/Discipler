import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import type { Effect } from '~/domain/effects'
import { ShortNameRefused } from '~/domain/errors'
import { createSequentialIds, ministryId } from '~/domain/ids'
import { CONSENT_SOURCES } from '~/domain/intake'
import {
  ministryGroupsJoinLink,
  ministryGroupsJoinQrLink,
  ministryJoinLink,
  ministryJoinQrLink,
} from '~/domain/outbound-copy'
import {
  readShortName,
  RESERVED_SHORT_NAMES,
  SHORT_NAME_LONGEST,
  shortName,
  shortNameInLink,
} from '~/domain/short-name'

/**
 * Each Ministry's Intake forms at a link a pastor can print on a bulletin and say
 * from the pulpit (Pastor feedback, ticket 04): `/join/<short name>` for the
 * mentor and mentee form and `/join/<short name>/groups` for the groups form.
 */

const baseUrl = 'https://app.trydiscipler.com'
const riverside = shortName('riverside-chapel')

describe('the readable links', () => {
  it('opens the mentor and mentee form at the short name', () => {
    expect(ministryJoinLink(baseUrl, riverside)).toBe(`${baseUrl}/join/riverside-chapel`)
  })

  it('opens the groups form at the short name with /groups on the end', () => {
    expect(ministryGroupsJoinLink(baseUrl, riverside)).toBe(
      `${baseUrl}/join/riverside-chapel/groups`,
    )
  })

  it('does not care whether the base URL was given with a trailing slash', () => {
    expect(ministryJoinLink(`${baseUrl}/`, riverside)).toBe(ministryJoinLink(baseUrl, riverside))
    expect(ministryGroupsJoinLink(`${baseUrl}/`, riverside)).toBe(
      ministryGroupsJoinLink(baseUrl, riverside),
    )
  })

  it('gives each QR code the same link, saying it was scanned', () => {
    // `?via=qr` is the whole difference between what a pastor sends and what a
    // room scans, and a consent record is later read for which of the two it was.
    expect(ministryJoinQrLink(baseUrl, riverside)).toBe(`${ministryJoinLink(baseUrl, riverside)}?via=qr`)
    expect(ministryGroupsJoinQrLink(baseUrl, riverside)).toBe(
      `${ministryGroupsJoinLink(baseUrl, riverside)}?via=qr`,
    )
  })

  it('says `qr`, which is the word the form turns into a consent source', () => {
    // The form maps `qr` onto `qr_code` and a bare link onto `pastor_link`. If the
    // word drifted, every consent scanned off a bulletin would be recorded as
    // though a pastor had sent it.
    expect(new URL(ministryJoinQrLink(baseUrl, riverside)).searchParams.get('via')).toBe('qr')
    expect(new URL(ministryGroupsJoinQrLink(baseUrl, riverside)).searchParams.get('via')).toBe('qr')
    expect(CONSENT_SOURCES).toContain('qr_code')
  })

  it('names the church and nothing secret, because it is printed', () => {
    expect(ministryJoinLink(baseUrl, riverside)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/)
  })
})

describe('reading a short name an Admin typed', () => {
  it('takes lowercase letters, digits and dashes', () => {
    expect(readShortName('grace-church-2')).toEqual({ shortName: 'grace-church-2' })
  })

  it('takes capitals and stray spaces at either end as the same name, lowercased', () => {
    // What a pastor says from the pulpit has no capitals, and a link typed with
    // them still opens the forms, so nothing is lost by folding them here.
    expect(readShortName('  Grace-Church ')).toEqual({ shortName: 'grace-church' })
  })

  it('refuses nothing at all', () => {
    expect(readShortName('   ')).toEqual({ refusal: 'short_name.missing' })
  })

  it('refuses anything a link cannot carry plainly, rather than rewriting it', () => {
    for (const typed of ['grace church', 'grace_church', 'grâce', 'grace!', '-grace', 'grace-', 'grace--church']) {
      expect(readShortName(typed), typed).toEqual({ refusal: 'short_name.unreadable' })
    }
  })

  it('refuses one longer than a link a pastor can say', () => {
    expect(readShortName('a'.repeat(SHORT_NAME_LONGEST))).toEqual({
      shortName: 'a'.repeat(SHORT_NAME_LONGEST),
    })
    expect(readShortName('a'.repeat(SHORT_NAME_LONGEST + 1))).toEqual({
      refusal: 'short_name.too_long',
    })
  })

  it('refuses one the app’s own routes need', () => {
    expect(readShortName('overview')).toEqual({ refusal: 'short_name.reserved' })
    expect(readShortName('Groups')).toEqual({ refusal: 'short_name.reserved' })
  })

  it('reserves every top-level route the app has, so a new one cannot be forgotten', () => {
    const app = fileURLToPath(new URL('../../app', import.meta.url))
    const routes = readdirSync(app, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('[') && !entry.name.startsWith('('))
      .map((entry) => entry.name)

    expect(routes.length).toBeGreaterThan(10)
    for (const route of routes) expect(RESERVED_SHORT_NAMES, route).toContain(route)
  })
})

describe('a short name as it arrives in a link', () => {
  it('is read case-blind, since somebody typing what they heard may use capitals', () => {
    expect(shortNameInLink('Riverside-Chapel')).toBe('riverside-chapel')
  })

  it('is nothing at all when it could never have been a short name', () => {
    expect(shortNameInLink('riverside chapel')).toBeNull()
    expect(shortNameInLink('../intake')).toBeNull()
    expect(shortNameInLink('a'.repeat(SHORT_NAME_LONGEST + 1))).toBeNull()
  })
})

describe('changing a Ministry’s short name', () => {
  const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
  const at = new Date('2026-10-12T10:00:00Z')

  const context: CommandContext = {
    ministryId: ministry,
    clock: createTestClock(at),
    ids: createSequentialIds(),
    shortName: riverside,
  }

  const change = (typed: string): readonly Effect[] =>
    handleCommand(
      { type: 'short_name.change', ministryId: ministry, shortName: typed, changedBy: 'admin-user' },
      context,
    ).effects

  it('changes it, and records the change in the Ministry’s history', () => {
    const effects = change('riverside')

    expect(effects).toEqual([
      { kind: 'shortName.change', change: { ministryId: ministry, shortName: 'riverside' } },
      {
        kind: 'history.append',
        event: {
          ministryId: ministry,
          occurredAt: at,
          type: 'ministry.short_name_changed',
          subjectType: 'ministry',
          subjectId: ministry,
          // The name it used to have, which the update overwrites on the row and
          // which every link printed before today still carries.
          payload: { changedBy: 'admin-user', from: 'riverside-chapel', to: 'riverside' },
        },
      },
    ])
  })

  it('writes nothing when the name typed is the one it already has', () => {
    expect(change(' Riverside-Chapel ')).toEqual([])
  })

  it('refuses a name it cannot carry, with the reason', () => {
    expect(() => change('riverside chapel')).toThrow(ShortNameRefused)
    try {
      change('overview')
    } catch (error) {
      expect((error as ShortNameRefused).refusal).toBe('short_name.reserved')
    }
  })

  it('refuses to run without the name it is changing from', () => {
    const { shortName: _loaded, ...unloaded } = context
    expect(() =>
      handleCommand(
        { type: 'short_name.change', ministryId: ministry, shortName: 'grace', changedBy: 'admin-user' },
        unloaded,
      ),
    ).toThrow(/no short name/)
  })
})
