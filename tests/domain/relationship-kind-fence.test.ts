import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * `relationship.kind` is a capacity declaration and nothing else. It exists so the
 * participation caps can be partial unique indexes, and it may be read by those
 * constraints and by the pairing scorer. Message copy and state derivation must keep
 * reading the *live participant count*, because the two disagree: a group that drops
 * to one Participant still says `group` while the reality says N=1, and copy that
 * branches on the column would go on addressing its last remaining member by the
 * relationship's name rather than by their own.
 *
 * That is a rule about what future code may do, so it is checked mechanically. It
 * decays one convenient read at a time otherwise, and the convenient read is right
 * there on the row, correct, and easy.
 *
 * See docs/adr/0004-relationship-kind-as-capacity-declaration.md.
 */

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

const filesUnder = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return filesUnder(path)
    return /\.tsx?$/.test(path) ? [path] : []
  })

/**
 * The files permitted to know what a kind is. `relationships.ts` defines the type and
 * the formation rule; the effect store writes the column. Adding to this list is a
 * decision to be argued for, which is the point of the list being here.
 */
const MAY_READ_KIND = ['src/domain/relationships.ts', 'src/platform/supabase/effect-store.ts']

/**
 * Matched whole rather than as substrings, for the reason ADR-0003 gives: the
 * refusal code `relationship.participant_already_in_a_one_to_one` contains
 * `one_to_one`, and a substring search would flag it as a kind branch when it is
 * nothing of the sort.
 */
const readsKind = [
  { pattern: /(['"])one_to_one\1/, what: "the literal 'one_to_one'" },
  { pattern: /(['"])group\1/, what: "the literal 'group'" },
  { pattern: /\bRelationshipKind\b/, what: 'the RelationshipKind type' },
  { pattern: /\b(relationship|member|membership)\.kind\b/, what: "a relationship's kind" },
]

/**
 * `kind` is also the discriminator on the Effect union -- `effect.kind ===
 * 'history.append'` -- so the patterns above deliberately do not match a bare `kind`.
 * The literal rules carry that weight instead: any branch on a relationship's kind
 * has to name `one_to_one` or `group` somewhere to be a branch at all.
 */

describe('relationship kind', () => {
  const sourceFiles = [
    ...filesUnder(join(repoRoot, 'src')),
    ...filesUnder(join(repoRoot, 'app')),
  ].map((path) => path.slice(repoRoot.length))

  it('has files to check', () => {
    expect(sourceFiles.length).toBeGreaterThan(0)
  })

  it('is declared where the allowlist says it is', () => {
    // If a file on the list stops mentioning kind, the list is stale and the fence is
    // quietly protecting nothing.
    for (const allowed of MAY_READ_KIND) {
      const source = readFileSync(join(repoRoot, allowed), 'utf8')
      expect(
        readsKind.some(({ pattern }) => pattern.test(source)),
        `${allowed} is allowed to read kind but no longer does -- take it off the list`,
      ).toBe(true)
    }
  })

  it.each(sourceFiles.filter((path) => !MAY_READ_KIND.includes(path)).map((p) => [p]))(
    'is not read by %s',
    (path) => {
      const source = readFileSync(join(repoRoot, path), 'utf8')

      for (const { pattern, what } of readsKind) {
        expect(
          pattern.test(source),
          `${path} reads ${what}. Copy and state derivation follow the live ` +
            'participant count; kind is for the participation caps and the scorer. ' +
            'See docs/adr/0004-relationship-kind-as-capacity-declaration.md.',
        ).toBe(false)
      }
    },
  )
})
