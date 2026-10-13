import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The answers to a Ministry's own Intake questions are shown to an Admin and
 * never matched on (Pastor feedback 2026-10, ticket 12; `docs/product-rules.md`,
 * *A Ministry Controls Its Intake Forms*). Suggested Pairs, the pairing rules and
 * the age rule run on Discipler's own questions, whose meaning the product knows;
 * a Ministry's own question means whatever the Ministry meant by it.
 *
 * That is a rule about what future code may do, so it is checked mechanically, as
 * the relationship kind is (`relationship-kind-fence.test.ts`): only the files on
 * the list below may name the answers at all, and none of them ranks, pairs or
 * filters anybody. The database's half -- that `suggestion_inputs` and `roster`
 * never read `intake_answer` -- is asserted against the functions as they stand in
 * `tests/integration/custom-questions.test.ts`.
 */

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

const filesUnder = (directory: string): string[] =>
  readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) return filesUnder(path)
    return /\.tsx?$/.test(path) ? [path] : []
  })

/** Every way code reaches the answers: the module, its types, the table, the document key. */
const NAMES_THE_ANSWERS = /own-answers|ownAnswers|own_answers|intake_answer|OwnAnswer/

/**
 * The files that may: the module that reads and shows them, the form that asks
 * them and the routes that take them back to it, the submission that records them
 * and the store that writes them, the readers that put them on the person page,
 * the pair card and Follow-Up's card, and those screens. Adding a file
 * here is a decision to be argued for, which is the point of the list.
 */
const MAY_NAME_THE_ANSWERS = [
  'src/domain/own-answers.ts',
  'src/domain/intake.ts',
  'src/domain/effects.ts',
  'src/domain/boundary.ts',
  'src/service/ports.ts',
  'src/platform/supabase/effect-store.ts',
  'src/platform/supabase/intake-reader.ts',
  'src/platform/supabase/intake-form-document.ts',
  'src/platform/supabase/pair-card-reader.ts',
  'src/platform/supabase/follow-up-page-reader.ts',
  'src/platform/supabase/person-page-reader.ts',
  'app/own-answers.tsx',
  'app/pair-card/pair-card.tsx',
  'app/roster/[personId]/page.tsx',
  'app/intake/fields.tsx',
  'app/intake/submitted-form.ts',
  'app/intake/wizard-machine.ts',
  'app/intake/[ministry]/discipleship/submit/route.ts',
  'app/intake/[ministry]/submit/route.ts',
]

/** And the ones that must never be on it, named so the list above cannot quietly grow to them. */
const PAIRS_PEOPLE = [
  'src/domain/suggestions.ts',
  'src/domain/separate-pairings.ts',
  'src/domain/intended-pairing.ts',
  'src/platform/supabase/suggested-pairs-reader.ts',
  'src/platform/supabase/roster-reader.ts',
  'app/suggested-pairs/page.tsx',
  'app/roster/lists.ts',
  'app/roster/greying.ts',
  'app/roster/pair-shape.ts',
  'app/roster/pair-popup.tsx',
  'app/roster/pair-popup-from-a-disciple.tsx',
  'app/roster/pair-popup-from-a-discipler.tsx',
]

describe('the answers to a Ministry’s own questions', () => {
  const sourceFiles = [...filesUnder(join(repoRoot, 'src')), ...filesUnder(join(repoRoot, 'app'))].map((path) =>
    path.slice(repoRoot.length),
  )

  it('are named only where the list says, and the list still names them', () => {
    for (const allowed of MAY_NAME_THE_ANSWERS) {
      expect(
        NAMES_THE_ANSWERS.test(readFileSync(join(repoRoot, allowed), 'utf8')),
        `${allowed} may name the answers but no longer does -- take it off the list`,
      ).toBe(true)
    }
    expect(PAIRS_PEOPLE.filter((path) => MAY_NAME_THE_ANSWERS.includes(path))).toEqual([])
  })

  it('are never read by what pairs people', () => {
    for (const path of PAIRS_PEOPLE) {
      expect(sourceFiles, `${path} is gone -- update the list`).toContain(path)
    }
  })

  it.each(sourceFiles.filter((path) => !MAY_NAME_THE_ANSWERS.includes(path)).map((path) => [path]))(
    'are not read by %s',
    (path) => {
      expect(
        NAMES_THE_ANSWERS.test(readFileSync(join(repoRoot, path), 'utf8')),
        `${path} names the answers to a Ministry's own questions. They are shown to an Admin and never ` +
          'matched on; see docs/product-rules.md, A Ministry Controls Its Intake Forms.',
      ).toBe(false)
    },
  )
})
