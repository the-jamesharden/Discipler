import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import { createTestClock, hours } from '~/domain/clock'
import {
  checkInPromptId,
  checkInSequenceId,
  type CheckInRelationship,
  type CheckInSnapshot,
  type OpenPrompt,
  type OpenSequence,
} from '~/domain/check-in'
import type { Effect } from '~/domain/effects'
import {
  concernId,
  createSequentialIds,
  ministryId,
  personId,
  relationshipId,
} from '~/domain/ids'

/**
 * A Concern is the most sensitive text in the product, and the four things that
 * make it different from every other record are all provable here: it becomes a
 * record of its own the moment a Leader types it, viewing it is recorded, so is
 * resolving it, and resolving clears the words unless somebody deliberately keeps
 * them.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const james = personId('00000000-0000-4000-8000-0000000000d0')
const emily = relationshipId('00000000-0000-4000-8000-0000000000b1')
const sequenceId = checkInSequenceId('00000000-0000-4000-8000-0000000000e1')
const promptId = checkInPromptId('00000000-0000-4000-8000-0000000000f1')
const raised = concernId('00000000-0000-4000-8000-0000000000c1')

const admin = '11111111-1111-4111-8111-111111111111'

const asked = new Date('2026-08-24T19:00:00Z')

const leads: CheckInRelationship = {
  relationshipId: emily,
  role: 'leader',
  startedAt: new Date('2026-03-02T09:00:00Z'),
  participantNames: ['Emily'],
  acceptedAt: new Date('2026-03-02T09:00:00Z'),
  paused: false,
  cadence: { day: 1, hour: 20 },
}

const awaiting = (over: Partial<OpenPrompt> = {}): OpenPrompt => ({
  promptId,
  relationshipId: emily,
  position: 1,
  question: 'concern_detail',
  askedAt: asked,
  remindedAt: null,
  clarificationsSent: 0,
  ...over,
})

const openSequence = (over: Partial<OpenSequence> = {}): OpenSequence => ({
  sequenceId,
  startedAt: asked,
  covering: [leads],
  awaiting: awaiting(),
  ...over,
})

const snapshot = (over: Partial<CheckInSnapshot> = {}): CheckInSnapshot => ({
  personId: james,
  phone: '+15550100001',
  timeZone: 'Europe/London',
  leads: [leads],
  openSequence: openSequence(),
  lastCheckInAt: asked,
  ...over,
})

const context = (at: Date): Omit<CommandContext, 'checkIn'> => ({
  ministryId: ministry,
  clock: createTestClock(at),
  ids: createSequentialIds(),
  ministryName: 'ABC Church',
  appBaseUrl: 'https://discipler.example',
})

const replying = (body: string, at: Date = new Date(asked.getTime() + hours(1))) =>
  handleCommand({ type: 'sms.inbound', ministryId: ministry, personId: james, body }, {
    ...context(at),
    checkIn: snapshot(),
  } satisfies CommandContext)

const concernOf = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'concern.raise' ? [effect.concern] : []))[0]

const eventOf = (effects: readonly Effect[], type: string) =>
  effects.flatMap((effect) =>
    effect.kind === 'history.append' && effect.event.type === type ? [effect.event] : [],
  )[0]

describe('a Leader typing what is wrong', () => {
  const result = replying('He has lost his job and they are barely speaking.')

  it('raises a Concern of its own, not only a reply on the prompt', () => {
    expect(concernOf(result.effects)).toMatchObject({
      relationshipId: emily,
      raisedBy: james,
      detail: 'He has lost his job and they are barely speaking.',
    })
  })

  it('still records the reply against the question that asked for it', () => {
    expect(
      result.effects.filter((effect) => effect.kind === 'checkin.answer'),
    ).toMatchObject([{ answer: { promptId, detail: 'He has lost his job and they are barely speaking.' } }])
  })

  it('keeps the words out of history, which is append-only and cannot be cleared', () => {
    const event = eventOf(result.effects, 'concern.raised')

    expect(event).toMatchObject({ subjectType: 'relationship', subjectId: emily })
    expect(JSON.stringify(event?.payload)).not.toContain('lost his job')
  })

  it('raises nothing on a reply that is not Concern detail', () => {
    const met = handleCommand(
      { type: 'sms.inbound', ministryId: ministry, personId: james, body: '1' },
      {
        ...context(new Date(asked.getTime() + hours(1))),
        checkIn: snapshot({ openSequence: openSequence({ awaiting: awaiting({ question: 'met' }) }) }),
      } satisfies CommandContext,
    )

    expect(concernOf(met.effects)).toBeUndefined()
  })
})

describe('an Admin opening a Concern', () => {
  const result = handleCommand(
    { type: 'concern.view', ministryId: ministry, concernId: raised, viewedBy: admin },
    context(asked) satisfies CommandContext,
  )

  it('records the viewing against the Admin who did it', () => {
    expect(
      result.effects.flatMap((effect) => (effect.kind === 'concern.view' ? [effect.viewing] : [])),
    ).toMatchObject([{ concernId: raised, viewedBy: admin, viewedAt: asked }])
  })

  it('appends it to history, so who read what survives the account that read it', () => {
    expect(eventOf(result.effects, 'concern.viewed')).toMatchObject({
      subjectType: 'concern',
      subjectId: raised,
      payload: { viewedBy: admin },
    })
  })
})

describe('an Admin resolving a Concern', () => {
  const resolving = () =>
    handleCommand(
      {
        type: 'concern.resolve',
        ministryId: ministry,
        concernId: raised,
        resolvedBy: admin,
      },
      context(asked) satisfies CommandContext,
    )

  it('resolves it, so nothing accumulates a file of hard weeks', () => {
    expect(
      resolving().effects.flatMap((effect) =>
        effect.kind === 'concern.resolve' ? [effect.resolution] : [],
      ),
    ).toMatchObject([{ concernId: raised, resolvedBy: admin }])
  })

  it('offers no way to keep the words, because there is no exception to take', () => {
    // Not a default that a caller may override. The resolution carries no field
    // for it, so a route cannot ask and a route cannot forget.
    const [resolution] = resolving().effects.flatMap((effect) =>
      effect.kind === 'concern.resolve' ? [effect.resolution] : [],
    )

    expect(resolution).not.toHaveProperty('keepDetail')
  })

  it('records who closed it', () => {
    expect(eventOf(resolving().effects, 'concern.resolved')).toMatchObject({
      subjectType: 'concern',
      subjectId: raised,
      payload: { resolvedBy: admin },
    })
  })
})
