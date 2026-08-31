import { describe, expect, it } from 'vitest'
import {
  handleCommand,
  type CommandContext,
  type IntakeLinkSnapshot,
} from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import type { Effect } from '~/domain/effects'
import { INTAKE_LINK_LIFETIME_DAYS, intakeLinkToken } from '~/domain/intake-link'
import { createSequentialIds, ministryId, personId } from '~/domain/ids'

/**
 * The link an Admin hands a Person so they can correct their own answers. It is
 * the only route by which a Participant's availability changes: there is no
 * Participant dashboard and no SMS path for it, and nothing about the link gives
 * anybody an account.
 *
 * Issuing it sends nothing. The Admin copies it and passes it on themselves,
 * because the thing it most often exists to correct is the number Discipler would
 * have texted it to.
 *
 * Asking for it is idempotent while one stands, which is the other half of the same
 * thought: an Admin who closed the tab and came back is asking to see the link, not
 * asking to break the one they already sent.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const ruth = personId('00000000-0000-4000-8000-0000000000d0')
const at = new Date('2026-09-14T10:00:00Z')

const reopen = (held: IntakeLinkSnapshot | null = null) =>
  handleCommand(
    { type: 'intake.reopen', ministryId: ministry, personId: ruth },
    {
      ministryId: ministry,
      clock: createTestClock(at),
      ids: createSequentialIds(),
      intakeLinkHeld: held,
    } satisfies CommandContext,
  )

const heldUntil = (expiresAt: Date): IntakeLinkSnapshot => ({
  personId: ruth,
  token: intakeLinkToken('a-link-already-sent'),
  expiresAt,
})

const links = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'intake_link.issue' ? [effect.link] : []))

const messages = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'message.enqueue' ? [effect.message] : []))

const history = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'history.append' ? [effect.event] : []))

describe('reopening someone’s Intake', () => {
  it('issues a token against the Person, dated and with an end to it', () => {
    const [link] = links(reopen().effects)

    expect(link).toMatchObject({ ministryId: ministry, personId: ruth, createdAt: at })
    expect(link?.token).toBeTruthy()
    expect(link?.expiresAt.getTime()).toBe(
      at.getTime() + INTAKE_LINK_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
    )
  })

  it('sends nobody anything', () => {
    // The Admin hands the link over themselves. Texting it to the number already on
    // file is self-defeating when a wrong number is what the Person is correcting.
    expect(messages(reopen().effects)).toEqual([])
  })

  it('records that a link was issued, because a credential handed out is a fact', () => {
    // The event, and not the token. History is read by an Admin surface and the
    // token is a credential; recording it here would put a way into somebody's own
    // form into the ministry's permanent record.
    expect(history(reopen().effects)).toEqual([
      {
        ministryId: ministry,
        occurredAt: at,
        type: 'intake.link_issued',
        subjectType: 'person',
        subjectId: ruth,
        payload: {
          expiresAt: new Date(
            at.getTime() + INTAKE_LINK_LIFETIME_DAYS * 86_400_000,
          ).toISOString(),
        },
      },
    ])
  })

  it('gives back the link they already hold rather than minting a second', () => {
    // Two live links would both open the door with neither able to revoke the
    // other, so a second one replaces the first -- which means minting one here
    // would stop the link the Admin sent last week from working. Nothing happened,
    // so nothing is recorded.
    expect(reopen(heldUntil(new Date('2026-09-20T10:00:00Z'))).effects).toEqual([])
  })

  it('mints a new one once the link they hold has run out', () => {
    const { effects } = reopen(heldUntil(new Date('2026-09-01T10:00:00Z')))

    expect(links(effects)).toHaveLength(1)
    expect(history(effects)).toHaveLength(1)
  })

  it('refuses to run without being told which link they already hold', () => {
    // Absent and null are the same value and opposite facts here: a Person holding
    // no link and a read that never happened would both mint one, and one of those
    // silently breaks a link somebody is already carrying.
    expect(() =>
      handleCommand(
        { type: 'intake.reopen', ministryId: ministry, personId: ruth },
        {
          ministryId: ministry,
          clock: createTestClock(at),
          ids: createSequentialIds(),
        } satisfies CommandContext,
      ),
    ).toThrow(/which link this Person already holds/)
  })
})
