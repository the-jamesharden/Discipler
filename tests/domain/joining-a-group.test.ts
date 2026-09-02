import { describe, expect, it } from 'vitest'
import {
  handleCommand,
  type CommandContext,
  type RelationshipSnapshot,
} from '~/domain/boundary'
import type { CheckInSnapshot } from '~/domain/check-in'
import { createTestClock } from '~/domain/clock'
import type { Effect } from '~/domain/effects'
import { GroupRefused, IntakeRefused, PairingRefused } from '~/domain/errors'
import {
  createSequentialIds,
  followUpItemId,
  ministryId,
  personId,
  relationshipId,
  type PersonId,
} from '~/domain/ids'
import { GROUP_PATH, INTAKE_PATHS, readIntakeForm, type IntakeFormFields } from '~/domain/intake'
import { roleNoun } from '~/domain/ministry-settings'
import { groupJoinedMessage } from '~/domain/outbound-copy'
import { asPhoneNumber, rosterKey } from '~/domain/roster'

/**
 * Joining a group: the group Intake path, what picking a group does, and what an
 * Admin does with somebody who asked. Ticket 29, and the decisions recorded in
 * `docs/adr/0017-picking-a-group-joins-it.md`.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const group = relationshipId('00000000-0000-4000-8000-0000000000bb')
const david = personId('00000000-0000-4000-8000-0000000000d1')
const ruth = personId('00000000-0000-4000-8000-0000000000d2')
const emily = personId('00000000-0000-4000-8000-0000000000e1')

const now = new Date('2026-03-09T09:00:00Z')

const tuesdayGroup = (over: Partial<RelationshipSnapshot> = {}): RelationshipSnapshot => ({
  relationshipId: group,
  createdAt: new Date('2026-03-01T09:00:00Z'),
  acceptedAt: new Date('2026-03-02T09:00:00Z'),
  endedAt: null,
  name: 'Tuesday Women’s Group',
  joinRequiresApproval: false,
  declaredGender: 'female',
  pause: null,
  members: [
    { personId: ruth, role: 'leader', fullName: 'Ruth Adeyemi', phone: '+15550101' },
    { personId: emily, role: 'participant', fullName: 'Emily Johnson', phone: '+15550200' },
  ],
  ...over,
})

const context = (over: Partial<CommandContext> = {}): CommandContext => ({
  ministryId: ministry,
  clock: createTestClock(now),
  ids: createSequentialIds(),
  ministryName: 'Riverside Chapel',
  appBaseUrl: 'https://discipler.test',
  ...over,
})

const groupForm: IntakeFormFields = {
  fullName: 'Priya Raman',
  phone: '(555) 234-9912',
  email: null,
  ageBand: '25-34',
  gender: 'female',
  goalId: null,
  availability: ['tuesday:19'],
  smsConsent: true,
  contactSharing: 'granted',
  source: 'pastor_link',
  intakePath: GROUP_PATH,
  declaredSide: null,
  experience: null,
  groupId: group,
}

const read = (overrides: Partial<IntakeFormFields> = {}) =>
  readIntakeForm({ ...groupForm, ...overrides })

const refusalsOf = (overrides: Partial<IntakeFormFields>): readonly string[] => {
  const result = read(overrides)
  if (!('refusals' in result)) throw new Error('Expected the form to be refused')
  return result.refusals
}

const bodies = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'message.enqueue' ? [effect.message] : []))

const kinds = (effects: readonly Effect[]) => effects.map((effect) => effect.kind)

const historyOf = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'history.append' ? [effect.event] : []))

describe('what the group form asks, and does not', () => {
  it('is the second Intake path, the one ticket 27 reserved', () => {
    expect(INTAKE_PATHS).toContain(GROUP_PATH)
  })

  it('reads the group in place of the Goal', () => {
    expect(read()).toMatchObject({
      submission: { intakePath: GROUP_PATH, groupId: group, goalId: null, declaredSide: null },
    })
  })

  it('refuses a group path with no group named on it', () => {
    expect(refusalsOf({ groupId: null })).toEqual(['intake.group_not_selected'])
    expect(refusalsOf({ groupId: '   ' })).toEqual(['intake.group_not_selected'])
  })

  /**
   * The Goal is the suggestion tiebreaker, and nobody who named a group is being
   * ranked. A Goal arriving on this path is an answer with no question, which is
   * refused rather than dropped for the reason a side on the wrong path is.
   */
  it('refuses a Goal on the group path, and a side', () => {
    expect(refusalsOf({ goalId: 'some-goal' })).toEqual(['intake.path_unknown'])
    expect(refusalsOf({ declaredSide: 'mentor' })).toEqual(['intake.path_unknown'])
  })

  it('refuses a group named on a path that did not ask for one', () => {
    expect(
      refusalsOf({ intakePath: 'discipleship', declaredSide: 'mentee', experience: 'first_time', goalId: 'g' }),
    ).toEqual(['intake.path_unknown'])
    expect(refusalsOf({ intakePath: null, goalId: 'g' })).toEqual(['intake.path_unknown'])
  })

  it('still asks everything else the single page asked', () => {
    expect(refusalsOf({ availability: [] })).toEqual(['intake.availability_not_selected'])
    expect(refusalsOf({ smsConsent: false })).toEqual(['intake.sms_consent_required'])
    expect(refusalsOf({ ageBand: null })).toEqual(['intake.age_band_unknown'])
  })
})

describe('what picking a group does', () => {
  const submit = (over: Partial<CommandContext> = {}, form: Partial<IntakeFormFields> = {}) =>
    handleCommand(
      { type: 'intake.submit', ministryId: ministry, form: { ...groupForm, ...form } },
      context({
        roster: {
          people: new Map(),
          namesByNumber: new Map(),
          whoCompletedIntake: new Set<PersonId>(),
        },
        groupToJoin: tuesdayGroup(),
        ...over,
      }),
    )

  /** The same submission with the group never loaded at all -- absent, not null. */
  const submitUnloaded = () => {
    const { groupToJoin: _unloaded, ...rest } = context({
      roster: { people: new Map(), namesByNumber: new Map(), whoCompletedIntake: new Set<PersonId>() },
      groupToJoin: null,
    })
    return handleCommand({ type: 'intake.submit', ministryId: ministry, form: groupForm }, rest)
  }

  it('joins an open group the moment the form submits, as the Person’s own act', () => {
    const { effects } = submit()

    const join = effects.find((effect) => effect.kind === 'relationship.join')
    expect(join?.kind === 'relationship.join' && join.membership).toMatchObject({
      relationshipId: group,
      startedAt: now,
    })
    expect(historyOf(effects).map((event) => event.type)).toContain(
      'relationship.participant_joined',
    )
    expect(kinds(effects)).not.toContain('followUp.raise')
  })

  it('texts the group’s Leader that somebody joined, and never the joiner', () => {
    const { effects } = submit()
    const sent = bodies(effects)

    const toRuth = sent.filter((message) => message.personId === ruth)
    expect(toRuth).toHaveLength(1)
    expect(toRuth[0]!.body).toBe(
      groupJoinedMessage({
        ministryName: 'Riverside Chapel',
        joinerFullName: 'Priya Raman',
        groupName: 'Tuesday Women’s Group',
        dashboardLink: 'https://discipler.test/relationships',
      }),
    )
    expect(toRuth[0]!.body).toContain('Priya just joined Tuesday Women’s Group.')
    expect(toRuth[0]!.body).toContain('https://discipler.test/relationships')
    expect(toRuth[0]!.disclosesPersonId).toBeNull()

    // The joiner gets the Welcome and nothing about the group: it is the consent
    // receipt, and it promises no match either.
    const toPriya = sent.filter((message) => message.personId !== ruth)
    expect(toPriya).toHaveLength(1)
    expect(toPriya[0]!.body).not.toContain('matched')
    expect(toPriya[0]!.body).not.toContain('Tuesday')
  })

  it('asks rather than joins where the pastor set the group to require approval', () => {
    const { effects } = submit({ groupToJoin: tuesdayGroup({ joinRequiresApproval: true }) })

    const raised = effects.find((effect) => effect.kind === 'followUp.raise')
    expect(raised?.kind === 'followUp.raise' && raised.item).toMatchObject({
      kind: 'group_join_requested',
      relationshipId: group,
      raisedAt: now,
    })
    expect(historyOf(effects).map((event) => event.type)).toContain('relationship.join_requested')
    expect(kinds(effects)).not.toContain('relationship.join')
    // Nobody is told anything until an Admin decides.
    expect(bodies(effects).filter((message) => message.personId === ruth)).toHaveLength(0)
  })

  it('does nothing about the group for somebody already in it', () => {
    const phone = asPhoneNumber(groupForm.phone!)
    if (!phone) throw new Error('the fixture number should read')
    const { effects } = submit(
      {
        roster: {
          people: new Map([[rosterKey({ fullName: 'Emily Johnson', phone }), emily]]),
          namesByNumber: new Map(),
          whoCompletedIntake: new Set([emily]),
        },
      },
      { fullName: 'Emily Johnson' },
    )

    // Recognised by name and number as the Emily already in the group: the Intake
    // is recorded, and nothing about the group happens.
    expect(kinds(effects)).toContain('intake.record')
    expect(kinds(effects)).not.toContain('relationship.join')
    expect(kinds(effects)).not.toContain('followUp.raise')
    expect(bodies(effects).some((message) => message.personId === ruth)).toBe(false)
  })

  it('refuses a group that is gone, unnamed, not yet accepted, or ended', () => {
    const refusal = (snapshot: RelationshipSnapshot | null) => {
      try {
        submit({ groupToJoin: snapshot })
      } catch (error) {
        if (error instanceof IntakeRefused) return error.refusals
        throw error
      }
      return []
    }

    expect(refusal(null)).toEqual(['intake.group_unavailable'])
    expect(refusal(tuesdayGroup({ name: null }))).toEqual(['intake.group_unavailable'])
    expect(refusal(tuesdayGroup({ acceptedAt: null }))).toEqual(['intake.group_unavailable'])
    expect(refusal(tuesdayGroup({ endedAt: now }))).toEqual(['intake.group_unavailable'])
  })

  it('refuses a group that declared a gender the Person is not', () => {
    expect(() => submit({}, { gender: 'male' })).toThrow(IntakeRefused)
    try {
      submit({}, { gender: 'male' })
    } catch (error) {
      expect((error as IntakeRefused).refusals).toEqual(['intake.group_not_open_to_you'])
    }
    // A mixed group binds nobody.
    expect(() => submit({ groupToJoin: tuesdayGroup({ declaredGender: null }) }, { gender: 'male' }))
      .not.toThrow()
  })

  it('refuses to run when the group it named was never loaded', () => {
    expect(() => submitUnloaded()).toThrow(/handed nothing about it/)
  })
})

describe('forming a group', () => {
  const create = (over: {
    readonly participantIds?: PersonId[]
    readonly name?: string | null
    readonly joinRequiresApproval?: boolean
  } = {}) =>
    handleCommand(
      {
        type: 'relationship.create',
        ministryId: ministry,
        leaderIds: [david],
        participantIds: over.participantIds ?? [emily, ruth],
        declaredGender: null,
        ...(over.name === undefined ? {} : { name: over.name }),
        ...(over.joinRequiresApproval === undefined
          ? {}
          : { joinRequiresApproval: over.joinRequiresApproval }),
      },
      context({
        language: { leaderNoun: roleNoun('mentor'), participantNoun: roleNoun('mentee') },
        contacts: {
          people: new Map([
            [david, { fullName: 'David Ellis', phone: '+15550101' }],
            [emily, { fullName: 'Emily Johnson', phone: '+15550200' }],
            [ruth, { fullName: 'Ruth Adeyemi', phone: '+15550300' }],
          ]),
        },
      }),
    )

  const formed = (result: ReturnType<typeof create>) => {
    const effect = result.effects.find((e) => e.kind === 'relationship.create')
    if (effect?.kind !== 'relationship.create') throw new Error('no relationship was created')
    return effect.relationship
  }

  it('requires a name of a group', () => {
    expect(() => create()).toThrow(new PairingRefused('relationship.needs_a_name'))
    expect(() => create({ name: '   ' })).toThrow(new PairingRefused('relationship.needs_a_name'))
  })

  it('asks a one-to-one for no name, and keeps none it was given', () => {
    expect(formed(create({ participantIds: [emily] })).name).toBeNull()
    expect(formed(create({ participantIds: [emily], name: 'Tuesday' })).name).toBeNull()
  })

  it('carries the name and leaves the door open unless the Admin closes it', () => {
    const open = formed(create({ name: '  Tuesday Men’s Group ' }))
    expect(open.name).toBe('Tuesday Men’s Group')
    expect(open.joinRequiresApproval).toBe(false)

    const guarded = formed(create({ name: 'Tuesday Men’s Group', joinRequiresApproval: true }))
    expect(guarded.joinRequiresApproval).toBe(true)
  })
})

describe('an Admin admitting somebody who asked', () => {
  const item = followUpItemId('00000000-0000-4000-8000-0000000000f1')
  const priya = personId('00000000-0000-4000-8000-0000000000e2')

  const admit = (over: Partial<CommandContext> = {}) =>
    handleCommand(
      { type: 'relationship.admit', ministryId: ministry, itemId: item, admittedBy: 'admin-user-1' },
      context({
        joinRequest: { itemId: item, personId: priya, relationshipId: group },
        relationship: tuesdayGroup({ joinRequiresApproval: true }),
        contacts: { people: new Map([[priya, { fullName: 'Priya Raman', phone: '+15550400' }]]) },
        ...over,
      }),
    )

  it('adds the Participant, resolves the item and texts the Leader, in one act', () => {
    const { effects } = admit()

    expect(kinds(effects)).toEqual(
      expect.arrayContaining(['followUp.resolve', 'relationship.join', 'history.append', 'message.enqueue']),
    )
    const resolved = effects.find((effect) => effect.kind === 'followUp.resolve')
    expect(resolved?.kind === 'followUp.resolve' && resolved.resolution).toMatchObject({
      itemId: item,
      resolvedBy: 'admin-user-1',
    })
    const event = historyOf(effects).find((e) => e.type === 'relationship.participant_admitted')
    expect(event?.payload).toMatchObject({ personId: priya, admittedBy: 'admin-user-1', itemId: item })

    const toRuth = bodies(effects)[0]!
    expect(toRuth.personId).toBe(ruth)
    expect(toRuth.body).toContain('Priya just joined Tuesday Women’s Group.')
    // And nothing to Priya, on admission as on joining.
    expect(bodies(effects).some((message) => message.personId === priya)).toBe(false)
  })

  it('refuses an item that names no open request', () => {
    expect(() => admit({ joinRequest: null })).toThrow(new GroupRefused('group.request_not_found'))
  })

  it('refuses when the group has ended since they asked, and leaves the item to the Admin', () => {
    expect(() => admit({ relationship: tuesdayGroup({ endedAt: now }) })).toThrow(
      new GroupRefused('group.request_group_ended'),
    )
    // Gone entirely -- the service found no relationship for the item to name.
    const { relationship: _gone, ...withoutTheGroup } = context({
      joinRequest: { itemId: item, personId: priya, relationshipId: group },
      relationship: tuesdayGroup(),
      contacts: { people: new Map([[priya, { fullName: 'Priya Raman', phone: '+15550400' }]]) },
    })
    expect(() =>
      handleCommand(
        { type: 'relationship.admit', ministryId: ministry, itemId: item, admittedBy: 'admin-user-1' },
        withoutTheGroup,
      ),
    ).toThrow(new GroupRefused('group.request_group_ended'))
  })

  it('resolves the item and joins nothing for somebody already in the group', () => {
    const { effects } = admit({
      relationship: tuesdayGroup({
        members: [
          { personId: ruth, role: 'leader', fullName: 'Ruth Adeyemi', phone: '+15550101' },
          { personId: priya, role: 'participant', fullName: 'Priya Raman', phone: '+15550400' },
        ],
      }),
    })
    expect(kinds(effects)).toEqual(['followUp.resolve'])
  })
})

describe('an Admin naming a group and choosing its door', () => {
  const configure = (over: {
    readonly name?: string | null
    readonly joinRequiresApproval?: boolean
    readonly relationship?: RelationshipSnapshot
  } = {}) =>
    handleCommand(
      {
        type: 'group.configure',
        ministryId: ministry,
        relationshipId: group,
        name: over.name === undefined ? 'Tuesday Women’s Group' : over.name,
        joinRequiresApproval: over.joinRequiresApproval ?? true,
        changedBy: 'admin-user-1',
      },
      context({ relationship: over.relationship ?? tuesdayGroup() }),
    )

  it('records both, with who changed them', () => {
    const { effects } = configure({ name: '  Tuesday Women’s Group  ', joinRequiresApproval: true })
    const configured = effects.find((effect) => effect.kind === 'group.configure')
    expect(configured?.kind === 'group.configure' && configured.configuration).toEqual({
      ministryId: ministry,
      relationshipId: group,
      name: 'Tuesday Women’s Group',
      joinRequiresApproval: true,
    })
    expect(historyOf(effects)[0]).toMatchObject({
      type: 'relationship.group_configured',
      payload: { name: 'Tuesday Women’s Group', joinRequiresApproval: true, changedBy: 'admin-user-1' },
    })
  })

  it('refuses to name a group nothing', () => {
    expect(() => configure({ name: '' })).toThrow(new GroupRefused('group.name_missing'))
    expect(() => configure({ name: null })).toThrow(new GroupRefused('group.name_missing'))
  })

  it('refuses a group that has ended', () => {
    expect(() => configure({ relationship: tuesdayGroup({ endedAt: now }) })).toThrow(
      new GroupRefused('group.relationship_ended'),
    )
  })
})

describe('what a named group is called in the weekly question', () => {
  const james = personId('00000000-0000-4000-8000-0000000000d0')

  const leads = (name: string | null): CheckInSnapshot => ({
    personId: james,
    phone: '+15550100001',
    timeZone: 'UTC',
    leads: [
      {
        relationshipId: group,
        role: 'leader',
        startedAt: new Date('2026-03-01T09:00:00Z'),
        participantNames: ['Emily', 'Ruth', 'Priya'],
        name,
        acceptedAt: new Date('2026-03-02T09:00:00Z'),
        paused: false,
        cadence: { day: 1, hour: 9 },
      },
    ],
    openSequence: null,
    lastCheckInAt: new Date('2026-03-02T09:00:00Z'),
  })

  const start = (name: string | null) =>
    handleCommand(
      { type: 'checkin.start', ministryId: ministry, personId: james },
      context({ ministryName: 'ABC Church', checkIn: leads(name) }),
    )

  it('asks about the group by its name where it has one', () => {
    expect(bodies(start('Tuesday Women’s Group').effects)[0]!.body).toBe(
      'ABC Church: Did you meet with Tuesday Women’s Group this week? Reply 1 for yes, 2 for no.',
    )
  })

  it('lists the people where nobody has named it', () => {
    expect(bodies(start(null).effects)[0]!.body).toContain(
      'Did you meet with Emily, Ruth and Priya this week?',
    )
  })
})
