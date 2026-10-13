import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ministryGroupsJoinQrLink, ministryJoinQrLink } from '~/domain/outbound-copy'
import { shortName, type ShortName } from '~/domain/short-name'
import { renderQrCode, renderQrSquare } from '~/platform/qr/qr-code'
import { qrCodeCaption, qrCodeFilename } from '../../app/intake-forms/copy'
import {
  addPersonWithAccount,
  aTestPhoneNumber,
  createMinistryWithAdmin,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'
import { baseUrl, getPage, signIn, signInAs, skipUnlessAppIsRunning } from '../support/app'

/**
 * The Admin's half of the Intake sentence, driven the way an Admin drives it: sign
 * in, open Intake forms from the Account menu, read the links off the page, and
 * then open them the way somebody they were sent to would.
 *
 * Since Pastor feedback ticket 04 the two links are readable -- `/join/<short
 * name>` for the mentor and mentee form and `/join/<short name>/groups` for the
 * groups form -- in one card at the top of the page, with the short name an Admin
 * can change above them and a tile per form below.
 */

describe.skipIf(skipUnlessAppIsRunning)('the readable links an Admin hands out', () => {
  let ministry: MinistryFixture
  let cookie: string
  /** A second Ministry, because one path answers every Admin with their own code. */
  let neighbour: MinistryFixture
  let neighbourCookie: string
  let pool: pg.Pool

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Fairmount Church')
    cookie = (await signIn(ministry)).cookie

    neighbour = await createMinistryWithAdmin('Ridgeway Church')
    neighbourCookie = (await signIn(neighbour)).cookie

    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await pool.end()
  })

  /** A short name no earlier run has used, since every name is held for good. */
  const freshName = (stem: string): string =>
    `${stem}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`

  /** The card as it rendered, rather than the flight payload after it. */
  const asRendered = (html: string) => html.slice(html.indexOf('<main'), html.indexOf('</main>'))

  /** The short name the page shows in its field. */
  const fieldOn = (html: string): string | null => {
    const field = /<input[^>]*id="shortName"[^>]*>/.exec(html)?.[0]
    return field ? (/value="([^"]*)"/.exec(field)?.[1] ?? null) : null
  }

  /** The link a tile shows, tags stripped, as an Admin reads it. */
  const shownLink = (html: string, tile: 'mentor-and-mentee' | 'groups'): string => {
    const code = new RegExp(`<code id="${tile}-link">([\\s\\S]*?)</code>`).exec(html)
    if (!code) throw new Error(`Intake forms showed no ${tile} link`)
    return code[1]!.replace(/<[^>]+>/g, '')
  }

  /**
   * What *Copy link* puts on the clipboard: the whole link, scheme and all, handed
   * to the button in the page's payload.
   */
  const copiedLink = (html: string, name: string): string => {
    const found = new RegExp(`https?://[^"\\\\\\s<]*/join/${name}(?=[\\\\"])`).exec(html)
    if (!found) throw new Error('Intake forms gave Copy link nothing to copy')
    return found[0]
  }

  /** Each square the page draws, as the SVG inside its data URI. */
  const squaresOn = (html: string): string[] =>
    [...html.matchAll(/<img[^>]*class="qr"[^>]*src="data:image\/svg\+xml;charset=utf-8,([^"]+)"/g)].map(
      (match) => decodeURIComponent(match[1]!),
    )

  const pathOf = (link: string): string => {
    const url = new URL(link)
    return `${url.pathname}${url.search}`
  }

  const post = (path: string, as: string, body: Record<string, string>) =>
    fetch(`${baseUrl}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: as, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    })

  const download = (route: string, as: string) =>
    fetch(`${baseUrl}/intake-forms/${route}`, { redirect: 'manual', headers: { cookie: as } })

  const opened = async (path: string) => {
    const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' })
    const location = response.headers.get('location')
    return { status: response.status, location: location ? new URL(location, baseUrl) : null }
  }

  const shortNameOf = async (of: MinistryFixture): Promise<ShortName> => {
    const { rows } = await pool.query<{ short_name: string }>(
      `select short_name from ministry where id = $1`,
      [of.id],
    )
    return shortName(rows[0]!.short_name)
  }

  it('is reached from the Account menu on the screen an Admin is already on', async () => {
    const { html: roster } = await getPage('/roster', cookie)
    expect(roster).toContain('href="/intake-forms"')
    expect(roster).not.toContain('/join/')
  })

  it('is the Admin’s page and not a Leader’s', async () => {
    const leader = await addPersonWithAccount(ministry, 'Dana Whitfield', 'leader', {
      phone: aTestPhoneNumber(),
    })
    const { cookie: leadersCookie } = await signInAs(leader)

    const { html } = await getPage('/intake-forms', leadersCookie)
    expect(html).toContain('This account is not an Admin of a Ministry')
    expect(html).not.toContain(`/join/${ministry.shortName}`)

    const { response } = await getPage('/intake-forms', '')
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login')
  })

  it('shows the short name first, editable, with the address in front of it and Save', async () => {
    const { html } = await getPage('/intake-forms', cookie)
    const card = asRendered(html)

    expect(card).toContain('Your church&#x27;s short name')
    expect(fieldOn(card)).toBe(ministry.shortName)
    expect(card).toMatch(/<span aria-hidden="true">[^<]*\/join\/<\/span>/)
    expect(card).toContain('action="/intake-forms/short-name"')
    // Before both tiles, because both links are built from it.
    expect(card.indexOf('id="shortName"')).toBeLessThan(card.indexOf('Mentor and mentee form'))
  })

  it('shows the two forms as tiles, each with its readable link, Copy link and Download QR code', async () => {
    const { html } = await getPage('/intake-forms', cookie)
    const card = asRendered(html)

    expect(card.indexOf('Mentor and mentee form')).toBeLessThan(card.indexOf('Groups form'))
    expect(shownLink(card, 'mentor-and-mentee')).toMatch(new RegExp(`/join/${ministry.shortName}$`))
    expect(shownLink(card, 'groups')).toMatch(new RegExp(`/join/${ministry.shortName}/groups$`))
    expect(card.match(/>Copy link</g)).toHaveLength(2)
    expect(card.match(/>Download QR code</g)).toHaveLength(2)

    // One card, not today's two, and no helper sentences in it.
    expect(card).not.toContain('The group link')
    expect(card).not.toContain('The discipleship link')
    expect(card).not.toContain('recorded as')
    expect(card).not.toContain(`/intake/${ministry.id}`)

    // Copy link copies the whole link, and not the scanned one: texted from here,
    // `?via=qr` would record a scan nobody made.
    expect(new URL(copiedLink(html, ministry.shortName)).pathname).toBe(`/join/${ministry.shortName}`)
    expect(html).not.toContain(`/join/${ministry.shortName}?via=qr`)
  })

  it('draws each square from the readable link, saying it was scanned', async () => {
    const { html } = await getPage('/intake-forms', cookie)
    const origin = new URL(copiedLink(html, ministry.shortName)).origin
    const name = shortName(ministry.shortName)

    expect(squaresOn(asRendered(html))).toEqual([
      await renderQrSquare(ministryJoinQrLink(origin, name)),
      await renderQrSquare(ministryGroupsJoinQrLink(origin, name)),
    ])
  })

  it('downloads each square captioned and named for its form, encoding the same link', async () => {
    const { html } = await getPage('/intake-forms', cookie)
    const origin = new URL(copiedLink(html, ministry.shortName)).origin
    const name = shortName(ministry.shortName)

    expect(html).toContain('href="/intake-forms/discipleship-code.svg"')
    expect(html).toContain(`download="${qrCodeFilename.mentorAndMentee(name)}"`)
    expect(html).toContain('href="/intake-forms/intake-code.svg"')
    expect(html).toContain(`download="${qrCodeFilename.groups(name)}"`)

    const mentoring = await download('discipleship-code.svg', cookie)
    expect(mentoring.status).toBe(200)
    expect(mentoring.headers.get('content-type')).toContain('image/svg+xml')
    expect(mentoring.headers.get('content-disposition')).toContain(qrCodeFilename.mentorAndMentee(name))
    expect(await mentoring.text()).toBe(
      await renderQrCode(ministryJoinQrLink(origin, name), qrCodeCaption.mentorAndMentee('Fairmount Church')),
    )

    const groups = await download('intake-code.svg', cookie)
    expect(groups.headers.get('content-disposition')).toContain(qrCodeFilename.groups(name))
    expect(await groups.text()).toBe(
      await renderQrCode(ministryGroupsJoinQrLink(origin, name), qrCodeCaption.groups('Fairmount Church')),
    )
  })

  it('draws each Ministry its own code, from the one URL they both request', async () => {
    const mine = await download('intake-code.svg', cookie)
    const theirs = await download('intake-code.svg', neighbourCookie)

    expect(await mine.text()).not.toBe(await theirs.text())
    // One path, two answers: a shared cache holding the first would hand one
    // Ministry's congregation another Ministry's Intake form.
    expect(mine.headers.get('cache-control')).toContain('private')
    expect(mine.headers.get('cache-control')).toContain('no-store')
  })

  it('does not serve a code to somebody with no session', async () => {
    for (const route of ['intake-code.svg', 'discipleship-code.svg']) {
      const response = await download(route, '')
      expect(response.status).not.toBe(200)
      expect(response.headers.get('content-type') ?? '').not.toContain('image/svg+xml')
    }
  })

  it('opens the mentor and mentee form at the short name, and the groups form at /groups', async () => {
    const { html } = await getPage('/intake-forms', cookie)
    const link = copiedLink(html, ministry.shortName)

    const mentoring = await opened(pathOf(link))
    expect(mentoring.status).toBe(307)
    expect(mentoring.location?.pathname).toBe(`/intake/${ministry.id}/discipleship`)

    const groups = await opened(`${pathOf(link)}/groups`)
    expect(groups.status).toBe(307)
    expect(groups.location?.pathname).toBe(`/intake/${ministry.id}`)

    // Followed to the end, each is its form.
    expect(await (await fetch(`${baseUrl}${pathOf(link)}`)).text()).toContain('Join discipleship at')
    expect(await (await fetch(`${baseUrl}${pathOf(link)}/groups`)).text()).toContain('Join a group at')
  })

  it('carries ?via=qr to the form, which records a scan exactly as it did', async () => {
    const scanned = await opened(`/join/${ministry.shortName}/groups?via=qr`)

    expect(scanned.location?.pathname).toBe(`/intake/${ministry.id}`)
    expect(scanned.location?.searchParams.get('via')).toBe('qr')
  })

  it('opens the forms when the link is typed with capitals', async () => {
    const typed = await opened(`/join/${ministry.shortName.toUpperCase()}`)

    expect(typed.status).toBe(307)
    expect(typed.location?.pathname).toBe(`/intake/${ministry.id}/discipleship`)
  })

  it('opens nothing at a short name nobody has held', async () => {
    for (const path of [`/join/${freshName('nobody')}`, `/join/${freshName('nobody')}/groups`, '/join/not%20a%20name']) {
      expect((await opened(path)).status, path).toBe(404)
    }
  })

  it('keeps the older links by Ministry id working', async () => {
    expect((await opened(`/intake/${ministry.id}`)).status).toBe(200)
    expect((await opened(`/intake/${ministry.id}/discipleship`)).status).toBe(200)
  })

  describe('changing the short name', () => {
    it('takes the new one, says so, and builds both links and both codes from it', async () => {
      const renamed = await createMinistryWithAdmin('Wexford Chapel')
      const { cookie: renamedCookie } = await signIn(renamed)
      const wanted = freshName('wexford')

      const saved = await post('/intake-forms/short-name', renamedCookie, { shortName: wanted })
      expect(saved.status).toBe(303)
      expect(new URL(saved.headers.get('location')!).search).toBe('?shortName=saved')

      const { html } = await getPage('/intake-forms?shortName=saved', renamedCookie)
      const card = asRendered(html)
      expect(card).toContain('Saved. Links and QR codes printed with the old name still open your forms.')
      expect(fieldOn(card)).toBe(wanted)
      expect(shownLink(card, 'mentor-and-mentee')).toMatch(new RegExp(`/join/${wanted}$`))
      expect(shownLink(card, 'groups')).toMatch(new RegExp(`/join/${wanted}/groups$`))
      expect(await shortNameOf(renamed)).toBe(wanted)
    })

    it('keeps every name it has had opening its forms, forever', async () => {
      const renamed = await createMinistryWithAdmin('Ashgrove Chapel')
      const { cookie: renamedCookie } = await signIn(renamed)
      const first = renamed.shortName
      const second = freshName('ashgrove')
      const third = freshName('ashgrove-chapel')

      await post('/intake-forms/short-name', renamedCookie, { shortName: second })
      await post('/intake-forms/short-name', renamedCookie, { shortName: third })
      expect(await shortNameOf(renamed)).toBe(third)

      for (const held of [first, second, third]) {
        const scanned = await opened(`/join/${held}/groups?via=qr`)
        expect(scanned.status, held).toBe(307)
        expect(scanned.location?.pathname, held).toBe(`/intake/${renamed.id}`)
      }
    })

    it('records the rename in the Ministry’s history, with who made it', async () => {
      const renamed = await createMinistryWithAdmin('Larchmont Chapel')
      const { cookie: renamedCookie } = await signIn(renamed)
      const wanted = freshName('larchmont')

      await post('/intake-forms/short-name', renamedCookie, { shortName: wanted })

      const { rows } = await pool.query<{ subject_type: string; payload: Record<string, unknown> }>(
        `select subject_type, payload from ministry_event
          where ministry_id = $1 and type = 'ministry.short_name_changed'`,
        [renamed.id],
      )
      expect(rows).toEqual([
        {
          subject_type: 'ministry',
          payload: { changedBy: renamed.adminUserId, from: renamed.shortName, to: wanted },
        },
      ])
    })

    it('refuses a name another church has, saying why, and changes nothing', async () => {
      const refused = await post('/intake-forms/short-name', cookie, { shortName: neighbour.shortName })
      const location = new URL(refused.headers.get('location')!)
      expect(location.searchParams.get('shortNameError')).toBe('short_name.taken')

      const { html } = await getPage(`${location.pathname}${location.search}`, cookie)
      expect(asRendered(html)).toContain('Another church has that short name, or had it once')
      // The name typed is not carried back: the field shows the name that stands.
      expect(fieldOn(asRendered(html))).toBe(ministry.shortName)
      expect(await shortNameOf(ministry)).toBe(ministry.shortName)
    })

    it('refuses a name another church had once, because its printed links still use it', async () => {
      const leaving = await createMinistryWithAdmin('Brookfield Chapel')
      const { cookie: leavingCookie } = await signIn(leaving)
      await post('/intake-forms/short-name', leavingCookie, { shortName: freshName('brookfield') })

      const refused = await post('/intake-forms/short-name', cookie, { shortName: leaving.shortName })
      expect(new URL(refused.headers.get('location')!).searchParams.get('shortNameError')).toBe('short_name.taken')
      expect(await shortNameOf(ministry)).toBe(ministry.shortName)
    })

    it('refuses a name the app’s own routes need, saying why', async () => {
      const refused = await post('/intake-forms/short-name', cookie, { shortName: 'overview' })
      const location = new URL(refused.headers.get('location')!)
      expect(location.searchParams.get('shortNameError')).toBe('short_name.reserved')

      const { html } = await getPage(`${location.pathname}${location.search}`, cookie)
      expect(asRendered(html)).toContain('one of Discipler’s own pages')
    })

    it('refuses a name a link cannot carry plainly, saying why', async () => {
      const refused = await post('/intake-forms/short-name', cookie, { shortName: 'fairmount church' })
      const location = new URL(refused.headers.get('location')!)
      expect(location.searchParams.get('shortNameError')).toBe('short_name.unreadable')

      const { html } = await getPage(`${location.pathname}${location.search}`, cookie)
      expect(asRendered(html)).toContain('only lowercase letters, digits and single dashes')
    })

    it('takes back a name it had before', async () => {
      const returning = await createMinistryWithAdmin('Holloway Chapel')
      const { cookie: returningCookie } = await signIn(returning)
      const original = returning.shortName

      await post('/intake-forms/short-name', returningCookie, { shortName: freshName('holloway') })
      const back = await post('/intake-forms/short-name', returningCookie, { shortName: original })

      expect(new URL(back.headers.get('location')!).search).toBe('?shortName=saved')
      expect(await shortNameOf(returning)).toBe(original)
    })

    it('is an Admin’s to change and nobody else’s', async () => {
      const leader = await addPersonWithAccount(ministry, 'Rowan Price', 'leader', { phone: aTestPhoneNumber() })
      const { cookie: leadersCookie } = await signInAs(leader)

      await post('/intake-forms/short-name', leadersCookie, { shortName: freshName('hijack') })
      await post('/intake-forms/short-name', '', { shortName: freshName('hijack') })

      expect(await shortNameOf(ministry)).toBe(ministry.shortName)
    })
  })
})
