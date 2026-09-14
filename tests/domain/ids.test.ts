import { describe, expect, it } from 'vitest'
import { createSequentialIds, personIdFrom } from '~/domain/ids'

describe('a PersonId out of text nobody vouched for', () => {
  it('is the value when it has the shape a stored identifier has', () => {
    const issued = createSequentialIds().next()
    expect(personIdFrom(issued)).toBe(issued)
    expect(personIdFrom('7f3b2a10-9c4d-4e1f-8a6b-0123456789ab')).toBe(
      '7f3b2a10-9c4d-4e1f-8a6b-0123456789ab',
    )
  })

  it('is null for anything that names no Person', () => {
    for (const text of [undefined, '', 'anything', 'not-a-uuid', '7F3B2A10-9C4D-4E1F-8A6B-0123456789AB']) {
      expect(personIdFrom(text)).toBeNull()
    }
  })
})
