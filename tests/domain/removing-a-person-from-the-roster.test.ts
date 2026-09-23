import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import type { Effect } from '~/domain/effects'
import { RemovalRefused } from '~/domain/errors'
import {
  createSequentialIds,
  followUpItemId,
  intendedPairingId,
  ministryId,
  personId,
  type PersonId,
} from '~/domain/ids'
import type { IntakeFormFields } from '~/domain/intake'
import { intakeLinkToken, type IntakeLinkToken } from '~/domain/intake-link'
import type { PersonToRemove } from '~/domain/removal'
import { classifyImport, type ImportReadback } from '~/domain/roster-import'
import { readRosterFile } from '~/domain/roster-csv'
import { phoneNumber, rosterKey, type ImportedPerson } from '~/domain/roster'

/**
 * Remove from the Roster, ticket 01 (James, 2026-09-22). A removal is a dated
 * fact and never a delete: the Person's open Follow-Up items are resolved, the
 * plans an import made for them are closed, and a later Intake from them brings
 * the same Person back. Their pairings are the Unpair acts' and are let go of
 * before this runs, in the same transaction; that is
 * `tests/integration/removing-a-person-from-the-roster.test.ts`.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const now = new Date('2026-09-22T19:00:00Z')
const admin = '00000000-0000-4000-8000-0000000000ad'
const hannah = personId('00000000-0000-4000-9000-000000000001')

const hannahAsFound = (over: Partial<PersonToRemove> = {}): PersonToRemove => ({
  personId: hannah,
  fullName: 'Hannah Brooks',
  isAdmin: false,
  holdsAnAccount: false,
  openMemberships: 0,
  openFollowUpItems: [],
  openPlans: [],
  ...over,
})

const removing = (found: PersonToRemove | null | undefined) =>
  handleCommand(
    { type: 'person.remove', ministryId: ministry, personId: hannah, removedBy: admin },
    {
      ministryId: ministry,
      clock: createTestClock(now),
      ids: createSequentialIds(),
      ...(found === undefined ? {} : { personToRemove: found }),
    },
  )

const kinds = (effects: readonly Effect[]) => effects.map((effect) => effect.kind)

describe('removing a Person from the Roster', () => {
  it('records the removal, by whom and when, and says so in history', () => {
    const { effects } = removing(hannahAsFound())

    expect(kinds(effects)).toEqual(['person.remove', 'history.append'])
    expect(effects[0]).toEqual({
      kind: 'person.remove',
      removal: { ministryId: ministry, personId: hannah, removedAt: now, removedBy: admin },
    })
    expect(effects[1]).toMatchObject({
      kind: 'history.append',
      event: {
        type: 'person.removed',
        subjectType: 'person',
        subjectId: hannah,
        occurredAt: now,
        payload: {
          fullName: 'Hannah Brooks',
          removedBy: admin,
          heldAnAccount: false,
          resolvedItemIds: [],
          closedPlanIds: [],
        },
      },
    })
  })

  it('sends nobody anything', () => {
    const { effects } = removing(hannahAsFound({ holdsAnAccount: true }))
    expect(kinds(effects)).not.toContain('message.enqueue')
  })

  it('resolves every open Follow-Up item about them, as the Admin who removed them', () => {
    const items = [followUpItemId('item-1'), followUpItemId('item-2')]
    const { effects } = removing(hannahAsFound({ openFollowUpItems: items }))

    expect(effects.flatMap((effect) => (effect.kind === 'followUp.resolve' ? [effect.resolution] : []))).toEqual(
      items.map((itemId) => ({ ministryId: ministry, itemId, resolvedBy: admin, resolvedAt: now })),
    )
    expect(effects.at(-1)).toMatchObject({ event: { payload: { resolvedItemIds: items } } })
  })

  it('closes the plans an import made for them, refused in the words forming them would be refused in', () => {
    const asTheDisciple = intendedPairingId('plan-1')
    const asTheDiscipler = intendedPairingId('plan-2')
    const { effects } = removing(
      hannahAsFound({
        openPlans: [
          { id: asTheDisciple, side: 'participant' },
          { id: asTheDiscipler, side: 'leader' },
        ],
      }),
    )

    expect(effects.flatMap((effect) => (effect.kind === 'intendedPairing.close' ? [effect.closure] : []))).toEqual([
      {
        ministryId: ministry,
        id: asTheDisciple,
        outcome: 'refused',
        closedAt: now,
        relationshipId: null,
        refusal: 'relationship.participant_was_removed',
      },
      {
        ministryId: ministry,
        id: asTheDiscipler,
        outcome: 'refused',
        closedAt: now,
        relationshipId: null,
        refusal: 'relationship.leader_was_removed',
      },
    ])
    // The Admin who would read an item about it is the one who removed them.
    expect(kinds(effects)).not.toContain('followUp.raise')
  })

  it('refuses an Admin', () => {
    expect(() => removing(hannahAsFound({ isAdmin: true }))).toThrow(
      new RemovalRefused('removal.person_is_an_admin'),
    )
  })

  it('refuses somebody a pairing still holds, which is a page drawn before it changed', () => {
    expect(() => removing(hannahAsFound({ openMemberships: 1 }))).toThrow(
      new RemovalRefused('removal.still_in_a_pairing'),
    )
  })

  it('refuses somebody the Roster does not hold, or holds removed already', () => {
    expect(() => removing(null)).toThrow(new RemovalRefused('removal.not_on_the_roster'))
  })

  it('will not run on a Person nobody read', () => {
    expect(() => removing(undefined)).toThrow('person.remove was handed no Person to remove')
  })
})

describe('coming back through Intake', () => {
  const form: IntakeFormFields = {
    fullName: 'Hannah Brooks',
    phone: '(555) 599-1044',
    email: null,
    ageBand: '25-34',
    gender: 'female',
    goalId: '00000000-0000-4000-8000-000000000009',
    availability: ['tuesday:18'],
    smsConsent: true,
    contactSharing: 'granted',
    source: 'pastor_link',
    intakePath: null,
    declaredSide: null,
    experience: null,
    groupId: null,
  }
  const key = rosterKey({ fullName: 'Hannah Brooks', phone: phoneNumber('+15555991044') })

  const submitting = (
    removed: ReadonlySet<PersonId>,
    over: Partial<CommandContext> = {},
    token?: IntakeLinkToken,
  ) =>
    handleCommand(
      { type: 'intake.submit', ministryId: ministry, form, ...(token ? { token } : {}) },
      {
        ministryId: ministry,
        clock: createTestClock(now),
        ids: createSequentialIds(),
        ministryName: 'Riverside Chapel',
        appBaseUrl: 'https://discipler.test',
        roster: {
          people: new Map([[key, hannah]]),
          namesByNumber: new Map([[phoneNumber('+15555991044'), ['Hannah Brooks']]]),
          whoCompletedIntake: new Set([hannah]),
          removed,
        },
        ...over,
      },
    )

  it('brings a removed Person back as the same Person, and records it', () => {
    const { effects } = submitting(new Set([hannah]))

    expect(kinds(effects)).not.toContain('person.create')
    expect(effects).toContainEqual({
      kind: 'person.restore',
      restoration: { ministryId: ministry, personId: hannah, restoredAt: now },
    })
    expect(effects).toContainEqual(
      expect.objectContaining({
        kind: 'history.append',
        event: expect.objectContaining({
          type: 'person.restored',
          subjectId: hannah,
          payload: { through: 'ministry_intake_link' },
        }),
      }),
    )
    // The submission lands on them as any re-submission does.
    expect(effects).toContainEqual(
      expect.objectContaining({ kind: 'intake.record', intake: expect.objectContaining({ personId: hannah }) }),
    )
  })

  it('brings them back through a link an Admin gave them, too', () => {
    const token = intakeLinkToken('a-token-an-admin-handed-over')
    const { effects } = submitting(
      new Set([hannah]),
      { intakeLink: { personId: hannah, token, expiresAt: new Date(now.getTime() + 86_400_000) } },
      token,
    )
    expect(effects).toContainEqual(
      expect.objectContaining({
        event: expect.objectContaining({ type: 'person.restored', payload: { through: 'intake_link' } }),
      }),
    )
  })

  it('restores nobody who was never removed', () => {
    const { effects } = submitting(new Set())
    expect(kinds(effects)).not.toContain('person.restore')
  })
})

describe('an import naming somebody removed', () => {
  const ruth = personId('00000000-0000-4000-9000-000000000002')
  const roster = (removed: ReadonlySet<PersonId>): ImportReadback => ({
    people: new Map([
      [rosterKey({ fullName: 'Hannah Brooks', phone: phoneNumber('+15555991044') }), hannah],
      [rosterKey({ fullName: 'Ruth Adeyemi', phone: phoneNumber('+15555991045') }), ruth],
    ]),
    namesByNumber: new Map([
      [phoneNumber('+15555991044'), ['Hannah Brooks']],
      [phoneNumber('+15555991045'), ['Ruth Adeyemi']],
    ]),
    removed,
    openPlans: [],
  })

  it('reports their row and files it nowhere, since Intake is the only way back', () => {
    const { rows, rejections, counts } = classifyImport(
      readRosterFile('Name,Phone\nHannah Brooks,555-599-1044', 'people_only'),
      roster(new Set([hannah])),
    )

    expect(rows).toMatchObject([{ outcome: 'removed', existingId: hannah }])
    expect(rejections).toEqual([{ line: 2, problem: 'removed_from_the_roster' }])
    expect(counts).toEqual({ newDisciplers: 0, newDisciples: 0, pairsPlanned: 0, alreadyOnTheRoster: 0 })
  })

  it('writes nothing for their row when the import runs', () => {
    const { effects, rejections } = handleCommand(
      { type: 'person.import', ministryId: ministry, mode: 'people_only', text: 'Name,Phone\nHannah Brooks,555-599-1044' },
      {
        ministryId: ministry,
        clock: createTestClock(now),
        ids: createSequentialIds(),
        openPlans: [],
        roster: { ...roster(new Set([hannah])), whoCompletedIntake: new Set([hannah]) },
      },
    )
    expect(effects).toEqual([])
    expect(rejections).toEqual([{ line: 2, problem: 'removed_from_the_roster' }])
  })

  it('does not plan a pair with somebody removed, named by a row or by name alone', () => {
    const hannahsRow: ImportedPerson = {
      line: 2,
      fullName: 'Hannah Brooks',
      phone: phoneNumber('+15555991044'),
      email: null,
    }
    const newcomer: ImportedPerson = {
      line: 3,
      fullName: 'New Person',
      phone: phoneNumber('+15555991046'),
      email: null,
    }

    const byRow = classifyImport(
      {
        people: [hannahsRow, newcomer],
        pairings: [
          {
            line: 3,
            leader: { kind: 'in_file', key: rosterKey(hannahsRow) },
            participant: { kind: 'in_file', key: rosterKey(newcomer) },
          },
        ],
        rejected: [],
      },
      roster(new Set([hannah])),
    )
    expect(byRow.pairings).toMatchObject([{ outcome: 'not_recordable', reason: 'paired_with_removed' }])
    // The newcomer is still filed: a name in Paired with is no reason to lose them.
    expect(byRow.rows.map((row) => row.outcome)).toEqual(['removed', 'new'])

    // By name alone, a removed Person is nobody the Roster holds now.
    const byName = classifyImport(
      {
        people: [newcomer],
        pairings: [
          {
            line: 3,
            leader: { kind: 'by_name', name: 'Hannah Brooks' },
            participant: { kind: 'in_file', key: rosterKey(newcomer) },
          },
        ],
        rejected: [],
      },
      roster(new Set([hannah])),
    )
    expect(byName.pairings).toMatchObject([{ outcome: 'not_recordable', reason: 'paired_with_unknown' }])
  })

  it('is exactly the old answer for somebody who was never removed', () => {
    const { rows } = classifyImport(
      readRosterFile('Name,Phone\nHannah Brooks,555-599-1044', 'people_only'),
      roster(new Set()),
    )
    expect(rows).toMatchObject([{ outcome: 'already_on_the_roster', existingId: hannah }])
  })
})
