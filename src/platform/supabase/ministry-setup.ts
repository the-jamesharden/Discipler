import pg from 'pg'
import { ministryId } from '~/domain/ids'
import { MinistrySetupRefused } from '~/domain/errors'
import {
  issueMinistrySetup,
  ministrySetupState,
  ministrySetupToken,
  type NewMinistrySetup,
} from '~/domain/ministry-setup'
import { asPhoneNumber } from '~/domain/roster'
import type { MinistrySetup, MinistrySetupPage } from '~/service/ports'
import { MinistryNotProvisioned, provisionMinistry } from './provisioning'

/**
 * The Ministry Setup Link, on the trusted connection and nothing else.
 *
 * Every step of it happens with no session: the operator minting is at a
 * terminal, and the Admin opening it has no account yet -- getting one is what
 * the link is for. So the whole of it runs on the connection provisioning already
 * runs on, without `set local role discipler_command`, because the row it is
 * about belongs to no Ministry and the command role acts for exactly one.
 *
 * The Ministry itself is opened by `provisionMinistry`, which is the one place a
 * Ministry comes into existence whether or not a link was involved. This module
 * only mints, resolves, and hands the token across so it is spent in the same
 * transaction.
 */

/**
 * Thrown by `issue` rather than refused. An operator is at a terminal and reads
 * the reason; there is no page to put a code on.
 */
export class MinistrySetupNotIssued extends Error {
  constructor(readonly reason: string) {
    super(`Could not issue the Ministry Setup Link: ${reason}`)
    this.name = 'MinistrySetupNotIssued'
  }
}

const A_TOKEN = /^[0-9a-f-]{36}$/i

export interface SupabaseMinistrySetup extends MinistrySetup {
  close(): Promise<void>
}

export const createSupabaseMinistrySetup = (
  connectionString: string,
  now: () => Date = () => new Date(),
  token: () => string = () => crypto.randomUUID(),
): SupabaseMinistrySetup => {
  const pool = new pg.Pool({ connectionString })

  return {
    async issue({ ministryName, sendingNumber, adminPhone }): Promise<NewMinistrySetup> {
      // Both numbers read the way provisioning will read them a fortnight from
      // now, and refused here if they cannot be -- so a link is never minted for a
      // Ministry the submit would then refuse to open.
      const name = ministryName.trim()
      if (!name) throw new MinistrySetupNotIssued('the Ministry needs a name')

      const sender = asPhoneNumber(sendingNumber)
      if (!sender) throw new MinistrySetupNotIssued(`unreadable sending number: ${sendingNumber}`)

      const phone = asPhoneNumber(adminPhone)
      if (!phone) throw new MinistrySetupNotIssued(`unreadable admin phone: ${adminPhone}`)

      const link = issueMinistrySetup({
        token: ministrySetupToken(token()),
        ministryName: name,
        sendingNumber: sender,
        adminPhone: phone,
        at: now(),
      })

      const client = await pool.connect()
      try {
        // A number that already signs somebody in would be refused at the submit,
        // by the person least able to do anything about it. Asked here instead,
        // of the one table that knows, so the operator hears it while they can
        // still act. GoTrue stores the number without its plus.
        const { rows: taken } = await client.query(
          `select 1 from auth.users where phone = $1`,
          [phone.replace(/^\+/, '')],
        )
        if (taken.length > 0) {
          throw new MinistrySetupNotIssued(
            `${phone} already signs somebody in, so a Ministry cannot be opened on it`,
          )
        }

        // Minting again for the same phone replaces the live link rather than
        // leaving two. The name and the sending number are replaced with it: the
        // newest mint is the operator's current intention, typo corrections
        // included.
        await client.query(
          `insert into ministry_setup
             (token, ministry_name, sending_number, admin_phone, created_at, expires_at)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (admin_phone) where consumed_at is null do update
             set token = excluded.token,
                 ministry_name = excluded.ministry_name,
                 sending_number = excluded.sending_number,
                 created_at = excluded.created_at,
                 expires_at = excluded.expires_at`,
          [link.token, link.ministryName, link.sendingNumber, link.adminPhone, link.createdAt, link.expiresAt],
        )
      } finally {
        client.release()
      }

      return link
    },

    async read(candidate): Promise<MinistrySetupPage | null> {
      // Typed off a screen as often as tapped, so nothing reaches a query until
      // it has the shape of a token.
      if (!A_TOKEN.test(candidate)) return null

      const { rows } = await pool.query<{
        ministry_name: string
        admin_phone: string
        expires_at: Date
        consumed_at: Date | null
      }>(
        `select ministry_name, admin_phone, expires_at, consumed_at
           from ministry_setup where token = $1`,
        [candidate],
      )
      const row = rows[0]
      if (!row) return null

      return {
        ministryName: row.ministry_name,
        adminPhone: row.admin_phone,
        state: ministrySetupState({ expiresAt: row.expires_at, consumedAt: row.consumed_at }, now()),
      }
    },

    async open(candidate, admin) {
      if (!A_TOKEN.test(candidate)) return { refusal: 'setup.not_found' }

      const { rows } = await pool.query<{
        ministry_name: string
        sending_number: string
        admin_phone: string
        expires_at: Date
        consumed_at: Date | null
      }>(
        `select ministry_name, sending_number, admin_phone, expires_at, consumed_at
           from ministry_setup where token = $1`,
        [candidate],
      )
      const row = rows[0]
      if (!row) return { refusal: 'setup.not_found' }

      // Answered before an account is minted, so a dead link costs nothing to
      // take back. Provisioning checks again inside its transaction, which is
      // what makes this a courtesy rather than the guard.
      const state = ministrySetupState(
        { expiresAt: row.expires_at, consumedAt: row.consumed_at },
        now(),
      )
      if (state === 'consumed') return { refusal: 'setup.already_used' }
      if (state === 'expired') return { refusal: 'setup.expired' }

      // Password rules and a taken number are the account's refusals, and they
      // come back as answers rather than faults because somebody is standing in
      // front of the page. Provisioning throws them, carrying the code, and it
      // is read back off the throw here.
      try {
        const provisioned = await provisionMinistry({
          name: row.ministry_name,
          sendingNumber: row.sending_number,
          // The number on the link, never one that was typed. The page displays it
          // and offers nowhere to type one, so a forwarded link cannot open a
          // Ministry on a stranger's phone.
          admin: { fullName: admin.fullName, phone: row.admin_phone, password: admin.password },
          openedThrough: ministrySetupToken(candidate),
          at: now(),
        })
        return { ministryId: ministryId(provisioned.ministryId) }
      } catch (error) {
        if (error instanceof MinistrySetupRefused) return { refusal: error.refusal }
        if (error instanceof MinistryNotProvisioned && error.refusal) {
          return { refusal: error.refusal }
        }
        throw error
      }
    },

    close: () => pool.end(),
  }
}
