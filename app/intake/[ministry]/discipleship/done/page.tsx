import { notFound } from 'next/navigation'
import {
  AGE_BANDS,
  DECLARED_SIDES,
  EXPERIENCE_ANSWERS,
  GENDERS,
  isOneOf,
} from '~/domain/intake'
import { getIntakeReader } from '~/service/container'
import { Centred } from '../../../../shell'
import {
  DONE_BEFORE_ANSWER,
  DONE_HEADING,
  doneMessage,
  doneMessageWithoutASide,
  FIRST_TIME_ANSWER,
  selectedSummary,
  sideLabel,
} from '../../../copy'
import { firstValue } from '../../../wizard-answers'

/**
 * What a Person sees the moment the wizard submits. The Welcome Message is already
 * on its way to them; this page says the same thing to the screen they are still
 * looking at, because a text arriving in a few seconds is not an acknowledgement.
 *
 * It says what happens next in the words of the side they declared -- a mentee is
 * waiting for a mentor, a mentor for somebody to mentor -- and it promises no date,
 * because the Ministry pairs people and Discipler does not.
 *
 * The design's confirmation card carries a summary. The answers that are one of
 * a short list -- the side, the band, the gender, the experience -- and the two
 * counts travel on the redirect and are checked against those lists rather than
 * rendered; the name and the number do not travel, because they are not going in
 * a URL, so the *Reach you at* row says by text and names no digits.
 */
export default async function DiscipleshipIntakeDonePage({
  params,
  searchParams,
}: {
  params: Promise<{ ministry: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { ministry } = await params
  const query = await searchParams

  const page = await getIntakeReader().readIntakePage(ministry)
  if (!page) notFound()

  // Compared against the answers rather than rendered, like every other value
  // that arrived in a query string. A side nothing recognises is null rather than a
  // guess, for the reason nothing else on this path guesses one: the consent record
  // is not backfilled with a side and neither is the sentence describing it.
  const oneOf = <T extends string>(allowed: readonly T[], value: string | string[] | undefined) => {
    const asked = firstValue(value)
    return isOneOf(allowed, asked) ? asked : null
  }
  const count = (value: string | string[] | undefined): number | null => {
    const parsed = Number.parseInt(firstValue(value) ?? '', 10)
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
  }

  const side = oneOf(DECLARED_SIDES, query.side)
  const ageBand = oneOf(AGE_BANDS, query.ageBand)
  const gender = oneOf(GENDERS, query.gender)
  const experience = oneOf(EXPERIENCE_ANSWERS, query.experience)
  const hours = count(query.hours)
  const days = count(query.days)

  const rows: readonly (readonly [string, string])[] = [
    ...(side ? [['Joining as', sideLabel[side]] as const] : []),
    ...(ageBand ? [['Age range', ageBand] as const] : []),
    ...(gender ? [['Gender', gender === 'female' ? 'Female' : 'Male'] as const] : []),
    ...(experience
      ? [['Experience', experience === 'first_time' ? FIRST_TIME_ANSWER : DONE_BEFORE_ANSWER] as const]
      : []),
    ...(hours !== null && days !== null
      ? [['Availability', selectedSummary(hours, days).replace(/\.$/, '')] as const]
      : []),
    ['Reach you at', 'By text, at the mobile number you gave'] as const,
  ]

  return (
    <Centred>
      <div className="tick" aria-hidden="true">
        ✓
      </div>
      <h1 style={{ textAlign: 'center' }}>{DONE_HEADING}</h1>
      <p className="muted" style={{ textAlign: 'center' }}>
        {side === null
          ? doneMessageWithoutASide(page.ministryName)
          : doneMessage[side](page.ministryName)}{' '}
        We’ve sent you a text to confirm.
      </p>

      <div className="summary">
        {rows.map(([label, value]) => (
          <div key={label} className="summary-row">
            <span>{label}</span>
            <span>{value}</span>
          </div>
        ))}
      </div>

      <p className="card-note">You can close this page.</p>
    </Centred>
  )
}
