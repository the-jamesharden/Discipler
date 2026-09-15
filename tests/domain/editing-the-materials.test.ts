import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import type { Command } from '~/domain/commands'
import type { Effect } from '~/domain/effects'
import { MaterialRefused } from '~/domain/errors'
import { createSequentialIds, materialId, ministryId } from '~/domain/ids'
import {
  LARGEST_PDF_BYTES,
  materialTitle,
  readMaterialBody,
  readPdfUpload,
  type MaterialOnOffer,
} from '~/domain/materials'

/**
 * The Ministry's own list of Materials, and the three acts that change it
 * (`.scratch/materials/spec.md`, ticket 02). Every rule about what an Admin may
 * do to the list is decided here, against the list the store read: a title is
 * non-blank and unique among the live Materials, a Material carries text, a PDF
 * or both, and a removal is refused while anybody is working through it, with
 * the count in the refusal.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const admin = '00000000-0000-4000-8000-0000000000ad'

const masterPlan = materialId('00000000-0000-4000-8000-0000000000c1')
const romans = materialId('00000000-0000-4000-8000-0000000000c2')
const prayer = materialId('00000000-0000-4000-8000-0000000000c3')

const at = new Date('2026-09-14T10:00:00Z')

const studyGuide = { path: `${ministry}/guide.pdf`, filename: 'master-plan-study-guide.pdf' }

const theList: readonly MaterialOnOffer[] = [
  {
    id: masterPlan,
    title: materialTitle('The Master Plan of Evangelism'),
    body: 'Read one chapter a week.',
    pdf: studyGuide,
    inUseBy: 5,
  },
  { id: romans, title: materialTitle('Romans, weeks 1-6'), body: 'The text of Romans.', pdf: null, inUseBy: 0 },
  { id: prayer, title: materialTitle('Prayer practices'), body: null, pdf: { path: `${ministry}/prayer.pdf`, filename: 'prayer.pdf' }, inUseBy: 0 },
]

const edit = (command: Command, materials: readonly MaterialOnOffer[] = theList) =>
  handleCommand(command, {
    ministryId: ministry,
    clock: createTestClock(at),
    ids: createSequentialIds(),
    materials,
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

describe('creating a Material', () => {
  it('adds one with text, one with a PDF, and one with both, and names the Admin in history', () => {
    const withText = edit({
      type: 'material.create',
      ministryId: ministry,
      title: 'Gospel of Mark reading plan',
      body: 'Week 1: Mark 1-2.\nWeek 2: Mark 3-4.',
      pdf: null,
      createdBy: admin,
    })
    expect(created(withText.effects)).toEqual([
      {
        id: expect.any(String),
        ministryId: ministry,
        title: 'Gospel of Mark reading plan',
        body: 'Week 1: Mark 1-2.\nWeek 2: Mark 3-4.',
        pdf: null,
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
          pdfFilename: null,
          createdBy: admin,
        },
      }),
    ])

    const withPdf = edit({
      type: 'material.create',
      ministryId: ministry,
      title: 'Galatians',
      body: '',
      pdf: { path: `${ministry}/g.pdf`, filename: 'galatians.pdf' },
      createdBy: admin,
    })
    expect(created(withPdf.effects)[0]).toMatchObject({ title: 'Galatians', body: null, pdf: { filename: 'galatians.pdf' } })
    expect(history(withPdf.effects)[0]?.payload).toMatchObject({ pdfFilename: 'galatians.pdf' })

    const withBoth = edit({
      type: 'material.create',
      ministryId: ministry,
      title: 'Philippians',
      body: 'Four weeks.',
      pdf: { path: `${ministry}/p.pdf`, filename: 'philippians.pdf' },
      createdBy: admin,
    })
    expect(created(withBoth.effects)[0]).toMatchObject({ body: 'Four weeks.', pdf: { filename: 'philippians.pdf' } })
  })

  it('trims the title and collapses its spaces, and keeps the line breaks in the text', () => {
    const result = edit({
      type: 'material.create',
      ministryId: ministry,
      title: '  Gospel of   Mark  ',
      body: '  Week 1.\n\nWeek 2.  ',
      pdf: null,
      createdBy: admin,
    })
    expect(created(result.effects)[0]).toMatchObject({ title: 'Gospel of Mark', body: 'Week 1.\n\nWeek 2.' })
  })

  it('refuses a Material with nothing on the title', () => {
    const refusal = refusalOf(() =>
      edit({ type: 'material.create', ministryId: ministry, title: '   ', body: 'Some text.', pdf: null, createdBy: admin }),
    )
    expect(refusal.refusal).toBe('material.needs_title')
  })

  it('refuses a title the Ministry already holds, whatever its capitalisation', () => {
    for (const title of ['Romans, weeks 1-6', 'ROMANS, WEEKS 1-6', '  romans,  weeks 1-6 ']) {
      const refusal = refusalOf(() =>
        edit({ type: 'material.create', ministryId: ministry, title, body: 'Text.', pdf: null, createdBy: admin }),
      )
      expect(refusal.refusal, title).toBe('material.title_taken')
    }
  })

  it('refuses a Material with neither text nor a PDF', () => {
    for (const body of [null, '', '   \n  ']) {
      const refusal = refusalOf(() =>
        edit({ type: 'material.create', ministryId: ministry, title: 'Empty', body, pdf: null, createdBy: admin }),
      )
      expect(refusal.refusal, JSON.stringify(body)).toBe('material.needs_content')
    }
  })

  it('refuses to decide without the list, rather than treating its absence as an empty one', () => {
    expect(() =>
      handleCommand(
        { type: 'material.create', ministryId: ministry, title: 'Anything', body: 'Text.', pdf: null, createdBy: admin },
        { ministryId: ministry, clock: createTestClock(at), ids: createSequentialIds() },
      ),
    ).toThrow(/No list of Materials/)
  })
})

describe('editing a Material', () => {
  it('retitles and rewords in place, keeping the PDF, and writes what it used to say', () => {
    const result = edit({
      type: 'material.edit',
      ministryId: ministry,
      materialId: masterPlan,
      title: 'The Master Plan of Evangelism, revised',
      body: 'Read one chapter a week. Bring one question.',
      pdf: 'keep',
      changedBy: admin,
    })
    expect(edited(result.effects)).toEqual([
      {
        ministryId: ministry,
        materialId: masterPlan,
        title: 'The Master Plan of Evangelism, revised',
        body: 'Read one chapter a week. Bring one question.',
        pdf: studyGuide,
        discarded: null,
      },
    ])
    expect(history(result.effects)).toEqual([
      expect.objectContaining({
        type: 'material.edited',
        subjectType: 'material',
        subjectId: masterPlan,
        payload: {
          from: { title: 'The Master Plan of Evangelism', body: 'Read one chapter a week.', pdfFilename: 'master-plan-study-guide.pdf' },
          to: { title: 'The Master Plan of Evangelism, revised', body: 'Read one chapter a week. Bring one question.', pdfFilename: 'master-plan-study-guide.pdf' },
          changedBy: admin,
        },
      }),
    ])
  })

  it('lets an Admin correct a title’s own capitalisation without calling it a duplicate', () => {
    const result = edit({
      type: 'material.edit',
      ministryId: ministry,
      materialId: romans,
      title: 'Romans, Weeks 1-6',
      body: 'The text of Romans.',
      pdf: 'keep',
      changedBy: admin,
    })
    expect(edited(result.effects)[0]?.title).toBe('Romans, Weeks 1-6')
  })

  it('refuses a title another live Material holds', () => {
    const refusal = refusalOf(() =>
      edit({ type: 'material.edit', ministryId: ministry, materialId: romans, title: 'prayer practices', body: 'Text.', pdf: 'keep', changedBy: admin }),
    )
    expect(refusal.refusal).toBe('material.title_taken')
  })

  it('replaces the PDF and says which object the row no longer names', () => {
    const replacement = { path: `${ministry}/new.pdf`, filename: 'master-plan-2nd-edition.pdf' }
    const result = edit({
      type: 'material.edit',
      ministryId: ministry,
      materialId: masterPlan,
      title: 'The Master Plan of Evangelism',
      body: 'Read one chapter a week.',
      pdf: replacement,
      changedBy: admin,
    })
    expect(edited(result.effects)[0]).toMatchObject({ pdf: replacement, discarded: studyGuide })
    expect(history(result.effects)[0]?.payload).toMatchObject({
      from: { pdfFilename: 'master-plan-study-guide.pdf' },
      to: { pdfFilename: 'master-plan-2nd-edition.pdf' },
    })
  })

  it('removes the PDF from a Material with text, and says which object to delete', () => {
    const result = edit({
      type: 'material.edit',
      ministryId: ministry,
      materialId: masterPlan,
      title: 'The Master Plan of Evangelism',
      body: 'Read one chapter a week.',
      pdf: 'remove',
      changedBy: admin,
    })
    expect(edited(result.effects)[0]).toMatchObject({ pdf: null, discarded: studyGuide })
  })

  it('refuses to remove the PDF from a Material with no text, and to blank the text of one with no PDF', () => {
    const noPdf = refusalOf(() =>
      edit({ type: 'material.edit', ministryId: ministry, materialId: prayer, title: 'Prayer practices', body: '', pdf: 'remove', changedBy: admin }),
    )
    expect(noPdf.refusal).toBe('material.needs_content')

    const noText = refusalOf(() =>
      edit({ type: 'material.edit', ministryId: ministry, materialId: romans, title: 'Romans, weeks 1-6', body: '  ', pdf: 'keep', changedBy: admin }),
    )
    expect(noText.refusal).toBe('material.needs_content')
  })

  it('adds a PDF to a Material that had none, discarding nothing', () => {
    const added = { path: `${ministry}/r.pdf`, filename: 'romans.pdf' }
    const result = edit({
      type: 'material.edit',
      ministryId: ministry,
      materialId: romans,
      title: 'Romans, weeks 1-6',
      body: 'The text of Romans.',
      pdf: added,
      changedBy: admin,
    })
    expect(edited(result.effects)[0]).toMatchObject({ pdf: added, discarded: null })
  })

  it('refuses to edit a Material that is not on the list', () => {
    const refusal = refusalOf(() =>
      edit({
        type: 'material.edit',
        ministryId: ministry,
        materialId: materialId('00000000-0000-4000-8000-0000000000ff'),
        title: 'Anything',
        body: 'Text.',
        pdf: 'keep',
        changedBy: admin,
      }),
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
      edit({ type: 'material.remove', ministryId: ministry, materialId: materialId('00000000-0000-4000-8000-0000000000ff'), removedBy: admin }),
    )
    expect(refusal.refusal).toBe('material.not_on_the_list')
  })
})

describe('the file an Admin chose', () => {
  it('may be stored when it is a PDF within the cap', () => {
    expect(readPdfUpload({ type: 'application/pdf', size: 1 })).toBeNull()
    expect(readPdfUpload({ type: 'application/pdf', size: LARGEST_PDF_BYTES })).toBeNull()
  })

  it('is refused before storage when it is not a PDF, or too large', () => {
    expect(readPdfUpload({ type: 'image/png', size: 1 })).toBe('material.pdf_only')
    expect(readPdfUpload({ type: '', size: 1 })).toBe('material.pdf_only')
    expect(readPdfUpload({ type: 'application/pdf', size: LARGEST_PDF_BYTES + 1 })).toBe('material.pdf_too_large')
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
