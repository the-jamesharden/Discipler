import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { systemClock } from '~/domain/clock'
import { ShortNameRefused } from '~/domain/errors'
import type { IdSource } from '~/domain/ids'
import { RESERVED_SHORT_NAMES, SHORT_NAME_LONGEST, shortName } from '~/domain/short-name'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createPostgresIntakeReader } from '~/platform/supabase/intake-reader'
import { createCommandService } from '~/service/command-service'
import { createMinistryWithAdmin, localSupabase, type MinistryFixture } from '../support/local-supabase'

/**
 * A Ministry's short name against the real database (Pastor feedback, ticket 04),
 * where the rules that matter are the ones no form can get round: a Ministry is
 * given one when it opens, from its name; no two Ministries ever share one, now
 * or once; and every name a Ministry has held keeps naming it, because QR codes
 * get printed on bulletins.
 *
 * Only the database can say whether another Ministry holds a name, so the refusal
 * the boundary cannot make is proved here.
 */

describe('a readable link per church', () => {
  let store: ReturnType<typeof createPostgresEffectStore>
  let reader: ReturnType<typeof createPostgresIntakeReader>
  let pool: pg.Pool

  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () =>
    createCommandService({ clock: systemClock, ids, store, appBaseUrl: 'https://discipler.test' })

  beforeAll(async () => {
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    reader = createPostgresIntakeReader(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await reader.close()
    await pool.end()
  })

  /** A word no earlier run has used, since every name is held for good. */
  const fresh = (): string => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`

  const rename = (ministry: MinistryFixture, to: string) =>
    service().execute({
      type: 'short_name.change',
      ministryId: ministry.id,
      shortName: to,
      changedBy: ministry.adminUserId,
    })

  const currentName = async (ministry: MinistryFixture): Promise<string> => {
    const { rows } = await pool.query<{ short_name: string }>(
      `select short_name from ministry where id = $1`,
      [ministry.id],
    )
    return rows[0]!.short_name
  }

  describe('what a Ministry’s name reads as in a link', () => {
    const from = async (name: string): Promise<string> =>
      (await pool.query<{ slug: string }>(`select app.short_name_from($1) as slug`, [name])).rows[0]!.slug

    it('is lowercase words joined by dashes', async () => {
      expect(await from('Riverside Chapel')).toBe('riverside-chapel')
      expect(await from('  Grace   Community  Church ')).toBe('grace-community-church')
    })

    it('reads apostrophes, ampersands and accents the way a pastor would say them', async () => {
      expect(await from('St. Mark’s Church')).toBe('st-marks-church')
      expect(await from("St. Mark's Church")).toBe('st-marks-church')
      expect(await from('Faith & Hope Fellowship')).toBe('faith-and-hope-fellowship')
      expect(await from('Igreja São João')).toBe('igreja-sao-joao')
    })

    it('is cut at a word, never past the longest a short name may be', async () => {
      const cut = await from('First Baptist Church of the Greater Springfield Metropolitan Area')
      expect(cut).toBe('first-baptist-church-of-the-greater')
      expect(cut.length).toBeLessThanOrEqual(SHORT_NAME_LONGEST)
    })

    it('is `church` when the name has nothing a link can carry', async () => {
      expect(await from('教会')).toBe('church')
    })
  })

  describe('a Ministry opening', () => {
    it('is given a short name from its name', async () => {
      const name = `Opening ${fresh()} Chapel`
      const ministry = await createMinistryWithAdmin(name)

      expect(ministry.shortName).toBe(name.toLowerCase().replaceAll(' ', '-'))
      expect(await currentName(ministry)).toBe(ministry.shortName)
    })

    it('adds -2, -3 and so on when another Ministry already has the name', async () => {
      const name = `Clash ${fresh()} Church`
      const first = await createMinistryWithAdmin(name)
      const second = await createMinistryWithAdmin(name)
      const third = await createMinistryWithAdmin(name)

      expect(second.shortName).toBe(`${first.shortName}-2`)
      expect(third.shortName).toBe(`${first.shortName}-3`)
    })

    it('starts at -2 where another church’s own name ends in a number', async () => {
      const word = fresh()
      const numbered = await createMinistryWithAdmin(`Grace ${word} 300`)
      const first = await createMinistryWithAdmin(`Grace ${word}`)
      const second = await createMinistryWithAdmin(`Grace ${word}`)

      expect(numbered.shortName).toBe(`grace-${word}-300`)
      expect(first.shortName).toBe(`grace-${word}`)
      expect(second.shortName).toBe(`grace-${word}-2`)
    })

    it('is never given a name the app’s own routes need', async () => {
      const ministry = await createMinistryWithAdmin('Overview')

      expect(ministry.shortName).toMatch(/^overview-\d+$/)
    })
  })

  describe('the database', () => {
    it('refuses every name the app’s own routes need, however it is written', async () => {
      const ministry = await createMinistryWithAdmin(`Routes ${fresh()}`)

      for (const reserved of RESERVED_SHORT_NAMES) {
        await expect(
          pool.query(`update ministry set short_name = $1 where id = $2`, [reserved, ministry.id]),
          reserved,
        ).rejects.toThrow(/ministry_short_name_is_not_a_route/)
      }
    })

    it('refuses a short name a link could not carry plainly', async () => {
      const ministry = await createMinistryWithAdmin(`Unreadable ${fresh()}`)

      for (const unreadable of ['Grace', 'grace church', '-grace', 'grace--church', 'a'.repeat(SHORT_NAME_LONGEST + 1)]) {
        await expect(
          pool.query(`update ministry set short_name = $1 where id = $2`, [unreadable, ministry.id]),
          unreadable,
        ).rejects.toThrow(/ministry_short_name_is_readable/)
      }
    })

    it('never lets a held name be let go or handed to somebody else', async () => {
      const ministry = await createMinistryWithAdmin(`Held ${fresh()}`)

      await expect(
        pool.query(`delete from held_short_name where short_name = $1`, [ministry.shortName]),
      ).rejects.toThrow(/kept for good/)
      await expect(
        pool.query(`update held_short_name set ministry_id = ministry_id where short_name = $1`, [ministry.shortName]),
      ).rejects.toThrow(/kept for good/)
      await expect(pool.query(`truncate table held_short_name`)).rejects.toThrow(/kept for good/)
    })
  })

  describe('an Admin renaming it', () => {
    it('gives the Ministry the new name and keeps the old one naming it', async () => {
      const ministry = await createMinistryWithAdmin(`Renamed ${fresh()}`)
      const wanted = `renamed-${fresh()}`

      await rename(ministry, wanted)

      expect(await currentName(ministry)).toBe(wanted)
      for (const held of [ministry.shortName, wanted]) {
        expect(await reader.ministryNamed(shortName(held))).toEqual({
          ministryId: ministry.id,
          shortName: wanted,
        })
      }
    })

    it('records the change in the Ministry’s history, with what it was', async () => {
      const ministry = await createMinistryWithAdmin(`Recorded ${fresh()}`)
      const wanted = `recorded-${fresh()}`

      await rename(ministry, wanted)

      const { rows } = await pool.query<{ subject_id: string; payload: unknown }>(
        `select subject_id, payload from ministry_event
          where ministry_id = $1 and type = 'ministry.short_name_changed'`,
        [ministry.id],
      )
      expect(rows).toEqual([
        { subject_id: ministry.id, payload: { changedBy: ministry.adminUserId, from: ministry.shortName, to: wanted } },
      ])
    })

    it('is refused a name another Ministry has now, and writes nothing', async () => {
      const mine = await createMinistryWithAdmin(`Mine ${fresh()}`)
      const theirs = await createMinistryWithAdmin(`Theirs ${fresh()}`)

      const refusal = await rename(mine, theirs.shortName).catch((error: unknown) => error)

      expect(refusal).toBeInstanceOf(ShortNameRefused)
      expect((refusal as ShortNameRefused).refusal).toBe('short_name.taken')
      expect(await currentName(mine)).toBe(mine.shortName)
      const { rows } = await pool.query(
        `select 1 from ministry_event where ministry_id = $1 and type = 'ministry.short_name_changed'`,
        [mine.id],
      )
      expect(rows).toEqual([])
    })

    it('is refused a name another Ministry had once, because its printed links still use it', async () => {
      const mine = await createMinistryWithAdmin(`Mine ${fresh()}`)
      const theirs = await createMinistryWithAdmin(`Theirs ${fresh()}`)
      await rename(theirs, `theirs-${fresh()}`)

      const refusal = await rename(mine, theirs.shortName).catch((error: unknown) => error)

      expect((refusal as ShortNameRefused).refusal).toBe('short_name.taken')
      expect((await reader.ministryNamed(shortName(theirs.shortName)))?.ministryId).toBe(theirs.id)
    })

    it('takes back a name it held before, without a second record of holding it', async () => {
      const ministry = await createMinistryWithAdmin(`Returning ${fresh()}`)
      await rename(ministry, `returning-${fresh()}`)
      await rename(ministry, ministry.shortName)

      expect(await currentName(ministry)).toBe(ministry.shortName)
      const { rows } = await pool.query<{ held: number }>(
        `select count(*)::int as held from held_short_name where ministry_id = $1`,
        [ministry.id],
      )
      expect(rows[0]!.held).toBe(2)
    })
  })

  it('names nobody by a short name nobody has held', async () => {
    expect(await reader.ministryNamed(shortName(`nobody-${fresh()}`))).toBeNull()
  })
})
