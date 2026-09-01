import { beforeAll, describe, expect, it } from 'vitest'
import { renderQrCode } from '~/platform/qr/qr-code'
import { createMinistryWithAdmin, type MinistryFixture } from '../support/local-supabase'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'

/**
 * The Admin's half of the Intake sentence. Ticket 03 built the form and both routes
 * to it; nothing handed the Admin either one, so the only way to obtain the link was
 * to know the Ministry's identifier and type the URL -- which is not a route a
 * pastor has.
 *
 * Everything here is driven the way an Admin drives it: sign in, open the Roster,
 * read the link off the page, and then open that link the way somebody they sent it
 * to would.
 */

describe.skipIf(skipUnlessAppIsRunning)('the Ministry Intake Link an Admin can send', () => {
  let ministry: MinistryFixture
  let cookie: string
  /** A second Ministry, because one path answers every Admin with their own code. */
  let neighbour: MinistryFixture
  let neighbourCookie: string

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Fairmount Church')
    cookie = (await signIn(ministry)).cookie

    neighbour = await createMinistryWithAdmin('Ridgeway Church')
    neighbourCookie = (await signIn(neighbour)).cookie
  })

  /** The link as the page actually renders it, rather than as this file assumes it. */
  const linkOnThePage = (html: string, of: MinistryFixture): string => {
    const found = new RegExp(`https?://[^"]*/intake/${of.id}`).exec(html)
    if (!found) throw new Error('The Roster did not show this Ministry’s Intake link')
    return found[0]
  }

  /** The same link, opened against the app under test rather than its configured host. */
  const pathOf = (link: string): string => {
    const url = new URL(link)
    return `${url.pathname}${url.search}`
  }

  /** The same link as the code carries it, built once rather than at each use. */
  const scanned = (link: string): string => `${link}?via=qr`

  const qrCode = (as: string) =>
    fetch(`${baseUrl}/roster/intake-code.svg`, { redirect: 'manual', headers: { cookie: as } })

  it('shows the Ministry’s Intake link where an Admin can copy it', async () => {
    const { html } = await getPage('/roster', cookie)
    const link = linkOnThePage(html, ministry)

    // In a field rather than in prose, because the thing an Admin does with it is
    // select the whole of it and paste it into a text message.
    expect(html).toContain(`value="${link}"`)
    expect(link.endsWith(`/intake/${ministry.id}`)).toBe(true)
  })

  it('says which consent each of the two routes records', async () => {
    const { html } = await getPage('/roster', cookie)

    // `consent_record.source` is `pastor_link` or `qr_code` and a compliance review
    // asks which. The Admin choosing between the two is the person deciding it, so
    // the page says so rather than leaving it to be discovered afterwards.
    expect(html).toContain('recorded as sent by a pastor')
    expect(html).toContain('recorded as scanned from a QR code')
  })

  it('renders the QR code, and the code opens the same link saying it was scanned', async () => {
    const { html } = await getPage('/roster', cookie)
    const link = linkOnThePage(html, ministry)

    expect(html).toContain('src="/roster/intake-code.svg"')

    const response = await qrCode(cookie)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('image/svg+xml')

    // The square encodes *this* Ministry's link with `?via=qr` on it. Encoding the
    // plain link would put every scan in the record as though a pastor had sent it.
    expect(await response.text()).toBe(await renderQrCode(scanned(link)))
  })

  it('draws the code on the page big enough to hold a phone up to', async () => {
    const { html } = await getPage('/roster', cookie)

    // The square scales, so the size in the file decides nothing here. What decides
    // whether an Admin can scan their own screen is what the Roster asks for, and
    // that is the half of the criterion a test of the encoder cannot reach.
    const tag = /<img[^>]*class="qr"[^>]*>/.exec(html)
    expect(tag).not.toBeNull()

    const drawn = /width="(\d+)"/.exec(tag![0])
    expect(drawn).not.toBeNull()
    expect(Number(drawn![1])).toBeGreaterThanOrEqual(320)
  })

  it('does not offer the code’s own link as a second thing to send', async () => {
    const { html } = await getPage('/roster', cookie)

    // A field holding `?via=qr` would be texted, and every Person who followed it
    // would be recorded as having scanned a code nobody printed -- which is the one
    // distinction the panel above it exists to keep honest.
    expect(html).not.toContain(`value="${scanned(linkOnThePage(html, ministry))}"`)
  })

  it('offers the code on its own, so it can be printed or saved', async () => {
    const { html } = await getPage('/roster', cookie)
    expect(html).toContain('href="/roster/intake-code.svg"')

    const response = await qrCode(cookie)

    // Named on the way out, because the Admin saving it is going to look for it
    // again in a folder of downloads, and it scales because it is going on paper.
    expect(response.headers.get('content-disposition')).toContain('intake-qr-code.svg')
    expect(await response.text()).toContain('viewBox')
  })

  it('draws each Ministry its own code, from the one URL they both request', async () => {
    const mine = await qrCode(cookie)
    const theirs = await qrCode(neighbourCookie)

    expect(await mine.text()).not.toBe(await theirs.text())

    // One path, two answers: a shared cache holding the first would hand one
    // Ministry's congregation another Ministry's Intake form.
    expect(mine.headers.get('cache-control')).toContain('private')
    expect(mine.headers.get('cache-control')).toContain('no-store')
  })

  it('is not served to somebody with no session', async () => {
    const response = await fetch(`${baseUrl}/roster/intake-code.svg`, { redirect: 'manual' })

    expect(response.status).not.toBe(200)
    expect(response.headers.get('content-type') ?? '').not.toContain('image/svg+xml')
  })

  it('hands the Admin a link that actually opens their Ministry’s form', async () => {
    const { html } = await getPage('/roster', cookie)
    const link = linkOnThePage(html, ministry)

    // The point of the ticket, asserted end to end: what the page hands over is not
    // merely well-formed, it is the form.
    const sent = await fetch(`${baseUrl}${pathOf(link)}`, { redirect: 'manual' })
    expect(sent.status).toBe(200)

    const form = await sent.text()
    // Two assertions rather than one sentence: React puts a comment between the
    // static half of a heading and the interpolated half, so the Ministry's name and
    // the words in front of it are not adjacent in the markup.
    expect(form).toContain('Join discipleship at')
    expect(form).toContain('Fairmount Church')
    expect(form).toContain(`action="/intake/${ministry.id}/submit"`)

    const fromTheCode = await fetch(`${baseUrl}${pathOf(scanned(link))}`, { redirect: 'manual' })
    expect(fromTheCode.status).toBe(200)
    // What the form will submit, and therefore what the consent record will say.
    expect(await fromTheCode.text()).toContain('value="qr"')
  })
})
