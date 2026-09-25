import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import type { Command } from '~/domain/commands'
import type { Effect } from '~/domain/effects'
import { MaterialRefused } from '~/domain/errors'
import { createSequentialIds, materialId, materialItemId, ministryId } from '~/domain/ids'
import {
  abandonedUploads,
  fileTypeNamed,
  LARGEST_FILE_BYTES,
  linkAddress,
  linkHost,
  materialTitle,
  MOST_ITEMS,
  readMaterialBody,
  readWebLink,
  readUpload,
  type MaterialFile,
  type MaterialItem,
  type MaterialOnOffer,
} from '~/domain/materials'

/**
 * The Ministry's own list of Materials, and the three acts that change it
 * (`.scratch/materials/spec.md`, ticket 02). Every rule about what an Admin may
 * do to the list is decided here, against the list the store read: a title is
 * non-blank and unique among the live Materials, a Material carries text, a
 * file or link, or both, and a removal is refused while anybody is working
 * through it, with the count in the refusal. Since Richer materials, ticket 01,
 * a Material holds any number of files and links up to a cap, each checked.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const admin = '00000000-0000-4000-8000-0000000000ad'

const masterPlan = materialId('00000000-0000-4000-8000-0000000000c1')
const romans = materialId('00000000-0000-4000-8000-0000000000c2')
const prayer = materialId('00000000-0000-4000-8000-0000000000c3')

const at = new Date('2026-09-14T10:00:00Z')

const pdf = (path: string, filename: string, bytes = 1_843_200): MaterialFile => ({
  kind: 'file',
  path: `${ministry}/${path}`,
  filename,
  contentType: 'application/pdf',
  bytes,
})

const studyGuide: MaterialItem = {
  ...pdf('guide.pdf', 'master-plan-study-guide.pdf'),
  id: materialItemId('00000000-0000-4000-8000-0000000000e1'),
  position: 0,
}
const overview: MaterialItem = {
  kind: 'link',
  url: 'https://www.youtube.com/watch?v=ej_6dVdJSIU',
  label: 'Overview video',
  id: materialItemId('00000000-0000-4000-8000-0000000000e2'),
  position: 2,
}
const prayerSheet: MaterialItem = {
  ...pdf('prayer.pdf', 'prayer.pdf'),
  id: materialItemId('00000000-0000-4000-8000-0000000000e3'),
  position: 0,
}

const theList: readonly MaterialOnOffer[] = [
  {
    id: masterPlan,
    title: materialTitle('The Master Plan of Evangelism'),
    body: 'Read one chapter a week.',
    items: [studyGuide, overview],
    inUseBy: 5,
  },
  { id: romans, title: materialTitle('Romans, weeks 1-6'), body: 'The text of Romans.', items: [], inUseBy: 0 },
  { id: prayer, title: materialTitle('Prayer practices'), body: null, items: [prayerSheet], inUseBy: 0 },
]

/** Which paths some Material names, as the store answers it: every file on the list. */
const pathsNamedBy = (materials: readonly MaterialOnOffer[]): ReadonlySet<string> =>
  new Set(materials.flatMap((material) => material.items.flatMap((item) => (item.kind === 'file' ? [item.path] : []))))

const edit = (command: Command, materials: readonly MaterialOnOffer[] = theList) =>
  handleCommand(command, {
    ministryId: ministry,
    clock: createTestClock(at),
    ids: createSequentialIds(),
    materials,
    materialPathsNamed: pathsNamedBy(materials),
  } satisfies CommandContext)

const created = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'material.create' ? [effect.material] : []))

const edited = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'material.edit' ? [effect.edit] : []))

const removed = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'material.remove' ? [effect.removal] : []))

const history = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'history.append' ? [effect.event] : []))

const refusalOf = (act: () => unknown): MaterialRefused => {
  try {
    act()
  } catch (error) {
    if (error instanceof MaterialRefused) return error
    throw error
  }
  throw new Error('Nothing was refused')
}

const create = (fields: Partial<Extract<Command, { type: 'material.create' }>>): Command => ({
  type: 'material.create',
  ministryId: ministry,
  title: 'Gospel of Mark reading plan',
  body: null,
  files: [],
  links: [],
  createdBy: admin,
  ...fields,
})

const change = (fields: Partial<Extract<Command, { type: 'material.edit' }>>): Command => ({
  type: 'material.edit',
  ministryId: ministry,
  materialId: masterPlan,
  title: 'The Master Plan of Evangelism',
  body: 'Read one chapter a week.',
  removeItems: [],
  files: [],
  links: [],
  changedBy: admin,
  ...fields,
})

describe('creating a Material', () => {
  it('adds one with text, and names the Admin in history', () => {
    const withText = edit(create({ body: 'Week 1: Mark 1-2.\nWeek 2: Mark 3-4.' }))
    expect(created(withText.effects)).toEqual([
      {
        id: expect.any(String),
        ministryId: ministry,
        title: 'Gospel of Mark reading plan',
        body: 'Week 1: Mark 1-2.\nWeek 2: Mark 3-4.',
        items: [],
        createdAt: at,
      },
    ])
    expect(history(withText.effects)).toEqual([
      expect.objectContaining({
        type: 'material.created',
        subjectType: 'material',
        subjectId: created(withText.effects)[0]!.id,
        occurredAt: at,
        payload: {
          title: 'Gospel of Mark reading plan',
          body: 'Week 1: Mark 1-2.\nWeek 2: Mark 3-4.',
          items: [],
          createdBy: admin,
        },
      }),
    ])
  })

  it('adds one that is only a file, only a link, or several of each, files first and in order', () => {
    const onlyFile = edit(create({ title: 'Galatians', body: '', files: [pdf('g.pdf', 'galatians.pdf')] }))
    expect(created(onlyFile.effects)[0]).toMatchObject({
      title: 'Galatians',
      body: null,
      items: [{ kind: 'file', filename: 'galatians.pdf', position: 0 }],
    })
    expect(history(onlyFile.effects)[0]?.payload).toMatchObject({
      items: [{ kind: 'file', filename: 'galatians.pdf' }],
    })

    const onlyLink = edit(
      create({ title: 'Mark overview', links: [{ url: 'https://bibleproject.com/mark', label: null }] }),
    )
    expect(created(onlyLink.effects)[0]?.items).toEqual([
      { kind: 'link', url: 'https://bibleproject.com/mark', label: null, id: expect.any(String), position: 0 },
    ])

    const questions: MaterialFile = {
      ...pdf('q.docx', 'questions.docx', 48_000),
      contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }
    const several = edit(
      create({
        title: 'Philippians',
        body: 'Four weeks.',
        files: [pdf('p.pdf', 'philippians.pdf'), questions],
        links: [{ url: 'https://example.org/video', label: '  Session   one ' }],
      }),
    )
    expect(created(several.effects)[0]?.items.map((item) => [item.kind, item.position])).toEqual([
      ['file', 0],
      ['file', 1],
      ['link', 2],
    ])
    expect(created(several.effects)[0]?.items[2]).toMatchObject({ label: 'Session one' })
  })

  it('trims the title and collapses its spaces, and keeps the line breaks in the text', () => {
    const result = edit(create({ title: '  Gospel of   Mark  ', body: '  Week 1.\n\nWeek 2.  ' }))
    expect(created(result.effects)[0]).toMatchObject({ title: 'Gospel of Mark', body: 'Week 1.\n\nWeek 2.' })
  })

  it('refuses a Material with nothing on the title', () => {
    expect(refusalOf(() => edit(create({ title: '   ', body: 'Some text.' }))).refusal).toBe(
      'material.needs_title',
    )
  })

  it('refuses a title the Ministry already holds, whatever its capitalisation', () => {
    for (const title of ['Romans, weeks 1-6', 'ROMANS, WEEKS 1-6', '  romans,  weeks 1-6 ']) {
      expect(refusalOf(() => edit(create({ title, body: 'Text.' }))).refusal, title).toBe(
        'material.title_taken',
      )
    }
  })

  it('refuses a Material with no text, no file and no link', () => {
    for (const body of [null, '', '   \n  ']) {
      expect(refusalOf(() => edit(create({ title: 'Empty', body }))).refusal, JSON.stringify(body)).toBe(
        'material.needs_content',
      )
    }
  })

  it('refuses a stored file of a type a Material may not hold, or over the cap', () => {
    const exe: MaterialFile = { ...pdf('x.exe', 'setup.exe'), contentType: 'application/x-msdownload' }
    expect(refusalOf(() => edit(create({ files: [exe] }))).refusal).toBe('material.file_type')

    const huge = pdf('big.pdf', 'big.pdf', LARGEST_FILE_BYTES + 1)
    expect(refusalOf(() => edit(create({ files: [huge] }))).refusal).toBe('material.file_too_large')
    expect(
      created(edit(create({ files: [pdf('max.pdf', 'max.pdf', LARGEST_FILE_BYTES)] })).effects),
    ).toHaveLength(1)
  })

  it('refuses a link that is not an http or https address', () => {
    for (const url of [
      'www.example.com',
      'javascript:alert(1)',
      'mailto:pastor@example.org',
      'ftp://example.org/x',
      'https://exa mple.org',
      'https://',
    ]) {
      expect(refusalOf(() => edit(create({ links: [{ url, label: null }] }))).refusal, url).toBe(
        'material.link_unreadable',
      )
    }
  })

  it('refuses more files and links than a Material may hold', () => {
    const links = Array.from({ length: MOST_ITEMS + 1 }, (_, n) => ({
      url: `https://example.org/${n}`,
      label: null,
    }))
    expect(refusalOf(() => edit(create({ links }))).refusal).toBe('material.too_many_items')
    expect(created(edit(create({ links: links.slice(1) })).effects)[0]?.items).toHaveLength(MOST_ITEMS)
  })

  it('refuses to decide without the list, rather than treating its absence as an empty one', () => {
    expect(() =>
      handleCommand(create({ title: 'Anything', body: 'Text.' }), {
        ministryId: ministry,
        clock: createTestClock(at),
        ids: createSequentialIds(),
      }),
    ).toThrow(/No list of Materials/)
  })
})

describe('editing a Material', () => {
  it('retitles and rewords in place, keeping its items, and writes what it used to say', () => {
    const result = edit(
      change({
        title: 'The Master Plan of Evangelism, revised',
        body: 'Read one chapter a week. Bring one question.',
      }),
    )
    expect(edited(result.effects)).toEqual([
      {
        ministryId: ministry,
        materialId: masterPlan,
        title: 'The Master Plan of Evangelism, revised',
        body: 'Read one chapter a week. Bring one question.',
        removed: [],
        added: [],
        discarded: [],
      },
    ])
    const remembered = [
      { kind: 'file', filename: 'master-plan-study-guide.pdf' },
      { kind: 'link', url: 'https://www.youtube.com/watch?v=ej_6dVdJSIU', label: 'Overview video' },
    ]
    expect(history(result.effects)).toEqual([
      expect.objectContaining({
        type: 'material.edited',
        subjectType: 'material',
        subjectId: masterPlan,
        payload: {
          from: { title: 'The Master Plan of Evangelism', body: 'Read one chapter a week.', items: remembered },
          to: {
            title: 'The Master Plan of Evangelism, revised',
            body: 'Read one chapter a week. Bring one question.',
            items: remembered,
          },
          changedBy: admin,
        },
      }),
    ])
  })

  it('lets an Admin correct a title’s own capitalisation without calling it a duplicate', () => {
    const result = edit(change({ materialId: romans, title: 'Romans, Weeks 1-6', body: 'The text of Romans.' }))
    expect(edited(result.effects)[0]?.title).toBe('Romans, Weeks 1-6')
  })

  it('refuses a title another live Material holds', () => {
    expect(
      refusalOf(() => edit(change({ materialId: romans, title: 'prayer practices', body: 'Text.' }))).refusal,
    ).toBe('material.title_taken')
  })

  it('removes the items ticked, says which files to delete, and adds new ones after everything it held', () => {
    const replacement = pdf('new.pdf', 'master-plan-2nd-edition.pdf')
    const result = edit(
      change({
        removeItems: [studyGuide.id],
        files: [replacement],
        links: [{ url: 'https://example.org/plan', label: 'Reading plan' }],
      }),
    )
    const [made] = edited(result.effects)
    expect(made?.removed).toEqual([studyGuide])
    expect(made?.discarded).toEqual([studyGuide])
    // After position 2, the largest it ever held, not in the place just freed.
    expect(made?.added.map((item) => [item.kind, item.position])).toEqual([
      ['file', 3],
      ['link', 4],
    ])
    expect(history(result.effects)[0]?.payload).toMatchObject({
      to: {
        items: [
          { kind: 'link', url: 'https://www.youtube.com/watch?v=ej_6dVdJSIU' },
          { kind: 'file', filename: 'master-plan-2nd-edition.pdf' },
          { kind: 'link', url: 'https://example.org/plan', label: 'Reading plan' },
        ],
      },
    })
  })

  it('removes a link without discarding any file', () => {
    const [made] = edited(edit(change({ removeItems: [overview.id] })).effects)
    expect(made).toMatchObject({ removed: [overview], discarded: [] })
  })

  it('ignores an item the Material no longer holds, as a page older than somebody else’s save would send', () => {
    const [made] = edited(edit(change({ removeItems: ['00000000-0000-4000-8000-0000000000ee'] })).effects)
    expect(made?.removed).toEqual([])
  })

  it('refuses to take the last item off a Material with no text, and to blank the text of one with none', () => {
    const noItems = refusalOf(() =>
      edit(change({ materialId: prayer, title: 'Prayer practices', body: '', removeItems: [prayerSheet.id] })),
    )
    expect(noItems.refusal).toBe('material.needs_content')

    const noText = refusalOf(() => edit(change({ materialId: romans, title: 'Romans, weeks 1-6', body: '  ' })))
    expect(noText.refusal).toBe('material.needs_content')
  })

  it('refuses an edit that would leave more items than a Material may hold, and allows one that removes as many', () => {
    const links = Array.from({ length: MOST_ITEMS - 1 }, (_, n) => ({
      url: `https://example.org/${n}`,
      label: null,
    }))
    expect(refusalOf(() => edit(change({ links }))).refusal).toBe('material.too_many_items')
    expect(edited(edit(change({ links, removeItems: [overview.id] })).effects)).toHaveLength(1)
  })

  it('refuses to edit a Material that is not on the list', () => {
    const refusal = refusalOf(() =>
      edit(
        change({
          materialId: materialId('00000000-0000-4000-8000-0000000000ff'),
          title: 'Anything',
          body: 'Text.',
        }),
      ),
    )
    expect(refusal.refusal).toBe('material.not_on_the_list')
  })
})

describe('removing a Material', () => {
  it('flags one nobody is working through, and names the Admin in history', () => {
    const result = edit({ type: 'material.remove', ministryId: ministry, materialId: romans, removedBy: admin })
    expect(removed(result.effects)).toEqual([{ ministryId: ministry, materialId: romans, removedAt: at }])
    expect(history(result.effects)).toEqual([
      expect.objectContaining({
        type: 'material.removed',
        subjectType: 'material',
        subjectId: romans,
        payload: { title: 'Romans, weeks 1-6', removedBy: admin },
      }),
    ])
  })

  it('refuses while any accepted, unended relationship is on it, with the count', () => {
    const refusal = refusalOf(() =>
      edit({ type: 'material.remove', ministryId: ministry, materialId: masterPlan, removedBy: admin }),
    )
    expect(refusal.refusal).toBe('material.in_use')
    expect(refusal.inUseBy).toBe(5)
  })

  it('refuses one that is not on the list', () => {
    const refusal = refusalOf(() =>
      edit({
        type: 'material.remove',
        ministryId: ministry,
        materialId: materialId('00000000-0000-4000-8000-0000000000ff'),
        removedBy: admin,
      }),
    )
    expect(refusal.refusal).toBe('material.not_on_the_list')
  })
})

describe('a file an Admin chose', () => {
  it('is named by its extension, whatever its case', () => {
    expect(fileTypeNamed('Guide.PDF')?.contentType).toBe('application/pdf')
    expect(fileTypeNamed('questions.docx')?.kind).toBe('Word document')
    expect(fileTypeNamed('IMG_0001.HEIC')?.contentType).toBe('image/heic')
    expect(fileTypeNamed('session.mov')?.contentType).toBe('video/quicktime')
    expect(fileTypeNamed('no-extension')).toBeNull()
    expect(fileTypeNamed('setup.exe')).toBeNull()
  })

  it('may be uploaded when it is a type a Material holds, within the cap', () => {
    expect(readUpload({ filename: 'a.pdf', bytes: 1 })).toBeNull()
    expect(readUpload({ filename: 'session.mp4', bytes: LARGEST_FILE_BYTES })).toBeNull()
  })

  it('is refused before its upload when it is another type, or too large', () => {
    expect(readUpload({ filename: 'setup.exe', bytes: 1 })).toBe('material.file_type')
    expect(readUpload({ filename: 'session.mp4', bytes: LARGEST_FILE_BYTES + 1 })).toBe(
      'material.file_too_large',
    )
  })
})

describe('a link', () => {
  it('keeps the address as typed, trimmed, and its label collapsed, or no label', () => {
    expect(readWebLink({ url: '  https://example.org/a?b=1  ', label: '  ' })).toEqual({
      kind: 'link',
      url: 'https://example.org/a?b=1',
      label: null,
    })
    expect(readWebLink({ url: 'http://example.org', label: ' Week   one ' })?.label).toBe('Week one')
  })

  it('is refused unless it is an address as typed, not only as a URL parser forgives it', () => {
    for (const url of [
      'https:example.com',
      'https:/example.com',
      'https:\\\\example.com',
      'https://example.com\\@evil.example',
      'https://roster/people',
      'javascript:alert(1)',
      'www.example.com',
      'https://exa mple.com',
    ]) {
      expect(readWebLink({ url, label: null }), url).toBeNull()
    }
    expect(readWebLink({ url: 'HTTPS://Example.org/Week-1', label: null })?.url).toBe(
      'HTTPS://Example.org/Week-1',
    )
  })

  it('is shown by its host, or its host and path, without a leading www', () => {
    expect(linkHost('https://www.youtube.com/watch?v=ej_6dVdJSIU')).toBe('youtube.com')
    expect(linkAddress('https://www.youtube.com/watch?v=ej_6dVdJSIU')).toBe('youtube.com/watch?v=ej_6dVdJSIU')
    expect(linkAddress('https://bible.com/')).toBe('bible.com')
  })
})

describe('an upload nobody saved', () => {
  it('is swept a day after it landed, and never while a Material names it', () => {
    const now = new Date('2026-09-15T12:00:00Z')
    const objects = [
      { path: 'm/old-and-named.pdf', createdAt: new Date('2026-09-01T00:00:00Z') },
      { path: 'm/old-and-abandoned.pdf', createdAt: new Date('2026-09-14T11:59:00Z') },
      { path: 'm/fresh.pdf', createdAt: new Date('2026-09-14T12:01:00Z') },
    ]
    expect(abandonedUploads(objects, new Set(['m/old-and-named.pdf']), now)).toEqual([
      'm/old-and-abandoned.pdf',
    ])
  })
})

describe('the text a Material carries', () => {
  it('is trimmed at the ends and nowhere else, and null when there is none', () => {
    expect(readMaterialBody('  Week 1.\n  Week 2.\n\n')).toBe('Week 1.\n  Week 2.')
    // A form posts line breaks as CRLF; the Ministry wrote newlines.
    expect(readMaterialBody('Week 1.\r\nWeek 2.\r\n')).toBe('Week 1.\nWeek 2.')
    expect(readMaterialBody('')).toBeNull()
    expect(readMaterialBody(null)).toBeNull()
    expect(readMaterialBody(undefined)).toBeNull()
  })
})

describe('Save pressed twice', () => {
  it('does not add a file the Material already holds', () => {
    const [made] = edited(edit(change({ files: [studyGuide as MaterialFile] })).effects)
    expect(made?.added).toEqual([])
  })

  it('does not give a new Material a file another one already holds, removed or not', () => {
    // Created once, then the form brought back with Back and pressed again under
    // a new title: the upload is the first Material's now, and taking it would
    // leave a removal of either deleting the other's file.
    const [made] = created(
      edit(create({ body: 'Week one.', files: [prayerSheet as MaterialFile] })).effects,
    )
    expect(made?.items).toEqual([])
  })

  it('adds a file posted twice in one press once', () => {
    const upload: MaterialFile = {
      kind: 'file',
      path: 'm/twice.pdf',
      filename: 'twice.pdf',
      contentType: 'application/pdf',
      bytes: 10,
    }
    const [made] = created(edit(create({ files: [upload, upload] })).effects)
    expect(made?.items.map((item) => (item.kind === 'file' ? item.path : item.url))).toEqual(['m/twice.pdf'])
  })
})
