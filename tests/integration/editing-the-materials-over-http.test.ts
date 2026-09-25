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
 * (`.scratch/materials/spec.md`, ticket 02, and Richer materials, ticket 01):
 * the New material button on the tab, the create page, the Edit link on a
 * folder, the edit page with its files and links and its Remove card, and the
 * two presses a removal takes.
 *
 * The files are the reason this suite drives the app rather than the boundary.
 * The browser asks the app for an upload address, sends the bytes straight to
 * Storage under it, and posts the path with the form; the route reads back what
 * Storage holds; a refusal over the files deletes them and any other refusal
 * keeps them; a removed file's object is deleted once the edit lands -- and a
 * file uploaded here has to come back down from the Leader dashboard, which is
 * the whole reason it was uploaded. This suite does what the page's script does,
 * step for step.
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

  /** Asks the app where to send a file, as the page does the moment one is chosen. */
  const askToUpload = async (filename: string, bytes: number, as: string = cookie) => {
    const response = await fetch(`${baseUrl}/materials/uploads`, {
      method: 'POST',
      headers: { cookie: as, 'content-type': 'application/json' },
      body: JSON.stringify({ filename, bytes }),
    })
    return { response, answer: (await response.json()) as Record<string, string> }
  }

  /**
   * One file, uploaded the way the page uploads it: an address from the app,
   * then a PUT of the whole file straight to Storage under the type the app
   * named. Answers the hidden field the page would then post.
   */
  const upload = async (filename: string, content: string | Uint8Array = '%PDF-1.4 a study guide') => {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content
    const { response, answer } = await askToUpload(filename, bytes.byteLength)
    expect(response.status, JSON.stringify(answer)).toBe(200)
    const put = await fetch(answer.url!, {
      method: 'PUT',
      headers: { 'content-type': answer.contentType!, 'x-upsert': 'false' },
      body: new Blob([bytes as Uint8Array<ArrayBuffer>]),
    })
    expect(put.status, await put.clone().text()).toBe(200)
    return { path: answer.path!, field: JSON.stringify({ path: answer.path, filename }) }
  }

  /** A form POST, as the page sends one. Repeated fields repeat. */
  const post = async (
    path: string,
    fields: Record<string, string | readonly string[]>,
    as: string = cookie,
  ) => {
    const body = new URLSearchParams()
    for (const [name, value] of Object.entries(fields)) {
      for (const each of typeof value === 'string' ? [value] : value) body.append(name, each)
    }
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: as, 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    return { response, location: response.headers.get('location') ?? '' }
  }

  /** The page as an Admin sees it, without the flight payload after it. */
  const asRendered = (html: string) => html.slice(html.indexOf('<main'), html.indexOf('</main>'))

  const materialCalled = async (title: string) => {
    const { rows } = await pool.query<{ id: string; body: string | null; removed: Date | null }>(
      `select id, body, removed from material where ministry_id = $1 and title = $2`,
      [ministry.id, title],
    )
    const row = rows[0]
    if (!row) throw new Error(`This Ministry holds no Material called ${title}`)
    return row
  }

  const itemsOf = async (material: string) => {
    const { rows } = await pool.query<{
      id: string
      kind: string
      path: string | null
      filename: string | null
      content_type: string | null
      bytes: string | null
      url: string | null
      label: string | null
    }>(`select * from material_item where material_id = $1 order by position`, [material])
    return rows
  }

  /** The keys in the Ministry's folder of the bucket, so an orphan is visible. */
  const objectsInTheBucket = async () => {
    const { data, error } = await serviceRoleClient().storage.from('material').list(ministry.id)
    if (error) throw new Error(error.message)
    return (data ?? []).map((object) => `${ministry.id}/${object.name}`)
  }

  it('offers the New material button on the tab, and a page with files and links and no hint under the text', async () => {
    const tab = await getPage('/materials', cookie)
    expect(asRendered(tab.html)).toContain('href="/materials/new"')
    expect(asRendered(tab.html)).toContain('New material')

    const page = await getPage('/materials/new', cookie)
    expect(page.response.status).toBe(200)
    const rendered = asRendered(page.html)
    expect(rendered).toContain('</svg>Materials</a>')
    expect(rendered).toContain('Give it a title and some text, files or links. Once it is assigned, Leaders see it on their dashboard and Disciples on a page their text links to.')
    expect(rendered).toContain('Files and links')
    expect(rendered).toContain('Add files')
    expect(rendered).toContain('Add a link')
    expect(rendered).toContain('name="linkUrl"')
    expect(rendered).toContain('Create material')
    // James, 2026-09-24: the line under the text box goes.
    expect(rendered).not.toContain('line breaks kept')
    expect(rendered).not.toContain('PDF only')
    // No message on the page by default.
    expect(rendered).not.toContain('role="alert"')
  })

  it('creates a Material with text only, and lands on its folder', async () => {
    const { response, location } = await post('/materials/create', {
      title: 'Gospel of Mark reading plan',
      body: 'Week 1: Mark 1-2.\nWeek 2: Mark 3-4.',
    })
    expect(response.status).toBe(303)

    const mark = await materialCalled('Gospel of Mark reading plan')
    expect(mark).toMatchObject({ body: 'Week 1: Mark 1-2.\nWeek 2: Mark 3-4.' })
    expect(await itemsOf(mark.id)).toEqual([])
    expect(new URL(location).pathname).toBe(`/materials/${mark.id}`)

    const folder = await getPage(`/materials/${mark.id}`, cookie)
    expect(folder.response.status).toBe(200)
    expect(asRendered(folder.html)).toContain(`href="/materials/${mark.id}/edit"`)
  })

  it('creates a Material that is a link only', async () => {
    await post('/materials/create', {
      title: 'Mark, the overview',
      body: '',
      linkUrl: ' https://bibleproject.com/explore/video/mark/ ',
      linkLabel: '',
    })
    const overview = await materialCalled('Mark, the overview')
    expect(await itemsOf(overview.id)).toEqual([
      expect.objectContaining({ kind: 'link', url: 'https://bibleproject.com/explore/video/mark/', label: null }),
    ])
  })

  it('creates a Material with a file only, read back from Storage and kept under the Ministry’s folder', async () => {
    const before = await objectsInTheBucket()
    const guide = await upload('galatians.pdf')
    await post('/materials/create', { title: 'Galatians', body: '', upload: guide.field })

    const galatians = await materialCalled('Galatians')
    expect(galatians.body).toBeNull()
    const [item] = await itemsOf(galatians.id)
    expect(item).toMatchObject({
      kind: 'file',
      path: guide.path,
      filename: 'galatians.pdf',
      content_type: 'application/pdf',
      bytes: String('%PDF-1.4 a study guide'.length),
    })
    expect(guide.path).toMatch(new RegExp(`^${ministry.id}/[0-9a-f-]{36}\\.pdf$`))
    const after = await objectsInTheBucket()
    expect(after).toContain(guide.path)
    expect(after).toHaveLength(before.length + 1)
  })

  it('creates one with several files of different types and a link, in order, and lists them on its edit page', async () => {
    const guide = await upload('Philippians guide.pdf', '%PDF-1.4 '.padEnd(2048, 'x'))
    const questions = await upload('Week 1 questions.docx', 'PK a word document')
    // Larger than a hosted function will take as a request body, which is the
    // file that could not be saved before the upload went straight to Storage.
    const video = await upload('Session 1.mp4', new Uint8Array(5 * 1024 * 1024).fill(7))
    await post('/materials/create', {
      title: 'Philippians, weeks 1-4',
      body: 'Four weeks, one chapter each. The plan is at https://bible.com/plans/philippians',
      upload: [guide.field, questions.field, video.field],
      linkUrl: 'https://www.youtube.com/watch?v=oE9qqW1-BkU',
      linkLabel: 'Philippians overview',
    })
    const philippians = await materialCalled('Philippians, weeks 1-4')
    expect((await itemsOf(philippians.id)).map((item) => [item.kind, item.filename ?? item.label])).toEqual([
      ['file', 'Philippians guide.pdf'],
      ['file', 'Week 1 questions.docx'],
      ['file', 'Session 1.mp4'],
      ['link', 'Philippians overview'],
    ])
    expect((await itemsOf(philippians.id))[2]).toMatchObject({
      content_type: 'video/mp4',
      bytes: String(5 * 1024 * 1024),
    })

    const edit = await getPage(`/materials/${philippians.id}/edit`, cookie)
    expect(edit.response.status).toBe(200)
    const rendered = asRendered(edit.html)
    expect(rendered).toContain('value="Philippians, weeks 1-4"')
    expect(rendered).toContain('Philippians guide.pdf')
    expect(rendered).toContain('2 KB')
    expect(rendered).toContain('Word document')
    expect(rendered).toContain('5.0 MB')
    expect(rendered).toContain('youtube.com/watch?v=oE9qqW1-BkU')
    expect(rendered.match(/name="removeItem"/g)).toHaveLength(4)
    expect(rendered).toContain('Save changes')
    // Nobody is on it: the Remove button is live and the notice is absent.
    expect(rendered).toContain('Remove this material')
    expect(rendered).not.toContain('working through it. Move')
  })

  it('refuses a file of another type, or too large, before any upload address is given', async () => {
    const exe = await askToUpload('setup.exe', 10)
    expect(exe.response.status).toBe(400)
    expect(exe.answer.refused).toBe('setup.exe is not a type a material can hold.')

    const huge = await askToUpload('whole-series.mp4', 51 * 1024 * 1024)
    expect(huge.response.status).toBe(400)
    expect(huge.answer.refused).toBe('whole-series.mp4 is larger than 50 MB.')

    const nobody = await askToUpload('guide.pdf', 10, '')
    expect(nobody.response.status).toBe(403)
  })

  it('lets the bucket itself refuse a type that is not on the list, whatever address it was sent to', async () => {
    const { answer } = await askToUpload('looks-like.pdf', 10)
    const put = await fetch(answer.url!, {
      method: 'PUT',
      headers: { 'content-type': 'application/x-msdownload', 'x-upsert': 'false' },
      body: 'MZ an executable',
    })
    expect(put.ok).toBe(false)
    expect(await objectsInTheBucket()).not.toContain(answer.path)
  })

  it('refuses a Material with nothing, with the toast and the title kept', async () => {
    const { location } = await post('/materials/create', { title: 'Empty study', body: '   ' })
    const back = new URL(location)
    expect(back.pathname).toBe('/materials/new')
    expect(back.searchParams.get('error')).toBe('material.needs_content')
    expect(back.searchParams.get('title')).toBe('Empty study')

    const { html } = await getPage(`${back.pathname}${back.search}`, cookie)
    const rendered = asRendered(html)
    expect(rendered).toContain('role="alert"')
    expect(rendered).toContain('A material needs text, a file or a link.')
    expect(rendered).toContain('value="Empty study"')
    await expect(materialCalled('Empty study')).rejects.toThrow()
  })

  it('refuses a link that is not a web address, keeping what was typed', async () => {
    const { location } = await post('/materials/create', {
      title: 'A study',
      body: 'Text.',
      linkUrl: 'www.example.org',
      linkLabel: 'Example',
    })
    const back = new URL(location)
    expect(back.searchParams.get('error')).toBe('material.link_unreadable')
    const { html } = await getPage(`${back.pathname}${back.search}`, cookie)
    expect(asRendered(html)).toContain('The link needs to be a full web address, starting https://')
    expect(asRendered(html)).toContain('value="www.example.org"')
    await expect(materialCalled('A study')).rejects.toThrow()
  })

  it('keeps an upload across a refusal over the title, and names it again on the page', async () => {
    const again = await upload('again.pdf')
    const { location } = await post('/materials/create', { title: 'galatians', body: '', upload: again.field })
    const back = new URL(location)
    expect(back.searchParams.get('error')).toBe('material.title_taken')
    expect(await objectsInTheBucket()).toContain(again.path)

    const { html } = await getPage(`${back.pathname}${back.search}`, cookie)
    const rendered = asRendered(html)
    expect(rendered).toContain('This ministry already has a material with that title.')
    expect(rendered).toContain('again.pdf')
    expect(rendered).toContain('name="upload"')

    // And the same upload saves under a free title, with nothing uploaded twice.
    await post('/materials/create', { title: 'Galatians, a second look', body: '', upload: again.field })
    expect((await itemsOf((await materialCalled('Galatians, a second look')).id))[0]?.path).toBe(again.path)
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

  it('removes the file ticked and adds a new one after the rest, deleting the old object once the edit has landed', async () => {
    const galatians = await materialCalled('Galatians')
    const [old] = await itemsOf(galatians.id)
    const second = await upload('galatians-2nd.pdf', '%PDF-1.4 second edition')
    await post(`/materials/${galatians.id}/save`, {
      title: 'Galatians',
      body: '',
      removeItem: old!.id,
      upload: second.field,
    })

    const items = await itemsOf(galatians.id)
    expect(items.map((item) => item.filename)).toEqual(['galatians-2nd.pdf'])
    const objects = await objectsInTheBucket()
    expect(objects).toContain(second.path)
    expect(objects).not.toContain(old!.path)
  })

  it('refuses to take the last item off a Material with no text, and deletes nothing', async () => {
    const galatians = await materialCalled('Galatians')
    const [only] = await itemsOf(galatians.id)
    const { location } = await post(`/materials/${galatians.id}/save`, {
      title: 'Galatians',
      body: '',
      removeItem: only!.id,
    })
    const back = new URL(location)
    expect(back.pathname).toBe(`/materials/${galatians.id}/edit`)
    expect(back.searchParams.get('error')).toBe('material.needs_content')

    const { html } = await getPage(`${back.pathname}${back.search}`, cookie)
    expect(asRendered(html)).toContain('A material needs text, a file or a link.')
    // The box the Admin ticked is still ticked on the page they come back to.
    expect(asRendered(html)).toMatch(
      new RegExp(`value="${only!.id}"[^>]*checked|checked[^>]*value="${only!.id}"`),
    )
    expect(await itemsOf(galatians.id)).toHaveLength(1)
    expect(await objectsInTheBucket()).toContain(only!.path)
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
      expect(rendered).toContain(
        '1 relationship is working through it. Move it to another material, or to none, before removing it.',
      )
      expect(rendered).toMatch(/<button[^>]*disabled[^>]*>Remove<\/button>/)

      // Even a form that says it is confirmed: the boundary refuses it.
      const { location } = await post(`/materials/${galatians.id}/remove`, { confirm: 'yes' })
      expect(new URL(location).searchParams.get('error')).toBe('material.in_use')
      expect((await materialCalled('Galatians')).removed).toBeNull()
    })

    it('hands the file uploaded here down to the Leader from their dashboard, under its own name', async () => {
      const karen = (await signInAs({ phone: leader.phone, password: leader.password })).cookie
      const dashboard = await getPage('/relationships', karen)
      expect(dashboard.response.status).toBe(200)
      expect(dashboard.html).toContain('Galatians')
      expect(dashboard.html).toContain('galatians-2nd.pdf')
      expect(dashboard.html).toContain('PDF · 1 KB')

      // The signed link the page minted, exactly as the markup carries it.
      const link = /href="([^"]*\/storage\/v1\/object\/sign\/material\/[^"]*)"/.exec(dashboard.html)?.[1]
      expect(link, 'a signed link to the file').toBeDefined()
      const download = await fetch(link!.replaceAll('&amp;', '&'))
      expect(download.status).toBe(200)
      expect(await download.text()).toBe('%PDF-1.4 second edition')
      expect(download.headers.get('content-disposition')).toContain('galatians-2nd.pdf')
    })

    it('shows the Leader an edit on their next load: the text with its address a link, and a link item opening elsewhere', async () => {
      await post(`/materials/${galatians.id}/save`, {
        title: 'Galatians, weeks 1-5',
        body: 'Bring one question. Notes at https://example.org/galatians.',
        linkUrl: 'https://bibleproject.com/galatians',
        linkLabel: '',
      })
      const karen = (await signInAs({ phone: leader.phone, password: leader.password })).cookie
      const dashboard = await getPage('/relationships', karen)
      expect(dashboard.html).toContain('Galatians, weeks 1-5')
      expect(dashboard.html).toContain(
        'Bring one question. Notes at <a href="https://example.org/galatians" target="_blank" rel="noopener noreferrer">https://example.org/galatians</a>.',
      )
      expect(dashboard.html).toMatch(
        /<a class="res" href="https:\/\/bibleproject.com\/galatians" target="_blank" rel="noopener noreferrer">/,
      )
      expect(dashboard.html).toContain('bibleproject.com')
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
    expect((await post(`/materials/${mark.id}/save`, { title: 'Mark', body: 'Text.' })).location).toContain(
      'error=material.not_on_the_list',
    )
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
