import type { Clock } from '~/domain/clock'
import { concernId, personId, relationshipId } from '~/domain/ids'
import { AGE_BANDS, GENDERS, otherGoal, type AgeBand, type Gender } from '~/domain/intake'
import { deriveRelationshipState } from '~/domain/relationship-state'
import { cardShapeOf } from '~/domain/relationships'
import type { ConcernReading, PairCard, PairCardPerson } from '~/service/ports'
import { followUpItemsFrom } from './care-needed-reader'
import { formsNowFrom, ownAnswersFrom } from './intake-form-document'
import type { PageDocument } from './page'
import {
  answersFrom,
  concernsFrom,
  instant,
  membersFrom,
  namesFrom,
  pausesFrom,
  weeksFrom,
  type HistoryInputs,
} from './relationship-history'
import { text } from './rows'

/**
 * The pair card (Pastor feedback, ticket 07): one one-to-one or 1:2 pair, or a
 * Group in the card's group form (ticket 08), read out of a page's document.
 * Shared by every page that opens the card, so the Overview, Check-Ins and
 * Follow-Up (tickets 09 and 10) cannot show the same relationship three ways:
 * each page function composes `app.pair_card` under `card`,
 * beside the history it already reads, and hands both here.
 *
 * The history answers everything it already answers for the tabs -- who is in
 * the pair and on which side, the state and why, the last answer, the Concerns,
 * an expired Pause -- through the same derivations, so the card cannot disagree
 * with the card on the grid behind it. `card` adds what the history does not
 * carry: the name, each person's Intake answers and the contact
 * details they agreed to share, the Material running now, and who has read the
 * Concerns.
 *
 * Never the words of a Concern. Those are read as the card opens, through the
 * command that records the reading (`app/pair-card/open.ts`).
 */

const ageBandOf = (value: unknown): AgeBand | null =>
  AGE_BANDS.find((band) => band === value) ?? null

const genderOf = (value: unknown): Gender | null => GENDERS.find((gender) => gender === value) ?? null

/** Who has read a card's unresolved Concerns, newest first, as the document says it. */
export const readingsFrom = (value: unknown): ConcernReading[] =>
  (Array.isArray(value) ? (value as Record<string, unknown>[]) : []).flatMap((reading) => {
    const concern = text(reading.concern_id)
    const viewedAt = instant(reading.viewed_at)
    return concern && viewedAt
      ? [{ concernId: concernId(concern), viewedAt, viewerName: text(reading.viewer_name), byThisReader: reading.by_this_reader === true }]
      : []
  })

/**
 * The card, or null where there is none to show: the address named nothing, or
 * a relationship this Admin cannot see or one that has ended.
 */
export const pairCardFrom = (doc: PageDocument, history: HistoryInputs, clock: Clock): PairCard | null => {
  const card = doc.card
  if (card === null || card === undefined) return null
  if (typeof card !== 'object' || Array.isArray(card)) {
    throw new Error('The page document carried a card that is not one')
  }
  const row = card as Record<string, unknown>

  const timeZone = history.timeZone
  if (!timeZone) return null

  const id = text(row.relationship_id)
  const createdAt = instant(row.created_at)
  if (!id || !createdAt) {
    throw new Error(`The card arrived without saying which relationship or since when: ${JSON.stringify(row)}`)
  }

  const nameOf = namesFrom(history)
  const side = membersFrom(history, nameOf).get(id)
  const leaders = side?.people.filter((person) => person.role === 'leader') ?? []
  const participants = side?.people.filter((person) => person.role === 'participant') ?? []

  const name = text(row.name)
  const shape = cardShapeOf(name, leaders.length, participants.length)

  const now = clock.now()
  const acceptedAt = instant(row.accepted_at)
  const pause = pausesFrom(history).get(id) ?? null
  const concerns = concernsFrom(history, nameOf)
  const derived = deriveRelationshipState(
    {
      acceptedAt,
      endedAt: null,
      pausedAt: pause?.pausedAt ?? null,
      timeZone,
      weeks: weeksFrom(history).get(id) ?? [],
      concerns: concerns.raised.get(id) ?? [],
    },
    now,
  )

  const details = new Map(
    (Array.isArray(row.people) ? (row.people as Record<string, unknown>[]) : []).flatMap((person) => {
      const who = text(person.person_id)
      return who ? [[who, person] as const] : []
    }),
  )

  const byName = (a: { readonly fullName: string }, b: { readonly fullName: string }) =>
    a.fullName.localeCompare(b.fullName)
  // The Ministry's forms as they stand, which word each person's answers to its
  // own questions (ticket 12).
  const forms = formsNowFrom(row.intake_forms)

  const people: PairCardPerson[] = [...[...leaders].sort(byName), ...[...participants].sort(byName)].map(
    (person) => {
      const said = details.get(person.personId) ?? {}
      const typed = text(said.goal_other)
      return {
        personId: personId(person.personId),
        fullName: person.fullName,
        role: person.role,
        phone: text(said.phone),
        email: text(said.email),
        ageBand: ageBandOf(said.age_band),
        goal: text(said.goal),
        goalOther: typed === null ? null : otherGoal(typed),
        ownAnswers: ownAnswersFrom(forms, said.own_answers),
      }
    },
  )

  const lastAnswer = answersFrom(history)
    .filter((week) => week.relationshipId === id && week.answeredAt !== null)
    .reduce<ReturnType<typeof answersFrom>[number] | null>(
      (latest, week) =>
        latest === null || (week.answeredAt?.getTime() ?? 0) > (latest.answeredAt?.getTime() ?? 0) ? week : latest,
      null,
    )

  const material = row.material as Record<string, unknown> | null | undefined
  const materialSince = material ? instant(material.started_at) : null

  // While it is still paused. Resuming leaves the item standing on Follow-Up,
  // where an Admin resolves it, and the card has nothing left to offer for it.
  const expired = pause
    ? followUpItemsFrom(history, clock, nameOf).find(
        (item) => item.relationshipId === id && item.payload.kind === 'pause_expired',
      )
    : undefined

  return {
    relationshipId: relationshipId(id),
    shape,
    name,
    declaredGender: genderOf(row.declared_gender),
    // When the Admin paired them, which is what *paired* means on every Admin
    // screen; acceptance is the Leader's act and the history keeps it apart.
    pairedAt: createdAt,
    state: derived.state,
    reasons: derived.reasons,
    openConcerns: derived.openConcerns,
    people,
    lastCheckIn:
      lastAnswer?.answeredAt
        ? { answeredAt: lastAnswer.answeredAt, met: lastAnswer.met, satisfaction: lastAnswer.satisfaction }
        : null,
    material: material && materialSince ? { title: text(material.title), since: materialSince } : null,
    concerns: concerns.outstanding.get(id) ?? [],
    readings: readingsFrom(row.readings),
    readerName: text(row.reader_name),
    pauseExpired:
      expired && expired.payload.kind === 'pause_expired' ? { periodWeeks: expired.payload.periodWeeks } : null,
    timeZone,
  }
}
