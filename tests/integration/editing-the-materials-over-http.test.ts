import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { days } from '~/domain/clock'
import {
  addPersonWithAccount,
  assignMaterial,
  createMinistryWithAdmin,
  localSupabase,
  pairOneToOne,
  serviceRoleClient,
  type AccountFixture,
  type MinistryFixture,
} from '../support/local-supabase'
import { baseUrl, getPage, signIn, signInAs, skipUnlessAppIsRunning } from '../support/app'

/**
 * Creating, editing and removing a Material, driven the way an Admin drives it
 * (`.scratch/materials/spec.md`, ticket 02): the New material button on the tab,
 * the create page, the Edit link on a folder, the edit page with its PDF row and
 * its Remove card, and the two presses a removal takes.
 *
 * The PDF is the reason this suite drives the app rather than the boundary. The
 * file goes to the bucket from the route under the Admin's own session, a
 * refused command deletes what it just uploaded, a replacement deletes the old
 * object once the edit lands -- and a small PDF uploaded here has to come back
 * down from the Leader dashboard, which is the whole reason it was uploaded.
 */

describe.skipIf(skipUnlessAppIsRunning)('creating, editing and removing a Material', () => {
  let ministry: MinistryFixture
  let cookie: string
  let pool: pg.Pool

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    cookie = (await signIn(ministry)).cookie
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await pool.end()
  })

  /** A small, real-enough PDF: what the route checks is the type and the size. */
  const aPdf = (name: string, bytes = '%PDF-1.4 a study guide') =>
    new File([bytes], name, { type: 'application/pdf' })

  /**
   * A multipart POST, as the form on the page sends one. Every field is a
   * string except the file, which is a `File` or left out.
   */
  const post = async (path: string, fields: Record<string, string | File>, as: string = cookie) => {
    const body = new FormData()
    for (const [name, value] of Object.entries(fields)) body.append(name, value)
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: as },
      body,
    })
    return { response, location: response.headers.get('location') ?? '' }
  }

  /** The page as an Admin sees it, without the flight payload after it. */
  const asRendered = (html: string) => html.slice(html.indexOf('<main'), html.indexOf('</main>'))

  const materialCalled = async (title: string) => {
    const { rows } = await pool.query<{
      id: string
      body: string | null
      pdf_path: string | null
      pdf_filename: string | null
      removed: Date | null
    }>(
      `select id, body, pdf_path, pdf_filename, removed from material where ministry_id = $1 and title = $2`,
      [ministry.id, title],
    )
    const row = rows[0]
    if (!row) throw new Error(`This Ministry holds no Material called ${title}`)
    return row
  }

  /** The keys in the Ministry's folder of the bucket, so an orphan is visible. */
  const objectsInTheBucket = async () => {
    const { data, error } = await serviceRoleClient().storage.from('material').list(ministry.id)
    if (error) throw new Error(error.message)
    return (data ?? []).map((object) => `${ministry.id}/${object.name}`)
  }

  it('offers the New material button on the tab and the Edit link on a folder', async () => {
    const tab = await getPage('/materials', cookie)
    expect(asRendered(tab.html)).toContain('href="/materials/new"')
    expect(asRendered(tab.html)).toContain('New material')

    const page = await getPage('/materials/new', cookie)
    expect(page.response.status).toBe(200)
    const rendered = asRendered(page.html)
    expect(rendered).toContain('</svg>Materials</a>')
    expect(rendered).toContain('New material')
    expect(rendered).toContain('Shown to the leader as written, line breaks kept.')
    expect(rendered).toContain('PDF only, up to 20 MB. The leader downloads it from their dashboard.')
    expect(rendered).toContain('Create material')
    expect(rendered).toContain('href="/materials"')
    // No message on the page by default.
    expect(rendered).not.toContain('role="alert"')
  })

  it('creates a Material with text only, and lands on its folder', async () => {
    const { response, location } = await post('/materials/create', {
      title: 'Gospel of Mark reading plan',
      body: 'Week 1: Mark 1-2.\nWeek 2: Mark 3-4.',
      pdf: new File([], '', { type: 'application/octet-stream' }),
    })
    expect(response.status).toBe(303)

    const mark = await materialCalled('Gospel of Mark reading plan')
    expect(mark).toMatchObject({ body: 'Week 1: Mark 1-2.\nWeek 2: Mark 3-4.', pdf_path: null, pdf_filename: null })
    expect(new URL(location).pathname).toBe(`/materials/${mark.id}`)

    const folder = await getPage(`/materials/${mark.id}`, cookie)
    expect(folder.response.status).toBe(200)
    expect(asRendered(folder.html)).toContain('Gospel of Mark reading plan')
    expect(asRendered(folder.html)).toContain(`href="/materials/${mark.id}/edit"`)
    expect(asRendered(folder.html)).toContain('Edit this material')
  })

  it('creates a Material with a PDF only, stored under the Ministry’s folder', async () => {
    const before = await objectsInTheBucket()
    await post('/materials/create', { title: 'Galatians', body: '', pdf: aPdf('galatians.pdf') })

    const galatians = await materialCalled('Galatians')
    expect(galatians.body).toBeNull()
    expect(galatians.pdf_filename).toBe('galatians.pdf')
    expect(galatians.pdf_path).toMatch(new RegExp(`^${ministry.id}/[0-9a-f-]{36}\\.pdf$`))
    const after = await objectsInTheBucket()
    expect(after).toContain(galatians.pdf_path)
    expect(after).toHaveLength(before.length + 1)
  })

  it('creates a Material with both, and shows the PDF’s name and size on its edit page', async () => {
    await post('/materials/create', {
      title: 'Philippians, weeks 1-4',
      body: 'Four weeks, one chapter each.',
      pdf: aPdf('philippians.pdf', '%PDF-1.4 '.padEnd(2048, 'x')),
    })
    const philippians = await materialCalled('Philippians, weeks 1-4')
    expect(philippians).toMatchObject({ body: 'Four weeks, one chapter each.', pdf_filename: 'philippians.pdf' })

    const edit = await getPage(`/materials/${philippians.id}/edit`, cookie)
    expect(edit.response.status).toBe(200)
    const rendered = asRendered(edit.html)
    expect(rendered).toContain('Edit this material')
    expect(rendered).toContain('value="Philippians, weeks 1-4"')
    expect(rendered).toContain('Four weeks, one chapter each.')
    expect(rendered).toContain('<span class="name">philippians.pdf</span>')
    expect(rendered).toContain('2 KB')
    expect(rendered).toContain('Remove the PDF')
    expect(rendered).toContain('Replace it')
    expect(rendered).toContain('Save changes')
    expect(rendered).toContain(`</svg>Philippians, weeks 1-4</a>`)
    expect(rendered).toContain(`href="/materials/${philippians.id}"`)
    // Nobody is on it: the Remove button is live and the notice is absent.
    expect(rendered).toContain('Remove this material')
    expect(rendered).not.toContain('working through it. Move')
    expect(rendered).not.toContain('disabled')
  })

  it('refuses a Material with neither text nor PDF, with the toast and the title kept', async () => {
    const { location } = await post('/materials/create', { title: 'Empty study', body: '   ' })
    const back = new URL(location)
    expect(back.pathname).toBe('/materials/new')
    expect(back.searchParams.get('error')).toBe('material.needs_content')
    expect(back.searchParams.get('title')).toBe('Empty study')

    const { html } = await getPage(`${back.pathname}${back.search}`, cookie)
    const rendered = asRendered(html)
    expect(rendered).toContain('role="alert"')
    expect(rendered).toContain('A material needs text, a PDF, or both.')
    expect(rendered).toContain('value="Empty study"')
    await expect(materialCalled('Empty study')).rejects.toThrow()
  })

  it('refuses a file that is not a PDF before storage is touched', async () => {
    const before = await objectsInTheBucket()
    const { location } = await post('/materials/create', {
      title: 'A picture',
      body: '',
      pdf: new File(['not a pdf'], 'cover.png', { type: 'image/png' }),
    })
    expect(new URL(location).searchParams.get('error')).toBe('material.pdf_only')
    expect(await objectsInTheBucket()).toEqual(before)
    const { html } = await getPage(location.slice(location.indexOf('/materials')), cookie)
    expect(asRendered(html)).toContain('Only a PDF can be attached.')
  })

  it('deletes the object it uploaded when the command refuses', async () => {
    const before = await objectsInTheBucket()
    // A title the Ministry already holds, with a PDF alongside: uploaded, then
    // refused, then deleted.
    const { location } = await post('/materials/create', { title: 'galatians', body: '', pdf: aPdf('again.pdf') })
    expect(new URL(location).searchParams.get('error')).toBe('material.title_taken')
    expect(await objectsInTheBucket()).toEqual(before)
    const { html } = await getPage(location.slice(location.indexOf('/materials')), cookie)
    expect(asRendered(html)).toContain('This ministry already has a material with that title.')
  })

  it('edits the title and the text in place', async () => {
    const mark = await materialCalled('Gospel of Mark reading plan')
    const { location } = await post(`/materials/${mark.id}/save`, {
      title: 'Mark, a reading plan',
      body: 'Week 1: Mark 1-3.',
    })
    expect(new URL(location).pathname).toBe(`/materials/${mark.id}`)
    expect(await materialCalled('Mark, a reading plan')).toMatchObject({ id: mark.id, body: 'Week 1: Mark 1-3.' })
  })

  it('replaces the PDF, deleting the old object once the edit has landed', async () => {
    const galatians = await materialCalled('Galatians')
    const oldPath = galatians.pdf_path!
    await post(`/materials/${galatians.id}/save`, { title: 'Galatians', body: '', pdf: aPdf('galatians-2nd.pdf', '%PDF-1.4 second edition') })

    const replaced = await materialCalled('Galatians')
    expect(replaced.pdf_filename).toBe('galatians-2nd.pdf')
    expect(replaced.pdf_path).not.toBe(oldPath)
    const objects = await objectsInTheBucket()
    expect(objects).toContain(replaced.pdf_path)
    expect(objects).not.toContain(oldPath)
  })

  it('refuses to remove the PDF from a Material with no text, and deletes nothing', async () => {
    const galatians = await materialCalled('Galatians')
    const { location } = await post(`/materials/${galatians.id}/save`, { title: 'Galatians', body: '', removePdf: 'yes' })
    const back = new URL(location)
    expect(back.pathname).toBe(`/materials/${galatians.id}/edit`)
    expect(back.searchParams.get('error')).toBe('material.needs_content')

    const { html } = await getPage(`${back.pathname}${back.search}`, cookie)
    expect(asRendered(html)).toContain('A material needs text, a PDF, or both.')
    expect((await materialCalled('Galatians')).pdf_path).toBe(galatians.pdf_path)
    expect(await objectsInTheBucket()).toContain(galatians.pdf_path)
  })

  it('removes the PDF from a Material with text, deleting the object after the edit', async () => {
    const philippians = await materialCalled('Philippians, weeks 1-4')
    await post(`/materials/${philippians.id}/save`, {
      title: 'Philippians, weeks 1-4',
      body: 'Four weeks, one chapter each.',
      removePdf: 'yes',
    })
    expect(await materialCalled('Philippians, weeks 1-4')).toMatchObject({ pdf_path: null, pdf_filename: null })
    expect(await objectsInTheBucket()).not.toContain(philippians.pdf_path)

    const edit = await getPage(`/materials/${philippians.id}/edit`, cookie)
    expect(asRendered(edit.html)).not.toContain('pdf-row')
    expect(asRendered(edit.html)).toContain('PDF only, up to 20 MB.')
  })

  describe('with a Leader working through one', () => {
    let leader: AccountFixture
    let relationship: string
    let galatians: Awaited<ReturnType<typeof materialCalled>>

    beforeAll(async () => {
      leader = await addPersonWithAccount(ministry, 'Karen Whitfield', 'leader')
      const ada = await addPersonWithAccount(ministry, 'Ada Rowe', 'leader')
      const acceptedAt = new Date(Date.now() - days(14))
      relationship = await pairOneToOne(ministry, leader.personId, ada.personId, { acceptedAt })
      galatians = await materialCalled('Galatians')
      await assignMaterial(relationship, galatians.id, ministry.adminUserId, new Date(Date.now() - days(7)))
    })

    it('shows the notice with the count and a disabled Remove, and refuses the removal', async () => {
      const edit = await getPage(`/materials/${galatians.id}/edit`, cookie)
      const rendered = asRendered(edit.html)
      expect(rendered).toContain('1 relationship is working through it. Move it to another material, or to none, before removing it.')
      expect(rendered).toMatch(/<button[^>]*disabled[^>]*>Remove<\/button>/)

      // Even a form that says it is confirmed: the boundary refuses it.
      const { location } = await post(`/materials/${galatians.id}/remove`, { confirm: 'yes' })
      expect(new URL(location).searchParams.get('error')).toBe('material.in_use')
      expect((await materialCalled('Galatians')).removed).toBeNull()
    })

    it('hands the PDF uploaded here down to the Leader from their dashboard', async () => {
      const karen = (await signInAs({ phone: leader.phone, password: leader.password })).cookie
      const dashboard = await getPage('/relationships', karen)
      expect(dashboard.response.status).toBe(200)
      expect(dashboard.html).toContain('Galatians')

      // The signed link the page minted, exactly as the markup carries it.
      const link = /href="([^"]*\/storage\/v1\/object\/sign\/material\/[^"]*)"/.exec(dashboard.html)?.[1]
      expect(link, 'a signed link to the PDF').toBeDefined()
      const download = await fetch(link!.replaceAll('&amp;', '&'))
      expect(download.status).toBe(200)
      expect(await download.text()).toBe('%PDF-1.4 second edition')
      expect(dashboard.html).toContain('galatians-2nd.pdf')
    })

    it('shows the Leader an edit on their next load, with no change to the dashboard’s code', async () => {
      await post(`/materials/${galatians.id}/save`, { title: 'Galatians, weeks 1-5', body: 'Bring one question.' })
      const karen = (await signInAs({ phone: leader.phone, password: leader.password })).cookie
      const dashboard = await getPage('/relationships', karen)
      expect(dashboard.html).toContain('Galatians, weeks 1-5')
      expect(dashboard.html).toContain('Bring one question.')
    })

    it('removes it once the relationship has moved on to another', async () => {
      const philippians = await materialCalled('Philippians, weeks 1-4')
      await assignMaterial(relationship, philippians.id, ministry.adminUserId)

      const { location } = await post(`/materials/${galatians.id}/remove`, { confirm: 'yes' })
      expect(new URL(location).pathname).toBe('/materials')
      expect((await materialCalled('Galatians, weeks 1-5')).removed).toBeInstanceOf(Date)

      // Gone from the tab; the relationship's folder is Philippians' now.
      const tab = await getPage('/materials', cookie)
      expect(asRendered(tab.html)).not.toContain('Galatians, weeks 1-5')
      const folder = await getPage(`/materials/${philippians.id}`, cookie)
      expect(asRendered(folder.html)).toContain(leader.fullName)
    })
  })

  it('reopens the edit page with the confirmation open, and removes only from inside it', async () => {
    const mark = await materialCalled('Mark, a reading plan')

    // The first press: the page, with the question open, and nothing removed.
    const first = await post(`/materials/${mark.id}/remove`, {})
    const back = new URL(first.location)
    expect(back.pathname).toBe(`/materials/${mark.id}/edit`)
    expect(back.searchParams.get('removing')).toBe('yes')
    expect((await materialCalled('Mark, a reading plan')).removed).toBeNull()

    const { html } = await getPage(`${back.pathname}${back.search}`, cookie)
    const rendered = asRendered(html)
    expect(rendered).toContain('Remove “Mark, a reading plan”?')
    expect(rendered).toContain('Yes, remove “Mark, a reading plan”')
    expect(rendered).toContain('Keep it')

    // The second press, from inside the confirmation.
    const second = await post(`/materials/${mark.id}/remove`, { confirm: 'yes' })
    expect(new URL(second.location).pathname).toBe('/materials')
    expect((await materialCalled('Mark, a reading plan')).removed).toBeInstanceOf(Date)

    // Off the tab, and its folder and edit page are no longer pages.
    const tab = await getPage('/materials', cookie)
    expect(asRendered(tab.html)).not.toContain('Mark, a reading plan')
    expect((await getPage(`/materials/${mark.id}`, cookie)).response.status).toBe(404)
    expect((await getPage(`/materials/${mark.id}/edit`, cookie)).response.status).toBe(404)
    expect((await post(`/materials/${mark.id}/save`, { title: 'Mark', body: 'Text.' })).location).toContain('error=material.not_on_the_list')
  })

  it('says nothing at all about a refusal it does not recognise', async () => {
    const { html } = await getPage(`/materials/new?error=${encodeURIComponent('<b>anything at all</b>')}`, cookie)
    expect(asRendered(html)).not.toContain('anything at all')
    expect(asRendered(html)).not.toContain('role="alert"')
    for (const code of ['__proto__', 'toString', 'valueOf', 'constructor']) {
      const { response } = await getPage(`/materials/new?error=${code}`, cookie)
      expect(response.status).toBe(200)
    }
  })

  it('turns a visitor with no session away from every page and every route', async () => {
    const philippians = await materialCalled('Philippians, weeks 1-4')
    for (const path of ['/materials/new', `/materials/${philippians.id}/edit`]) {
      const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' })
      expect(response.status, path).toBe(307)
      expect(response.headers.get('location'), path).toContain('/login')
    }
    for (const path of ['/materials/create', `/materials/${philippians.id}/save`, `/materials/${philippians.id}/remove`]) {
      const { response, location } = await post(path, { title: 'Nothing', body: 'Nothing', confirm: 'yes' }, '')
      expect(response.status, path).toBe(303)
      expect(new URL(location).pathname, path).toBe('/materials')
    }
    expect((await materialCalled('Philippians, weeks 1-4')).removed).toBeNull()
    await expect(materialCalled('Nothing')).rejects.toThrow()
  })
})
