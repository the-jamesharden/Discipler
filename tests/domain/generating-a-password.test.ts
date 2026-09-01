import { describe, expect, it } from 'vitest'
import {
  createFixedChoices,
  generatePassword,
  SHORTEST_PASSWORD,
  WORDS_IN_A_PASSWORD,
} from '~/domain/accounts'
import { PASSWORD_WORDS } from '~/domain/password-words'

/**
 * Discipler chooses the password an Admin reads out. Nobody types one, so the
 * whole of *is this password any good* is decided here.
 *
 * Two halves, tested apart. The generator is the rule -- four words, hyphenated,
 * and the same words every time for the same draws -- and the list is the data it
 * draws from, whose constraints are all one requirement wearing different clothes:
 * this is said out loud and then typed by somebody who has never seen it written.
 */

describe('the password Discipler generates', () => {
  it('is four words from the list, hyphenated', () => {
    const password = generatePassword(createFixedChoices(0, 1, 2, 3))

    expect(password).toBe(
      [PASSWORD_WORDS[0], PASSWORD_WORDS[1], PASSWORD_WORDS[2], PASSWORD_WORDS[3]].join('-'),
    )
    expect(password.split('-')).toHaveLength(WORDS_IN_A_PASSWORD)
  })

  it('is the same password twice for the same draws', () => {
    // The whole reason the source is injected. A test that could not say which
    // password a reset produced could only assert that a random string came back,
    // which is the assertion that passes when the generator breaks.
    const draws = () => createFixedChoices(511, 12, 900, 44)

    expect(generatePassword(draws())).toBe(generatePassword(draws()))
  })

  it('draws each word independently, so the same word can come up twice', () => {
    // Stated rather than discovered. Excluding what has already been drawn would
    // buy nothing measurable and would make each word depend on the ones before it.
    expect(generatePassword(createFixedChoices(7))).toBe(
      Array.from({ length: WORDS_IN_A_PASSWORD }, () => PASSWORD_WORDS[7]).join('-'),
    )
  })

  it('refuses a source that chooses a word off the list', () => {
    expect(() => generatePassword(createFixedChoices(PASSWORD_WORDS.length))).toThrow()
  })

  it('is comfortably longer than the shortest password Discipler accepts', () => {
    // Every password, not one sample: the shortest four words on the list are four
    // letters each, which with three hyphens is nineteen characters.
    const shortest = WORDS_IN_A_PASSWORD * 4 + (WORDS_IN_A_PASSWORD - 1)

    expect(shortest).toBeGreaterThan(SHORTEST_PASSWORD)
  })
})

/**
 * One edit apart -- an insertion, a deletion, a substitution or a transposition --
 * is the mechanical form of *those two words are the same word*. It is a floor
 * rather than the whole rule: homophones and British-American spellings are the
 * other two ways a list fails, and both are judged by hand.
 */
const oneEditApart = (a: string, b: string): boolean => {
  if (Math.abs(a.length - b.length) > 1) return false

  const rows = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      rows[i]![j] = Math.min(
        rows[i - 1]![j]! + 1,
        rows[i]![j - 1]! + 1,
        rows[i - 1]![j - 1]! + cost,
      )
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        rows[i]![j] = Math.min(rows[i]![j]!, rows[i - 2]![j - 2]! + 1)
      }
    }
  }

  return rows[a.length]![b.length]! <= 1
}

describe('the wordlist', () => {
  it('holds exactly 1024 words, so each is worth ten bits', () => {
    expect(PASSWORD_WORDS).toHaveLength(1024)
  })

  it('holds each word once', () => {
    expect(new Set(PASSWORD_WORDS).size).toBe(PASSWORD_WORDS.length)
  })

  it('holds nothing but four to eight lower-case letters', () => {
    // No apostrophe, no hyphen and no accent. The hyphen is what separates the
    // words, so one inside a word turns four words into something nobody can read
    // back over a phone.
    expect(PASSWORD_WORDS.filter((word) => !/^[a-z]{4,8}$/.test(word))).toEqual([])
  })

  it('holds no two words within one edit of each other', () => {
    const twins: string[][] = []

    for (let i = 0; i < PASSWORD_WORDS.length; i++) {
      for (let j = i + 1; j < PASSWORD_WORDS.length; j++) {
        if (oneEditApart(PASSWORD_WORDS[i]!, PASSWORD_WORDS[j]!)) {
          twins.push([PASSWORD_WORDS[i]!, PASSWORD_WORDS[j]!])
        }
      }
    }

    expect(twins).toEqual([])
  })
})
