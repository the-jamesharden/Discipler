import { describe, expect, it } from 'vitest'
import { itemMeta, itemName, textWithLinks } from '../../app/materials/items'

/**
 * How a Material's text and items read on a screen (Richer materials, ticket 01):
 * a web address in the text becomes a link and nothing else does, and an item is
 * named by its filename, its label, or the site it is on.
 */

describe('a Material’s text', () => {
  it('makes every http and https address a link, leaving the sentence around it', () => {
    expect(
      textWithLinks('Week 1 starts with chapter 5. The plan is at https://bible.com/plans/romans.'),
    ).toEqual([
      { kind: 'text', text: 'Week 1 starts with chapter 5. The plan is at ' },
      { kind: 'link', url: 'https://bible.com/plans/romans' },
      { kind: 'text', text: '.' },
    ])
  })

  it('keeps a query string, and leaves a bracket or comma after an address to the sentence', () => {
    expect(textWithLinks('(see http://example.org/a?b=1&c=2), then')).toEqual([
      { kind: 'text', text: '(see ' },
      { kind: 'link', url: 'http://example.org/a?b=1&c=2' },
      { kind: 'text', text: '), then' },
    ])
  })

  it('reads nothing else as a link: not a bare www, not another scheme', () => {
    expect(textWithLinks('www.example.org and javascript:alert(1)')).toEqual([
      { kind: 'text', text: 'www.example.org and javascript:alert(1)' },
    ])
  })

  it('keeps line breaks where they were, and an address on a line of its own', () => {
    expect(textWithLinks('Line one\nhttps://a.org\nLine three')).toEqual([
      { kind: 'text', text: 'Line one\n' },
      { kind: 'link', url: 'https://a.org' },
      { kind: 'text', text: '\nLine three' },
    ])
  })
})

describe('an item', () => {
  it('is named by its filename, its label, or its site', () => {
    const file = { kind: 'file' as const, filename: 'Guide.pdf', contentType: 'application/pdf', bytes: 1_843_200 }
    expect(itemName(file)).toBe('Guide.pdf')
    expect(itemMeta(file)).toBe('PDF · 1.8 MB')
    expect(itemName({ kind: 'link', url: 'https://www.youtube.com/watch?v=x', label: 'Overview' })).toBe('Overview')
    expect(itemName({ kind: 'link', url: 'https://www.youtube.com/watch?v=x', label: null })).toBe('youtube.com')
  })
})
