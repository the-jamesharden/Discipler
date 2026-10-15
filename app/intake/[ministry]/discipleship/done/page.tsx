import { notFound } from 'next/navigation'
import {
  AGE_BANDS,
  DECLARED_SIDES,
  EXPERIENCE_ANSWERS,
  GENDERS,
  isOneOf,
  ONE_TO_TWO_ANSWERS,
} from '~/domain/intake'
import { getIntakeReader } from '~/service/container'
import { Centred } from '../../../../shell'
import {
  DONE_BEFORE_ANSWER,
  DONE_HEADING,
  doneMessage,
  doneMessageWithoutASide,
  FIRST_TIME_ANSWER,
  oneToTwoAnswerLabel,
  selectedSummary,
  sideLabel,
} from '../../../copy'
import { firstValue, readPreview, readVersion } from '../../../wizard-answers'
import { PreviewNotice } from '../../../wizard-shell'

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
 * a short list -- the side, the band, the gender, the experience, the one-to-two
 * answer -- and the two counts travel on the redirect and are checked against
 * those lists rather than rendered; the name and the number do not travel,
 * because they are not going in a URL, so the *Reach you at* row says by text and
 * names no digits.
 *
 * Under it, the thank-you of the version of the Ministry's form they answered,
 * where the Ministry has written one (Pastor feedback, ticket 11). Beneath what
 * Discipler says rather than in place of it, because what Discipler says here is
 * the one place they learn what happens next.
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

  const page = await getIntakeReader().readIntakePage(ministry, readVersion(query.v))
  if (!page) notFound()
  const preview = readPreview(query.preview)

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
  const oneToTwo = oneOf(ONE_TO_TWO_ANSWERS, query.oneToTwo)
  const hours = count(query.hours)
  const days = count(query.days)

  const rows: readonly (readonly [string, string])[] = [
    ...(side ? [['Joining as', sideLabel[side]] as const] : []),
    ...(ageBand ? [['Age range', ageBand] as const] : []),
    ...(gender ? [['Gender', gender === 'female' ? 'Female' : 'Male'] as const] : []),
    ...(experience
      ? [['Experience', experience === 'first_time' ? FIRST_TIME_ANSWER : DONE_BEFORE_ANSWER] as const]
      : []),
    // Said in the side's words, so only with a side: an answer with no side to
    // word it from would be said in a guess.
    ...(side && oneToTwo ? [['Pairing', oneToTwoAnswerLabel[side][oneToTwo]] as const] : []),
    ...(hours !== null && days !== null
      ? [['Availability', selectedSummary(hours, days).replace(/\.$/, '')] as const]
      : []),
    ['Reach you at', 'By text, at the mobile number you gave'] as const,
  ]

  return (
    <Centred ministryName={page.ministryName}>
      {preview ? <PreviewNotice /> : null}
      <div className="tick" aria-hidden="true">
        ✓
      </div>
      <h1 style={{ textAlign: 'center' }}>{DONE_HEADING}</h1>
      <p className="muted" style={{ textAlign: 'center' }}>
        {side === null
          ? doneMessageWithoutASide(page.ministryName)
          : doneMessage[side](page.ministryName)}{' '}
        We’ve texted you to confirm.
      </p>
      {page.form.thankYou ? (
        <p className="muted" style={{ textAlign: 'center' }}>
          {page.form.thankYou}
        </p>
      ) : null}

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
