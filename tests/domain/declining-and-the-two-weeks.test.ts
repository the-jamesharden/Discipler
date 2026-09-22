import { describe, expect, it } from 'vitest'
import { roleNoun } from '~/domain/ministry-settings'
import {
  handleCommand,
  type CommandContext,
  type InvitationHeld,
  type InvitationSnapshot,
  type InvitedMember,
  type RelationshipMember,
  type RelationshipSnapshot,
  type UnacceptedRelationship,
} from '~/domain/boundary'
import { createTestClock, days } from '~/domain/clock'
import type { Command } from '~/domain/commands'
import { InvitationRefused, ReinvitationRefused } from '~/domain/errors'
import {
  createSequentialIds,
  followUpItemId,
  materialId,
  ministryId,
  personId,
  relationshipId,
} from '~/domain/ids'
import { invitationState, invitationToken } from '~/domain/invitations'
import { materialTitle } from '~/domain/materials'
import { ACCEPTANCE_ESCALATION_DAYS } from '~/domain/relationships'

/**
 * Manual pairing, recut ticket 06: the two ways an invitation ends without being
 * accepted, decided by James on 2026-09-21. A Leader declines on the page their
 * link opens, or nobody answers and the product withdraws it at two weeks. The
 * same act either way, and only the item that tells the Admin differs.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const relationship = relationshipId('00000000-0000-4000-8000-0000000000bb')
const claire = personId('00000000-0000-4000-8000-0000000000c1')
const grace = personId('00000000-0000-4000-8000-0000000000c2')
const sam = personId('00000000-0000-4000-8000-0000000000e1')
const ana = personId('00000000-0000-4000-8000-0000000000e2')

const token = invitationToken('claires-token')
const invitedAt = new Date('2026-03-02T09:00:00Z')
const expiresAt = new Date('2026-03-16T09:00:00Z')
const aWeekIn = new Date('2026-03-09T09:00:00Z')
const justAfter = new Date(expiresAt.getTime() + 1)

const leader = (id: typeof claire, fullName: string, acceptedAt: Date | null = null) =>
  ({ personId: id, role: 'leader', fullName, phone: `+1555010${id.slice(-1)}`, acceptedAt }) satisfies InvitedMember

const disciple = (id: typeof sam, fullName: string) =>
  ({ personId: id, role: 'participant', fullName, phone: `+1555020${id.slice(-1)}`, acceptedAt: null }) satisfies InvitedMember

/** Claire, added to Grace's group, which has been running since January. */
const onARunningGroup = (over: Partial<InvitationSnapshot> = {}): InvitationSnapshot => ({
  relationshipId: relationship,
  personId: claire,
  expiresAt,
  consumedAt: null,
  withdrawnAs: null,
  relationshipAcceptedAt: new Date('2026-01-05T09:00:00Z'),
  unansweredItemId: null,
  intendedMaterialId: null,
  members: [
    leader(grace, 'Grace Lee', new Date('2026-01-05T09:00:00Z')),
    leader(claire, 'Claire Martinez'),
    disciple(sam, 'Sam Lee'),
    disciple(ana, 'Ana Ruiz'),
  ],
  ...over,
})

/** The same group, formed with both of them and started by nobody yet. */
const awaitingBoth = (graceAcceptedAt: Date | null, over: Partial<InvitationSnapshot> = {}) =>
  onARunningGroup({
    relationshipAcceptedAt: null,
    members: [
      leader(grace, 'Grace Lee', graceAcceptedAt),
      leader(claire, 'Claire Martinez'),
      disciple(sam, 'Sam Lee'),
      disciple(ana, 'Ana Ruiz'),
    ],
    ...over,
  })

const aOneToOne = (over: Partial<InvitationSnapshot> = {}) =>
  onARunningGroup({
    relationshipAcceptedAt: null,
    members: [leader(claire, 'Claire Martinez'), disciple(sam, 'Sam Lee')],
    ...over,
  })

const context = (invitation: InvitationSnapshot, at: Date): CommandContext => ({
  ministryId: ministry,
  clock: createTestClock(at),
  ids: createSequentialIds(),
  ministryName: 'Riverside Chapel',
  language: { leaderNoun: roleNoun('mentor'), participantNoun: roleNoun('mentee') },
  appBaseUrl: 'https://discipler.example',
  materials: [],
  invitation,
})

const decline = (invitation: InvitationSnapshot, at = aWeekIn) =>
  handleCommand({ type: 'invitation.decline', ministryId: ministry, token }, context(invitation, at))

const expire = (invitation: InvitationSnapshot, at = justAfter) =>
  handleCommand({ type: 'invitation.expire', ministryId: ministry, token }, context(invitation, at))

type Result = ReturnType<typeof decline>

const withdrawal = (result: Result) => {
  const effect = result.effects.find((each) => each.kind === 'invitation.withdraw')
  if (effect?.kind !== 'invitation.withdraw') throw new Error('nothing was withdrawn')
  return effect.withdrawal
}
const raised = (result: Result) =>
  result.effects.flatMap((each) => (each.kind === 'followUp.raise' ? [each.item] : []))
const resolved = (result: Result) =>
  result.effects.flatMap((each) => (each.kind === 'followUp.resolve' ? [each.resolution] : []))
const history = (result: Result) =>
  result.effects.flatMap((each) => (each.kind === 'history.append' ? [each.event] : []))
const messages = (result: Result) =>
  result.effects.flatMap((each) => (each.kind === 'message.enqueue' ? [each.message] : []))
const kinds = (result: Result) => result.effects.map((each) => each.kind)

// Both ways of ending one, through every criterion they share.
const BOTH = [
  { how: 'a decline', act: decline, at: aWeekIn, withdrawnAs: 'declined', item: 'match_declined', event: 'relationship.leader_declined', by: 'decline' },
  { how: 'the two weeks', act: expire, at: justAfter, withdrawnAs: 'expired', item: 'invitation_expired', event: 'relationship.invitation_expired', by: 'expiry' },
] as const

describe.each(BOTH)('$how', ({ act, at, withdrawnAs, item, event, by }) => {
  it('withdraws the invitation and ends their unaccepted membership, as one effect', () => {
    expect(withdrawal(act(onARunningGroup(), at))).toEqual({
      ministryId: ministry,
      relationshipId: relationship,
      personId: claire,
      token,
      withdrawnAt: at,
      withdrawnAs,
      activatesRelationship: false,
    })
  })

  it('tells the Admin with an item about the Person, on the relationship', () => {
    expect(raised(act(onARunningGroup(), at))).toEqual([
      { ministryId: ministry, kind: item, personId: claire, relationshipId: relationship, raisedAt: at },
    ])
  })

  it('is recorded as an event of its own type, naming the Person and no Admin', () => {
    expect(history(act(onARunningGroup(), at))).toEqual([
      {
        ministryId: ministry,
        occurredAt: at,
        type: event,
        subjectType: 'relationship',
        subjectId: relationship,
        payload: { personId: claire, activated: false },
      },
    ])
  })

  it('changes nothing else about a group that is running, and sends nobody anything', () => {
    const result = act(onARunningGroup(), at)
    expect(kinds(result).sort()).toEqual(['followUp.raise', 'history.append', 'invitation.withdraw'])
    expect(messages(result)).toEqual([])
  })

  it('activates a group nobody had started where every Leader left has accepted, once', () => {
    const result = act(awaitingBoth(invitedAt), at)

    expect(withdrawal(result).activatesRelationship).toBe(true)
    expect(history(result).filter((each) => each.type === 'relationship.activated')).toHaveLength(1)
    expect(history(result).find((each) => each.type === event)?.payload).toEqual({
      personId: claire,
      activated: true,
    })
    // The Material history opens with it, as it does when the last Leader accepts.
    expect(result.effects.filter((each) => each.kind === 'material.assign')).toHaveLength(1)
  })

  it('sends that group its one Starter Message, and none to the Leader who is gone', () => {
    const sent = messages(act(awaitingBoth(invitedAt), at))

    expect(sent.map((message) => message.personId).sort()).toEqual([ana, grace, sam].sort())
    expect(sent.find((message) => message.personId === sam)?.body).toContain('Grace Lee')
    expect(sent.find((message) => message.personId === sam)?.body).not.toContain('Claire')
  })

  it('spends the Material an Admin chose at pairing, as the last acceptance would', () => {
    const romans = materialId('00000000-0000-4000-8000-0000000000f1')
    const result = handleCommand(
      { type: withdrawnAs === 'declined' ? 'invitation.decline' : 'invitation.expire', ministryId: ministry, token },
      {
        ...context(awaitingBoth(invitedAt, { intendedMaterialId: romans }), at),
        materials: [{ id: romans, title: materialTitle('Romans'), body: null, pdf: null, inUseBy: 0 }],
      },
    )
    const assigned = result.effects.flatMap((each) =>
      each.kind === 'material.assign' ? [each.assignment.materialId] : [],
    )
    expect(assigned).toEqual([null, romans])
  })

  it('activates nothing while another Leader has still to answer', () => {
    const result = act(awaitingBoth(null), at)
    expect(withdrawal(result).activatesRelationship).toBe(false)
    expect(messages(result)).toEqual([])
  })

  it('leaves a relationship whose only Leader it was with no Leader, and does not cancel it', () => {
    const result = act(aOneToOne(), at)

    expect(withdrawal(result).activatesRelationship).toBe(false)
    expect(kinds(result)).not.toContain('relationship.cancel')
    expect(messages(result)).toEqual([])
  })

  describe('an open Awaiting acceptance item about the same relationship', () => {
    const open = followUpItemId('00000000-0000-4000-8000-0000000000f0')

    it('is closed by the same act where nobody is left to answer, with no Admin on it', () => {
      for (const invitation of [
        onARunningGroup({ unansweredItemId: open }),
        awaitingBoth(invitedAt, { unansweredItemId: open }),
      ]) {
        const result = act(invitation, at)
        expect(resolved(result)).toEqual([
          { ministryId: ministry, itemId: open, resolvedBy: null, resolvedAt: at },
        ])
        expect(history(result).find((each) => each.type === 'follow_up.resolved')?.payload).toEqual({
          resolvedBy: null,
          by,
        })
      }
    })

    it('stands while somebody else has still to answer', () => {
      expect(resolved(act(awaitingBoth(null, { unansweredItemId: open }), at))).toEqual([])
    })

    it('stands on a relationship left with no Leader, because it is what offers Cancel', () => {
      expect(resolved(act(aOneToOne({ unansweredItemId: open }), at))).toEqual([])
    })
  })
})

describe('declining', () => {
  it('is refused on a link that has run out, been spent, or been declined already', () => {
    const refusal = (invitation: InvitationSnapshot, at = aWeekIn) => {
      try {
        decline(invitation, at)
      } catch (error) {
        if (error instanceof InvitationRefused) return error.refusal
        throw error
      }
      return null
    }

    expect(refusal(onARunningGroup(), justAfter)).toBe('invitation.expired')
    expect(refusal(onARunningGroup({ consumedAt: aWeekIn }))).toBe('invitation.already_used')
    expect(refusal(onARunningGroup({ withdrawnAs: 'declined' }))).toBe('invitation.declined')
    expect(refusal(onARunningGroup({ withdrawnAs: 'expired' }))).toBe('invitation.expired')
  })

  it('is a Leader’s, and never ends a membership that has begun leading', () => {
    expect(() => decline(onARunningGroup({ personId: sam }))).toThrow(InvitationRefused)
    expect(() =>
      decline(
        onARunningGroup({
          members: [leader(claire, 'Claire Martinez', invitedAt), disciple(sam, 'Sam Lee')],
        }),
      ),
    ).toThrow(InvitationRefused)
  })

  it('leaves a declined link opening nothing but what a declined link says', () => {
    const declined = { expiresAt, consumedAt: null, withdrawnAs: 'declined' as const }
    expect(invitationState(declined, aWeekIn)).toBe('declined')
    // Still declined once its fortnight is over: it did not run out, she said no.
    expect(invitationState(declined, justAfter)).toBe('declined')
    expect(invitationState({ ...declined, withdrawnAs: 'expired' }, aWeekIn)).toBe('expired')
  })
})

describe('an Admin taking an invitation back (Unpair, James 2026-09-21)', () => {
  const withdraw = (invitation: InvitationSnapshot, at = aWeekIn) =>
    handleCommand(
      { type: 'invitation.withdraw', ministryId: ministry, token, withdrawnBy: 'admin-user-1' },
      context(invitation, at),
    )

  it('withdraws the invitation and ends their unaccepted membership, as a decline does', () => {
    expect(withdrawal(withdraw(onARunningGroup()))).toEqual({
      ministryId: ministry,
      relationshipId: relationship,
      personId: claire,
      token,
      withdrawnAt: aWeekIn,
      withdrawnAs: 'withdrawn',
      activatesRelationship: false,
    })
  })

  it('raises nothing, because the Admin who would be told is the one who did it', () => {
    expect(raised(withdraw(onARunningGroup()))).toEqual([])
  })

  it('is recorded as an event of its own type, naming the Person and the Admin', () => {
    expect(history(withdraw(onARunningGroup()))).toEqual([
      expect.objectContaining({
        type: 'relationship.invitation_withdrawn',
        subjectId: relationship,
        payload: { personId: claire, activated: false, withdrawnBy: 'admin-user-1' },
      }),
    ])
  })

  it('changes nothing else about a group that is running, and sends nobody anything', () => {
    const result = withdraw(onARunningGroup())
    expect(messages(result)).toEqual([])
    expect(kinds(result)).toEqual(['invitation.withdraw', 'history.append'])
  })

  it('takes back one that has run out and not been swept yet, which a decline cannot', () => {
    expect(withdrawal(withdraw(onARunningGroup(), justAfter)).withdrawnAs).toBe('withdrawn')
  })

  it('is refused on a link that has been spent or withdrawn already, and never ends a membership that has begun leading', () => {
    const refusal = (invitation: InvitationSnapshot) => {
      try {
        withdraw(invitation)
      } catch (error) {
        if (error instanceof InvitationRefused) return error.refusal
        throw error
      }
      return null
    }
    expect(refusal(onARunningGroup({ consumedAt: aWeekIn }))).toBe('invitation.already_used')
    expect(refusal(onARunningGroup({ withdrawnAs: 'declined' }))).toBe('invitation.declined')
    expect(refusal(onARunningGroup({ withdrawnAs: 'withdrawn' }))).toBe('invitation.expired')
    expect(
      refusal(onARunningGroup({ members: [leader(claire, 'Claire Martinez', invitedAt), disciple(sam, 'Sam Lee')] })),
    ).toBe('invitation.already_used')
  })

  it('leaves the link opening what a link that has run out says: ask for a new one', () => {
    expect(invitationState({ expiresAt, consumedAt: null, withdrawnAs: 'withdrawn' }, aWeekIn)).toBe('expired')
  })
})

describe('the two weeks', () => {
  it('withdraws nothing up to and including the expiry, which is when it can still be accepted', () => {
    expect(expire(onARunningGroup(), aWeekIn).effects).toEqual([])
    expect(expire(onARunningGroup(), expiresAt).effects).toEqual([])
    expect(withdrawal(expire(onARunningGroup(), justAfter)).withdrawnAs).toBe('expired')
  })

  it('is started again by a new invitation sent before they are up', () => {
    const resent = onARunningGroup({ expiresAt: new Date(justAfter.getTime() + days(14)) })
    expect(expire(resent, justAfter).effects).toEqual([])
  })

  it('withdraws nothing from somebody who accepted in the same moment, and refuses nothing', () => {
    // Read behind the row the acceptance held: the link spent, the membership
    // accepted. Nobody is asking, so none of it is a refusal.
    const accepted = onARunningGroup({
      consumedAt: expiresAt,
      members: [leader(claire, 'Claire Martinez', expiresAt), disciple(sam, 'Sam Lee')],
    })
    expect(expire(accepted).effects).toEqual([])
    expect(expire(onARunningGroup({ withdrawnAs: 'declined' })).effects).toEqual([])
    expect(expire(onARunningGroup({ members: [disciple(sam, 'Sam Lee')] })).effects).toEqual([])
  })
})

describe('the Unaccepted flag', () => {
  const tick = (relationships: readonly UnacceptedRelationship[], at: Date) =>
    handleCommand({ type: 'scheduled.tick', ministryId: ministry }, {
      ministryId: ministry,
      clock: createTestClock(at),
      ids: createSequentialIds(),
      ministryName: 'Riverside Chapel',
      appBaseUrl: 'https://discipler.example',
      unaccepted: relationships,
      checkInsDue: [],
      paused: [],
    })

  const waiting = (alreadyRunning: boolean): UnacceptedRelationship => ({
    relationshipId: relationship,
    waitingSince: invitedAt,
    alreadyRunning,
    awaiting: [
      {
        personId: claire,
        fullName: 'Claire Martinez',
        phone: '+15550101',
        token,
        linkExpiresAt: expiresAt,
        remindedAt: null,
      },
    ],
    itemStandsOpen: false,
  })
  const atTheThreshold = new Date(invitedAt.getTime() + days(ACCEPTANCE_ESCALATION_DAYS))

  it('is no longer raised for a Leader added to a relationship already running', () => {
    expect(raised(tick([waiting(true)], atTheThreshold))).toEqual([])
  })

  it('is still raised for a relationship nobody has activated', () => {
    expect(raised(tick([waiting(false)], atTheThreshold)).map((item) => item.kind)).toEqual([
      'relationship_unaccepted',
    ])
  })

  it('leaves the reminder text to the Leader as it was, running or not', () => {
    for (const alreadyRunning of [true, false]) {
      const sent = messages(tick([waiting(alreadyRunning)], atTheThreshold))
      expect(sent.map((message) => message.personId)).toEqual([claire])
    }
  })
})

describe('Copy link to re-invite leader', () => {
  const admin = 'admin-user-1'
  const member = (id: typeof claire, role: 'leader' | 'participant', acceptedAt: Date | null = null) =>
    ({ personId: id, role, fullName: 'Somebody', phone: null, acceptedAt }) satisfies RelationshipMember

  const group = (members: readonly RelationshipMember[], over: Partial<RelationshipSnapshot> = {}) =>
    ({
      relationshipId: relationship,
      createdAt: invitedAt,
      acceptedAt: invitedAt,
      endedAt: null,
      name: 'Grace’s Group',
      joinRequiresApproval: false,
      declaredGender: null,
      pause: null,
      members,
      ...over,
    }) satisfies RelationshipSnapshot

  const copy = (
    snapshot: RelationshipSnapshot,
    held: InvitationHeld = { liveExpiresAt: null, everWithdrawn: true },
  ) => {
    const command: Command = {
      type: 'invitation.copy_link',
      ministryId: ministry,
      relationshipId: relationship,
      personId: claire,
      copiedBy: admin,
    }
    return handleCommand(command, {
      ministryId: ministry,
      clock: createTestClock(justAfter),
      ids: createSequentialIds(),
      appBaseUrl: 'https://discipler.example',
      relationship: snapshot,
      contacts: { people: new Map([[claire, { fullName: 'Claire Martinez', phone: '+15550101' }]]) },
      invitationHeld: held,
    })
  }

  const withdrawnFrom = group([member(grace, 'leader', invitedAt), member(sam, 'participant')])

  it('puts her back on the relationship as somebody invited, with a fresh fortnight', () => {
    const result = copy(withdrawnFrom)

    expect(result.effects.find((each) => each.kind === 'relationship.add_leader')).toEqual({
      kind: 'relationship.add_leader',
      membership: { ministryId: ministry, relationshipId: relationship, personId: claire, startedAt: justAfter },
    })
    const issued = result.effects.find((each) => each.kind === 'invitation.issue')
    if (issued?.kind !== 'invitation.issue') throw new Error('no invitation was issued')
    expect(issued.invitation.expiresAt).toEqual(new Date(justAfter.getTime() + days(14)))
    expect(issued.invitation.personId).toBe(claire)
  })

  it('sends her nothing', () => {
    expect(messages(copy(withdrawnFrom))).toEqual([])
  })

  it('records every copy with the Admin who made it and the Person, and never the link', () => {
    const result = copy(withdrawnFrom)
    const issued = result.effects.find((each) => each.kind === 'invitation.issue')
    const token = issued?.kind === 'invitation.issue' ? issued.invitation.token : ''

    expect(history(result)).toEqual([
      {
        ministryId: ministry,
        occurredAt: justAfter,
        type: 'invitation.link_copied',
        subjectType: 'relationship',
        subjectId: relationship,
        payload: {
          personId: claire,
          copiedBy: admin,
          reinvited: true,
          expiresAt: new Date(justAfter.getTime() + days(14)).toISOString(),
        },
      },
    ])
    expect(JSON.stringify(history(result))).not.toContain(token)
  })

  it('replaces the link she holds where she is already invited again, and adds her to nothing twice', () => {
    const invitedAgain = group([
      member(grace, 'leader', invitedAt),
      member(claire, 'leader'),
      member(sam, 'participant'),
    ])
    const result = copy(invitedAgain, { liveExpiresAt: expiresAt, everWithdrawn: true })

    expect(kinds(result).sort()).toEqual(['history.append', 'invitation.reissue'])
    expect(history(result)[0]?.payload).toMatchObject({
      reinvited: false,
      supersededExpiresAt: expiresAt.toISOString(),
    })
  })

  it('is refused where there is nobody to invite, and where it would be no re-invitation', () => {
    const refusal = (...args: Parameters<typeof copy>) => {
      try {
        copy(...args)
      } catch (error) {
        if (error instanceof ReinvitationRefused) return error.refusal
        throw error
      }
      return null
    }

    expect(refusal(group([member(claire, 'leader', aWeekIn)]))).toBe('reinvite.already_accepted')
    expect(refusal(group([member(claire, 'participant')]))).toBe('reinvite.already_in_it')
    expect(refusal(group([], { endedAt: aWeekIn }))).toBe('reinvite.relationship_has_ended')
    expect(refusal(withdrawnFrom, { liveExpiresAt: null, everWithdrawn: false })).toBe(
      'reinvite.never_invited',
    )
  })
})
