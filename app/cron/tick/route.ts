import { timingSafeEqual } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import type { MinistryId } from '~/domain/ids'
import { systemClock } from '~/domain/clock'
import { dispatchQueue, NoSendingNumber } from '~/service/outbound-dispatch'
import {
  getCommandService,
  getMessageTransport,
  getMinistryDirectory,
  getOutboundQueue,
} from '~/service/container'

/**
 * The clock's one caller. A Vercel cron entry hits this path on a schedule; this
 * route authenticates it, and then does what every other entry point does -- hands
 * a command to the application service, which decides against the injected clock
 * and writes through the store.
 *
 * The tick itself is a command like any other and reads no system time of its own.
 * What this route adds is only *when*, which is the one thing a pure function
 * cannot supply itself.
 *
 * Per Ministry, and in its own transaction each. The tick is scoped by definition --
 * two Ministries' care conditions are not one question -- so one failing Ministry
 * must not cost every other Ministry its week. Each is caught, counted, and the
 * run continues.
 */

export const dynamic = 'force-dynamic'
// The whole point is the side effects. A cached response would be a week of
// check-ins that silently never happened.
export const revalidate = 0

/**
 * Vercel sends `Authorization: Bearer $CRON_SECRET`. Compared in constant time,
 * because a comparison that returns early leaks the secret one character at a time
 * to anybody willing to time the responses -- and this endpoint is unauthenticated
 * by every other measure and will happily send a congregation their week.
 */
const authorised = (request: NextRequest): boolean => {
  const secret = process.env.CRON_SECRET
  // No secret configured is a closed door, never an open one. A deployment that
  // forgot to set it must not be one where anybody can drive the scheduler.
  if (!secret) return false

  const offered = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${secret}`

  // `timingSafeEqual` throws on a length mismatch, which is itself the leak it
  // exists to prevent -- so the lengths are equalised by hashing neither and
  // checking length separately, which reveals only what the header's own size
  // already does.
  const a = Buffer.from(offered)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

interface MinistryOutcome {
  readonly ministryId: MinistryId
  readonly sent: number
  readonly withheld: number
  readonly failed: number
  readonly error: string | null
}

const runOneMinistry = async (ministryId: MinistryId): Promise<MinistryOutcome> => {
  const nothing = { sent: 0, withheld: 0, failed: 0 }

  try {
    // The tick first, then the drain, in that order and in the same run: the tick is
    // what enqueues this hour's check-ins, and draining before it would leave every
    // one of them sitting until the next pass an hour later.
    await getCommandService().execute({ type: 'scheduled.tick', ministryId })

    const outcome = await dispatchQueue({
      queue: getOutboundQueue(),
      transport: getMessageTransport(),
      clock: systemClock,
      ministryId,
    })

    return { ministryId, ...outcome, error: null }
  } catch (error) {
    // A Ministry nobody has bought a number for yet is the ordinary case here, not a
    // fault: it is set up and not yet sending. Named rather than folded into
    // `unexpected` so it is legible in a log without opening the code.
    if (error instanceof NoSendingNumber) {
      return { ministryId, ...nothing, error: 'no_sending_number' }
    }

    console.error(`The scheduled tick failed for ministry ${ministryId}`, error)
    return { ministryId, ...nothing, error: 'failed' }
  }
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    // Nothing about why. An endpoint that distinguishes "no secret configured" from
    // "wrong secret" tells a stranger which of the two to keep trying.
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const ministries = await getMinistryDirectory().everyMinistry()
  const ran: MinistryOutcome[] = []
  for (const ministryId of ministries) ran.push(await runOneMinistry(ministryId))

  // Always 200 once authorised, even where a Ministry failed. The scheduler retries
  // a non-2xx, and retrying the whole run to recover one Ministry would re-drain
  // every other one -- the outcomes say what happened instead, per Ministry, where
  // whoever is reading the cron log can see it.
  return NextResponse.json({
    ministries: ran.length,
    sent: ran.reduce((total, one) => total + one.sent, 0),
    withheld: ran.reduce((total, one) => total + one.withheld, 0),
    failed: ran.reduce((total, one) => total + one.failed, 0),
    errors: ran.filter((one) => one.error !== null).map((one) => ({
      ministryId: one.ministryId,
      error: one.error,
    })),
  })
}
