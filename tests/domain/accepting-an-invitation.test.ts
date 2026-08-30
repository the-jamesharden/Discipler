import { describe, expect, it } from 'vitest'
import {
  handleCommand,
  type CommandContext,
  type InvitationSnapshot,
  type InvitedMember,
} from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import { InvitationRefused } from '~/domain/errors'
import { createSequentialIds, ministryId, personId, relationshipId } from '~/domain/ids'
import { invitationToken } from '~/domain/invitations'

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const relationship = relationshipId('00000000-0000-4000-8000-0000000000bb')
const david = personId('00000000-0000-4000-8000-0000000000d1')
const sarah = personId('00000000-0000-4000-8000-0000000000d2')
const emily = personId('00000000-0000-4000-8000-0000000000e1')

const token = invitationToken('a-token')
const now = new Date('2026-03-02T09:00:00Z')
const expiresAt = new Date('2026-03-16T09:00:00Z')

const leader = (id: typeof david, fullName: string, acceptedAt: Date | null = null) =>
  ({ personId: id, role: 'leader', fullName, phone: '+1555010' + id.slice(-1), acceptedAt }) satisfies InvitedMember

const participant = (id: typeof emily, fullName: string) =>
  ({ personId: id, role: 'participant', fullName, phone: '+15550200', acceptedAt: null }) satisfies InvitedMember

const snapshot = (over: Partial<InvitationSnapshot> = {}): InvitationSnapshot => ({
  relationshipId: relationship,
  personId: david,
  expiresAt,
  consumedAt: null,
  members: [leader(david, 'David Ellis'), participant(emily, 'Emily Johnson')],
  ...over,
})

const context = (invitation: InvitationSnapshot, at = now): CommandContext => ({
  ministryId: ministry,
  clock: createTestClock(at),
  ids: createSequentialIds(),
  ministryName: 'Riverside Chapel',
  appBaseUrl: 'https://discipler.example',
  invitation,
})

const accept = (invitation = snapshot(), at = now, fullName = 'Dave Ellis') =>
  handleCommand(
    { type: 'relationship.accept', ministryId: ministry, token, fullName, userId: 'user-1' },
    context(invitation, at),
  )

const acceptance = (result: ReturnType<typeof accept>) => {
  const effect = result.effects.find((e) => e.kind === 'invitation.accept')
  if (effect?.kind !== 'invitation.accept') throw new Error('nothing was accepted')
  return effect.acceptance
}

const enqueued = (result: ReturnType<typeof accept>) =>
  result.effects.flatMap((e) => (e.kind === 'message.enqueue' ? [e.message] : []))

describe('what a Leader’s acceptance records', () => {
  it('stamps the moment they agreed, spends the token, and links the account', () => {
    expect(acceptance(accept())).toMatchObject({
      relationshipId: relationship,
      personId: david,
      token,
      userId: 'user-1',
      acceptedAt: now,
    })
  })

  it('stores the name as given, even where it differs from Intake', () => {
    // `Dave` against a roster's `David` is somebody telling Discipler something
    // true. It is not an error and raises nothing.
    expect(acceptance(accept()).fullName).toBe('Dave Ellis')
  })
})

describe('when the relationship activates', () => {
  it('activates on the only Leader accepting', () => {
    expect(acceptance(accept()).activatesRelationship).toBe(true)
  })

  it('does not activate while a co-leader has not yet agreed', () => {
    const result = accept(
      snapshot({
        members: [
          leader(david, 'David Ellis'),
          leader(sarah, 'Sarah Kim'),
          participant(emily, 'Emily Johnson'),
        ],
      }),
    )

    // Nobody co-leads something they did not agree to.
    expect(acceptance(result).activatesRelationship).toBe(false)
    expect(enqueued(result)).toEqual([])
  })

  it('activates on the last Leader accepting', () => {
    const result = accept(
      snapshot({
        members: [
          leader(david, 'David Ellis'),
          leader(sarah, 'Sarah Kim', new Date('2026-03-01T09:00:00Z')),
          participant(emily, 'Emily Johnson'),
        ],
      }),
    )

    expect(acceptance(result).activatesRelationship).toBe(true)
  })
})

describe('the Starter Message acceptance releases', () => {
  const result = accept()

  it('reaches everyone in the relationship', () => {
    expect(new Set(enqueued(result).map((m) => m.personId))).toEqual(new Set([david, emily]))
  })

  it('discloses nobody, in either direction', () => {
    // Each side is told the other side's names in the body, and no number is
    // sent to anyone. A Participant has never needed their Leader's number --
    // the Leader is the one who reaches out -- and no message to a Leader has
    // ever carried one.
    for (const message of enqueued(result)) {
      expect(message.disclosesPersonId).toBeNull()
    }
  })

  it('names the Leader to the Participant, and the Participant to the Leader', () => {
    expect(enqueued(result).find((m) => m.personId === david)?.body).toContain('Emily Johnson')
    expect(enqueued(result).find((m) => m.personId === emily)?.body).toContain('David Ellis')
  })

  it('sends one message per Participant, however many Leaders there are', () => {
    // It used to be one per Leader, because each carried that Leader's contact
    // details and contact sharing is one Person's decision. No message carries
    // them now, so there is nothing left that has to be answered per Leader.
    const coLed = accept(
      snapshot({
        members: [
          leader(david, 'David Ellis'),
          // Already agreed, so David's is the acceptance that activates it.
          leader(sarah, 'Sarah Kim', new Date('2026-03-01T09:00:00Z')),
          participant(emily, 'Emily Johnson'),
        ],
      }),
    )

    const toParticipant = enqueued(coLed).filter((m) => m.personId === emily)

    expect(toParticipant).toHaveLength(1)
    expect(toParticipant[0]?.body).toContain('David Ellis and Sarah Kim')
  })

  it('gives the Participant a link of their own, which is not the Leader’s', () => {
    // Minted, and no longer texted to them: the Starter Message named it until
    // the copy was settled. It is what makes `match.decline` answerable at all,
    // and whether a Participant should have a self-serve route to it is in
    // `docs/open-questions.md`.
    const issued = result.effects.flatMap((e) =>
      e.kind === 'invitation.issue' ? [e.invitation] : [],
    )

    expect(issued.map((i) => i.personId)).toEqual([emily])
    expect(issued[0]?.token).not.toBe(token)
    expect(enqueued(result).find((m) => m.personId === emily)?.body).not.toContain(
      issued[0]?.token,
    )
  })
})

describe('a token that cannot do what is asked of it', () => {
  it('refuses once the window has passed', () => {
    expect(() => accept(snapshot(), new Date('2026-03-17T09:00:00Z'))).toThrow(
      new InvitationRefused('invitation.expired'),
    )
  })

  it('refuses once account creation has consumed it', () => {
    expect(() => accept(snapshot({ consumedAt: new Date('2026-03-03T09:00:00Z') }))).toThrow(
      new InvitationRefused('invitation.already_used'),
    )
  })

  it('survives being opened and abandoned right up to the expiry', () => {
    expect(() => accept(snapshot(), expiresAt)).not.toThrow()
  })

  it('refuses a Participant trying to accept on a forwarded link', () => {
    expect(() =>
      accept(snapshot({ personId: emily })),
    ).toThrow(new InvitationRefused('invitation.not_a_leader'))
  })
})

describe('the two things a token raises instead of changing', () => {
  const raised = (command: 'invitation.dispute_number' | 'match.decline', holder = david) =>
    handleCommand(
      { type: command, ministryId: ministry, token },
      context(snapshot({ personId: holder })),
    )

  it('raises a persistent item when a Leader says the number is not theirs', () => {
    const result = raised('invitation.dispute_number')
    const item = result.effects.find((e) => e.kind === 'followUp.raise')

    if (item?.kind !== 'followUp.raise') throw new Error('nothing was raised')
    expect(item.item).toMatchObject({
      kind: 'invitation_number_disputed',
      personId: david,
      relationshipId: relationship,
      raisedAt: now,
    })
  })

  it('changes nothing else: a forwarded link can never re-point an account', () => {
    const result = raised('invitation.dispute_number')

    expect(result.effects.map((e) => e.kind).sort()).toEqual([
      'followUp.raise',
      'history.append',
    ])
  })

  it('raises a persistent item when a Participant says the match is not right', () => {
    const result = raised('match.decline', emily)
    const item = result.effects.find((e) => e.kind === 'followUp.raise')

    if (item?.kind !== 'followUp.raise') throw new Error('nothing was raised')
    expect(item.item.kind).toBe('match_declined')
  })

  it('keeps each affordance to the role it belongs to', () => {
    expect(() => raised('match.decline', david)).toThrow(
      new InvitationRefused('invitation.not_a_participant'),
    )
    expect(() => raised('invitation.dispute_number', emily)).toThrow(
      new InvitationRefused('invitation.not_a_leader'),
    )
  })
})
