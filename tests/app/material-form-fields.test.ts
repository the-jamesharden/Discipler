import { describe, expect, it } from 'vitest'
import { carriedBack, postedLinks, postedUploads, refusedWith, uploadsIn } from '../../app/materials/editing'
import { uploadField } from '../../app/materials/form-answer'

/**
 * What the create and edit forms post, and what a refusal carries back (Richer
 * materials, review): an upload named twice is one upload, its size comes back
 * with it, one the bucket no longer holds is marked, and a link's name typed
 * without its address is not silently dropped.
 */

const formOf = (fields: readonly (readonly [string, string])[]): FormData => {
  const form = new FormData()
  for (const [name, value] of fields) form.append(name, value)
  return form
}

const guide = { path: 'm/1.pdf', filename: 'Guide.pdf', bytes: 1_843_200 }
const video = { path: 'm/2.mp4', filename: 'Week 1.mp4', bytes: 42_000_000 }

describe('the uploads a form posts', () => {
  it('reads each once, with the size the browser saw', () => {
    const form = formOf([
      ['upload', uploadField(guide)],
      ['upload', uploadField(guide)],
      ['upload', uploadField(video)],
    ])
    expect(postedUploads(form)).toEqual([
      { ...guide, gone: false },
      { ...video, gone: false },
    ])
  })

  it('drops what the page never writes, and reads a size it cannot trust as none', () => {
    expect(
      uploadsIn([
        'not json',
        JSON.stringify({ path: 'm/3.pdf' }),
        JSON.stringify({ path: 'm/4.pdf', filename: 'Four.pdf', bytes: -1 }),
      ]),
    ).toEqual([{ path: 'm/4.pdf', filename: 'Four.pdf', bytes: null, gone: false }])
  })
})

describe('a refusal, carried back', () => {
  const form = formOf([
    ['title', 'Romans'],
    ['body', ''],
    ['upload', uploadField(guide)],
    ['upload', uploadField(video)],
  ])

  it('keeps the uploads, unless the refusal was about them', () => {
    expect(refusedWith('material.title_taken', form)).toContainEqual(['upload', uploadField(guide)])
    expect(refusedWith('material.file_type', form).some(([field]) => field === 'upload')).toBe(false)
  })

  it('marks an upload the bucket no longer holds, and says nothing was refused', () => {
    const carried = carriedBack(form, [video.path])
    expect(carried.some(([field]) => field === 'error')).toBe(false)
    expect(uploadsIn(carried.flatMap(([field, value]) => (field === 'upload' ? [value] : [])))).toEqual([
      { ...guide, gone: false },
      { ...video, gone: true },
    ])
    expect(carried).toContainEqual(['title', 'Romans'])
  })
})

describe('the link box', () => {
  it('posts nothing when both halves are blank', () => {
    expect(postedLinks(formOf([['linkUrl', ' '], ['linkLabel', '']]))).toEqual([])
  })

  it('posts a name typed with no address, for the boundary to refuse', () => {
    expect(postedLinks(formOf([['linkUrl', ''], ['linkLabel', 'Overview video']]))).toEqual([
      { url: '', label: 'Overview video' },
    ])
  })
})
