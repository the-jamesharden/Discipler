import { describe, expect, it } from 'vitest'
import { handleCommand } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import { createSequentialIds, intendedPairingId, ministryId, personId, type PersonId } from '~/domain/ids'
import { phoneNumber, rosterKey, type PhoneNumber } from '~/domain/roster'
import { readRosterFile, type ImportMode } from '~/domain/roster-csv'
import { classifyImport, type ImportReadback } from '~/domain/roster-import'
import { file } from '../support/roster'

/**
 * The import dialog reviews a paste in the browser with the reader and the
 * classifier; the command imports it on the server with the same two. This holds
 * them to the same answer, paste by paste: what the review counted is what the
 * command wrote, and what the review refused is what the report says (ticket 36).
 */

const ministry = ministryId('11111111-1111-1111-1111-111111111111')
const at = new Date('2026-03-02T09:00:00Z')

const ruth = personId('00000000-0000-4000-9000-000000000001')
const omar = personId('00000000-0000-4000-9000-000000000002')

/** A Roster holding Ruth and Omar, with Omar already planned for. */
const roster: ImportReadback = {
  people: new Map([
    [rosterKey({ fullName: 'Ruth Adeyemi', phone: phoneNumber('+15550144001') }), ruth],
    [rosterKey({ fullName: 'Omar Haddad', phone: phoneNumber('+15550144002') }), omar],
  ]),
  namesByNumber: new Map<PhoneNumber, readonly string[]>([
    [phoneNumber('+15550144001'), ['Ruth Adeyemi']],
    [phoneNumber('+15550144002'), ['Omar Haddad']],
  ]),
  openPlans: [{ leaderId: ruth, participantId: omar }],
}

const bothSides = (text: string, mode: ImportMode) => {
  const review = classifyImport(readRosterFile(text, mode), roster)
  const outcome = handleCommand(
    { type: 'person.import', ministryId: ministry, mode, text },
    {
      ministryId: ministry,
      clock: createTestClock(at),
      ids: createSequentialIds(),
      openPlans: roster.openPlans.map((plan, index) => ({
        ...plan,
        id: intendedPairingId(`00000000-0000-4000-9000-0000000000${String(index + 50)}`),
        plannedAt: at,
      })),
      roster: { ...roster, whoCompletedIntake: new Set<PersonId>() },
    },
  )
  const written = {
    people: outcome.effects.filter((effect) => effect.kind === 'person.create').length,
    held: outcome.effects.filter((effect) => effect.kind === 'importRow.raise').length,
    plans: outcome.effects.filter((effect) => effect.kind === 'intendedPairing.plan').length,
  }
  return { review, outcome, written }
}

const PASTES: readonly { readonly name: string; readonly mode: ImportMode; readonly text: string }[] = [
  {
    name: 'three new pairs',
    mode: 'already_paired',
    text: file(
      'Discipler,Discipler Phone,Disciple,Disciple Phone',
      'Sam Rivera,5550144010,Taylor Brooks,5550144011',
      'Alex Morgan,5550144012,Casey Nguyen,5550144013',
      'Jordan Lee,5550144014,Riley Carter,5550144015',
    ),
  },
  {
    name: 'a pair with somebody already on the Roster, a held row, and a planned Disciple',
    mode: 'already_paired',
    text: file(
      'Discipler,Discipler Phone,Disciple,Disciple Phone',
      'Ruth Adeyemi,5550144001,Sam Rivera,5550144010',
      'Sam Rivera,5550144010,Ruthie Adeyemi,5550144001',
      'Sam Rivera,5550144010,Omar Haddad,5550144002',
    ),
  },
  {
    name: 'people only, with roles, names the Roster answers, and rows it refuses',
    mode: 'people_only',
    text: file(
      'Name,Role,Phone,Email,Paired With',
      'Taylor Brooks,Disciple,5550144011,,Ruth Adeyemi',
      'Casey Nguyen,Disciple,5550144013,,Nobody Here',
      'Alex Morgan,Discipler,5550144012,,Casey Nguyen',
      'No Number,,,,',
      'Bad Email,,5550144016,not-an-email,',
      'Riley Carter,,5550144015,,Alex Morgan',
      'Riley Carter,,5550144015,,',
    ),
  },
]

describe('the review and the import agree', () => {
  for (const paste of PASTES) {
    it(paste.name, () => {
      const { review, outcome, written } = bothSides(paste.text, paste.mode)

      expect(written.people).toBe(review.counts.newDisciplers + review.counts.newDisciples)
      expect(written.plans).toBe(review.counts.pairsPlanned)
      expect(written.held).toBe(review.rows.filter((row) => row.outcome === 'held').length)
      expect(outcome.rejections).toEqual(review.rejections)
    })
  }

  it('is a real disagreement it would catch: the counts are not trivially zero', () => {
    const { review, written } = bothSides(PASTES[1]!.text, PASTES[1]!.mode)
    expect(written).toEqual({ people: 1, held: 1, plans: 1 })
    expect(review.counts).toEqual({ newDisciplers: 0, newDisciples: 1, pairsPlanned: 1, alreadyOnTheRoster: 2 })
    expect(review.rejections.map((each) => each.problem)).toEqual([
      'already_on_the_roster',
      'same_number_different_name',
      'paired_with_held',
      'already_on_the_roster',
      'pairing_already_planned',
    ])
  })
})
