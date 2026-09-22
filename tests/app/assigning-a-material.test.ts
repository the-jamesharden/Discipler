import { describe, expect, it } from 'vitest'
import { materialId } from '~/domain/ids'
import type { MaterialOption } from '~/service/ports'
import {
  assignRow,
  backToFolder,
  chosenIn,
  folderIn,
  groupMaterialField,
  NO_MATERIAL_VALUE,
  relationshipIn,
} from '../../app/materials/assigning'
import { assignmentRefusalMessage } from '../../app/materials/copy'
import { groupRefusalMessage, materialOnceAccepted } from '../../app/intake-forms/copy'
import { workingThrough } from '../../app/intake/copy'

/**
 * What the assign row and the groups card's Material field offer and post
 * (Materials, ticket 03). Pure, so the dropdowns are driven with no page near them.
 */

const romans = materialId('3f0c2a8e-1b4d-4c6e-9a7b-000000000001')
const mark = materialId('3f0c2a8e-1b4d-4c6e-9a7b-000000000002')
const live: readonly MaterialOption[] = [
  { materialId: mark, title: 'Gospel of Mark reading plan' },
  { materialId: romans, title: 'Romans' },
]
const labels = { noMaterial: 'No material', choose: 'Choose a material…' }

describe("the assign row on a Material's folder", () => {
  it('lists every live Material and then No material, on the current one', () => {
    const { options, selected } = assignRow(live, romans, labels)
    expect(options.map((option) => option.label)).toEqual([
      'Gospel of Mark reading plan',
      'Romans',
      'No material',
    ])
    expect(selected).toBe(romans)
  })
})

describe('the assign row on the no-material folder', () => {
  it('opens on "Choose a material…", which posts no choice, and offers no No material', () => {
    const { options, selected } = assignRow(live, null, labels)
    expect(options.map((option) => option.label)).toEqual([
      'Choose a material…',
      'Gospel of Mark reading plan',
      'Romans',
    ])
    expect(selected).toBe('')
    expect(chosenIn(options[0]!.value)).toBeNull()
  })
})

describe("the groups card's Material field", () => {
  it('offers No material first, then every live Material, on the running one', () => {
    const { options, selected } = groupMaterialField(live, mark, 'No material')
    expect(options.map((option) => option.label)).toEqual([
      'No material',
      'Gospel of Mark reading plan',
      'Romans',
    ])
    expect(selected).toBe(mark)
  })

  it('opens on No material for a group on none', () => {
    expect(groupMaterialField(live, null, 'No material').selected).toBe(NO_MATERIAL_VALUE)
  })

  it('names the leader an unaccepted group is waiting on', () => {
    expect(materialOnceAccepted(['Claire'])).toBe(
      'A material can be assigned once Claire has accepted. The group is not on the link until then either.',
    )
  })

  it('says the name was saved when only the Material was refused', () => {
    expect(groupRefusalMessage('material.relationship_not_accepted')).toMatch(/^The name was saved\./)
  })

  it('has no sentence for a code nobody sent, however it is spelled', () => {
    expect(groupRefusalMessage('__proto__')).toBe('That could not be saved.')
  })
})

describe('what a form posts', () => {
  it('reads No material as the un-assign, an id as a Material, and a blank as nothing', () => {
    expect(chosenIn(NO_MATERIAL_VALUE)).toEqual({ kind: 'none' })
    expect(chosenIn(romans)).toEqual({ kind: 'material', id: romans })
    expect(chosenIn('')).toBeNull()
    expect(chosenIn(null)).toBeNull()
  })

  it('keys a relationship and a folder only by an id, or the no-material folder by name', () => {
    expect(relationshipIn(romans)).toBe(romans)
    expect(relationshipIn("'; drop table")).toBeNull()
    expect(folderIn(NO_MATERIAL_VALUE)).toBe(NO_MATERIAL_VALUE)
    expect(folderIn(romans)).toBe(romans)
    expect(folderIn('https://elsewhere.example')).toBeNull()
  })
})

describe('the way back', () => {
  it('is the folder the card was pressed in, with the filter and any refusal', () => {
    expect(backToFolder(romans, 'female', 'material.already_running')).toEqual({
      path: `/materials/${romans}`,
      params: { gender: 'female', assignError: 'material.already_running' },
    })
  })

  it('is the tab when the folder named is not one', () => {
    expect(backToFolder(null, null)).toEqual({ path: '/materials', params: {} })
  })

  it('says why saving the Material already running changed nothing', () => {
    expect(assignmentRefusalMessage('material.already_running')).toBe(
      'It is already working through that material, so nothing changed.',
    )
  })
})

describe('the group form', () => {
  it('says what a group is working through beneath its name', () => {
    expect(workingThrough('The Master Plan of Evangelism')).toBe(
      'Working through The Master Plan of Evangelism',
    )
  })
})
