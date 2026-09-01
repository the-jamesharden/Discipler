import { describe, expect, it } from 'vitest'
import { handleCommand, type CommandContext } from '~/domain/boundary'
import { createTestClock } from '~/domain/clock'
import type { Effect } from '~/domain/effects'
import { PasswordResetRefused } from '~/domain/errors'
import { createSequentialIds, ministryId, personId } from '~/domain/ids'

/**
 * What the domain does about a reset, which is one thing: record that it happened.
 *
 * The password is set through the `Accounts` port before this command is composed,
 * so nothing here can put one in a payload -- and the two refusals are the ones the
 * screen already checked, reachable from here only by a race.
 */

const ministry = ministryId('00000000-0000-4000-8000-0000000000aa')
const marcus = personId('00000000-0000-4000-8000-0000000000d0')
const theAdminsAccount = '11111111-1111-4111-8111-111111111111'
const marcusAccount = '22222222-2222-4222-8222-222222222222'
const at = new Date('2026-09-14T10:00:00Z')

const reset = (accountToReset: string | null | undefined) =>
  handleCommand(
    {
      type: 'person.reset_password',
      ministryId: ministry,
      personId: marcus,
      resetBy: theAdminsAccount,
    },
    {
      ministryId: ministry,
      clock: createTestClock(at),
      ids: createSequentialIds(),
      // Spread rather than set, so *nobody read it* is the property being absent
      // and not the property holding `undefined`. `exactOptionalPropertyTypes`
      // keeps the two apart, and they are the two facts this command tells apart.
      ...(accountToReset === undefined ? {} : { accountToReset }),
    } satisfies CommandContext,
  )

const history = (effects: readonly Effect[]) =>
  effects.flatMap((effect) => (effect.kind === 'history.append' ? [effect.event] : []))

describe('recording a password reset', () => {
  it('records who reset whose password, and nothing else', () => {
    const { effects } = reset(marcusAccount)

    expect(history(effects)).toEqual([
      {
        ministryId: ministry,
        occurredAt: at,
        type: 'person.password_reset',
        subjectType: 'person',
        subjectId: marcus,
        payload: { resetBy: theAdminsAccount },
      },
    ])

    // One event and nothing beside it. In particular nothing that sends: an
    // admin-initiated send does not exist in this product, and the number a text
    // would go to is the one nobody on this path is allowed to see.
    expect(effects).toHaveLength(1)
  })

  it('puts no password material in the payload', () => {
    const [event] = history(reset(marcusAccount).effects)

    // Asserted on the keys rather than by searching for a string. A password is
    // whatever four words came out, so a test looking for one would only ever prove
    // that *this* password was absent.
    expect(Object.keys(event!.payload)).toEqual(['resetBy'])
  })

  it('refuses a Person with no account on this Roster', () => {
    // The race behind an action the Roster shows only on rows that hold one -- and
    // the same answer for a Person this Ministry does not hold at all.
    expect(() => reset(null)).toThrow(new PasswordResetRefused('account.no_account'))
  })

  it('refuses an Admin resetting themselves', () => {
    expect(() => reset(theAdminsAccount)).toThrow(
      new PasswordResetRefused('account.cannot_reset_yourself'),
    )
  })

  it('refuses to run at all without the account having been read', () => {
    // Absent is not `null`. A snapshot nobody loaded would otherwise read as *there
    // is nothing to reset* and refuse every reset in the product as a race.
    expect(() => reset(undefined)).toThrow(/account/)
  })
})
