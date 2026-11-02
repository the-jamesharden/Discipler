import { describe, expect, it } from 'vitest'
import { capacityConcerns } from '~/domain/shared-numbers'

/**
 * When support@ is told the shared numbers are running near capacity (Exponential
 * launch, ticket 06). Worked through with the numbers the launch starts on: three
 * in use, five more bought, so eight.
 */
describe('The shared numbers near capacity', () => {
  it('raises nothing for the eight numbers at launch carrying today’s churches', () => {
    // Example Ministry, SAU BCM and Anthem: 61 people, nobody in two churches.
    expect(capacityConcerns({ numbers: 8, recipients: 61, mostChurchesOnOnePhone: 1 })).toEqual([])
  })

  it('raises the recipients once eight numbers carry four in five of the 1,600 they hold', () => {
    expect(capacityConcerns({ numbers: 8, recipients: 1279, mostChurchesOnOnePhone: 1 })).toEqual([])
    expect(capacityConcerns({ numbers: 8, recipients: 1280, mostChurchesOnOnePhone: 1 })).toEqual([
      'recipients',
    ])
  })

  it('counts a number added as room for more, so adding one is the answer', () => {
    expect(capacityConcerns({ numbers: 9, recipients: 1280, mostChurchesOnOnePhone: 1 })).toEqual([])
  })

  it('raises the recipients when there are no numbers at all, since nothing can be sent', () => {
    expect(capacityConcerns({ numbers: 0, recipients: 0, mostChurchesOnOnePhone: 0 })).toEqual([
      'recipients',
    ])
  })

  it('raises one phone once the person in the most churches has one number left', () => {
    // A phone needs a different number for every church that texts it, so a person
    // in as many churches as there are numbers cannot be texted by the next one.
    expect(capacityConcerns({ numbers: 8, recipients: 61, mostChurchesOnOnePhone: 6 })).toEqual([])
    expect(capacityConcerns({ numbers: 8, recipients: 61, mostChurchesOnOnePhone: 7 })).toEqual([
      'one_phone',
    ])
  })

  it('raises one phone on today’s three numbers as soon as somebody is in two churches', () => {
    expect(capacityConcerns({ numbers: 3, recipients: 61, mostChurchesOnOnePhone: 2 })).toEqual([
      'one_phone',
    ])
  })

  it('raises both when both are true', () => {
    expect(capacityConcerns({ numbers: 2, recipients: 400, mostChurchesOnOnePhone: 2 })).toEqual([
      'recipients',
      'one_phone',
    ])
  })
})
