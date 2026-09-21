import { describe, expect, it } from 'vitest'
import { materialFieldFor, readMaterialPerDisciple } from '../../app/roster/pair/material-per-disciple'

/**
 * Manual pairing, recut ticket 02. The Material chosen for each Disciple of a set
 * of separate one-to-ones, as the popup posts it, as the route sends it back on a
 * refusal, and as the Roster reads it out of the address to restore it: one field
 * per Disciple, `materialId.<personId>`, beside the one `materialId` a single
 * relationship takes.
 */

const sam = '33333333-3333-3333-3333-333333333333'
const ana = '44444444-4444-4444-4444-444444444444'
const mark = '77777777-7777-7777-7777-777777777777'
const romans = '88888888-8888-8888-8888-888888888888'

describe('a Material per Disciple, in a form and in an address', () => {
  it('names each Disciple’s field after them', () => {
    expect(materialFieldFor(sam)).toBe(`materialId.${sam}`)
  })

  it('reads each Disciple’s choice out of a form', () => {
    const form = new FormData()
    form.append('leaderId', 'somebody')
    form.append(materialFieldFor(sam), mark)
    form.append(materialFieldFor(ana), romans)

    expect([...readMaterialPerDisciple(form.entries())]).toEqual([[sam, mark], [ana, romans]])
  })

  it('reads the same out of an address, where a value may be said twice', () => {
    const query = { list: 'all', [materialFieldFor(sam)]: [mark, romans], [materialFieldFor(ana)]: romans }

    expect([...readMaterialPerDisciple(Object.entries(query))]).toEqual([[sam, mark], [ana, romans]])
  })

  it('reads No material, which is the empty value, as no choice at all', () => {
    const form = new FormData()
    form.append(materialFieldFor(sam), '')
    form.append(materialFieldFor(ana), romans)

    expect([...readMaterialPerDisciple(form.entries())]).toEqual([[ana, romans]])
  })

  it('never reads the one Material a single relationship takes, a file, or a field naming nobody', () => {
    const form = new FormData()
    form.append('materialId', mark)
    form.append('materialId.', mark)
    form.append(materialFieldFor(sam), new Blob(['x']))

    expect([...readMaterialPerDisciple(form.entries())]).toEqual([])
  })

  it('goes into an address and comes back out', () => {
    const params = new URLSearchParams()
    for (const [personId, materialId] of [[sam, mark], [ana, romans]] as const) {
      params.set(materialFieldFor(personId), materialId)
    }

    expect([...readMaterialPerDisciple(params.entries())]).toEqual([[sam, mark], [ana, romans]])
  })
})
