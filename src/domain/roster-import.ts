import type { PersonId } from './ids'
import { rosterKey, type PhoneNumber, type RosterKey, type RowProblem, type RowRejection } from './roster'
import { normalisedName, type PairingSide, type RosterFileReading } from './roster-csv'

/**
 * What an import will do, decided before anything is written and in one place.
 *
 * Two callers read this and must agree: the command, inside its transaction and
 * against the row-locked Roster, which is the authority; and the import dialog in
 * the browser, against the Roster's keys the page handed it, which is the
 * preview. They cannot drift because this is the one function (ticket 36).
 *
 * Nothing here touches a file, a database or a clock. It takes what the reader
 * read and what the Roster holds, and says for every row and every pairing what
 * becomes of it.
 */

/**
 * What the Roster holds, as classifying needs it. The same shape the command's
 * snapshot carries; the page serialises it for the dialog.
 */
export interface ImportReadback {
  readonly people: ReadonlyMap<RosterKey, PersonId>
  readonly namesByNumber: ReadonlyMap<PhoneNumber, readonly string[]>
  readonly openPlans: readonly { readonly leaderId: PersonId; readonly participantId: PersonId }[]
}

export type RowOutcome = 'new' | 'already_on_the_roster' | 'held'

export interface ClassifiedRow {
  readonly line: number
  readonly fullName: string
  readonly phone: PhoneNumber
  readonly email: string | null
  readonly outcome: RowOutcome
  /** Who the row is, where it is somebody already on the Roster. */
  readonly existingId: PersonId | null
}

/** One side of a pairing, resolved: a row of this import by index, or a Person already on the Roster. */
export type SideRef =
  | { readonly kind: 'row'; readonly index: number }
  | { readonly kind: 'person'; readonly personId: PersonId }

export interface ClassifiedPairing {
  readonly line: number
  readonly leader: SideRef | null
  readonly participant: SideRef | null
  readonly outcome: 'planned' | 'not_recordable'
  readonly reason: RowProblem | null
}

export interface ImportCounts {
  /** New rows that will be the Discipler of a planned pairing. */
  readonly newDisciplers: number
  /** Every other new row. */
  readonly newDisciples: number
  /** Said as the prototype says it, though nothing is created at import (ADR-0022). */
  readonly pairsCreated: number
  readonly alreadyOnTheRoster: number
}

export interface ImportClassification {
  readonly rows: readonly ClassifiedRow[]
  readonly pairings: readonly ClassifiedPairing[]
  /** Every refusal, the reader's and this classification's, one per line and reason. */
  readonly rejections: readonly RowRejection[]
  readonly counts: ImportCounts
}

const sameSide = (a: SideRef, b: SideRef): boolean =>
  a.kind === 'row' && b.kind === 'row'
    ? a.index === b.index
    : a.kind === 'person' && b.kind === 'person' && a.personId === b.personId

export const classifyImport = (
  reading: RosterFileReading,
  roster: ImportReadback,
): ImportClassification => {
  // The people already on the Roster, by the name fold, for the sides a file
  // names without a row of its own. Read off the keys the Roster holds: each is
  // the number and the folded name together.
  const byName = new Map<string, PersonId[]>()
  for (const [key, id] of roster.people) {
    const name = key.slice(key.indexOf(' ') + 1)
    byName.set(name, [...(byName.get(name) ?? []), id])
  }

  const rows: ClassifiedRow[] = reading.people.map((row) => {
    const existingId = roster.people.get(rosterKey(row)) ?? null
    if (existingId) return { ...row, outcome: 'already_on_the_roster', existingId }
    // A number the Roster holds under a different name is held, not guessed at:
    // a rename and the second person on a shared phone are both ordinary, and
    // each guess loses the other (ADR-0005).
    if (roster.namesByNumber.has(row.phone)) return { ...row, outcome: 'held', existingId: null }
    return { ...row, outcome: 'new', existingId: null }
  })

  const rejections: RowRejection[] = [...reading.rejected]
  const reject = (line: number, problem: RowProblem) => {
    if (!rejections.some((each) => each.line === line && each.problem === problem)) {
      rejections.push({ line, problem })
    }
  }
  for (const row of rows) {
    if (row.outcome === 'already_on_the_roster') reject(row.line, 'already_on_the_roster')
    if (row.outcome === 'held') reject(row.line, 'same_number_different_name')
  }

  const indexByKey = new Map(rows.map((row, index) => [rosterKey(row), index]))

  /** A side as a row of this import or a Person on the Roster, or why it is neither. */
  const resolve = (side: PairingSide): { ref: SideRef } | { reason: RowProblem } => {
    if (side.kind === 'in_file') {
      const index = indexByKey.get(side.key)
      if (index === undefined) return { reason: 'paired_with_unknown' }
      const row = rows[index]!
      if (row.outcome === 'held') return { reason: 'paired_with_held' }
      if (row.outcome === 'already_on_the_roster') return { ref: { kind: 'person', personId: row.existingId! } }
      return { ref: { kind: 'row', index } }
    }
    const found = byName.get(normalisedName(side.name)) ?? []
    if (found.length === 0) return { reason: 'paired_with_unknown' }
    if (found.length > 1) return { reason: 'paired_with_ambiguous' }
    return { ref: { kind: 'person', personId: found[0]! } }
  }

  /** Disciples already holding a plan, on the Roster or earlier in this import. */
  const planned = new Set<string>(roster.openPlans.map((plan) => `person:${plan.participantId}`))
  const keyOf = (ref: SideRef) => (ref.kind === 'row' ? `row:${ref.index}` : `person:${ref.personId}`)

  const pairings: ClassifiedPairing[] = reading.pairings.map((pairing) => {
    const leader = resolve(pairing.leader)
    const participant = resolve(pairing.participant)
    const notRecordable = (reason: RowProblem): ClassifiedPairing => {
      reject(pairing.line, reason)
      return {
        line: pairing.line,
        leader: 'ref' in leader ? leader.ref : null,
        participant: 'ref' in participant ? participant.ref : null,
        outcome: 'not_recordable',
        reason,
      }
    }
    if ('reason' in leader) return notRecordable(leader.reason)
    if ('reason' in participant) return notRecordable(participant.reason)
    if (sameSide(leader.ref, participant.ref)) return notRecordable('paired_with_self')
    // One open plan per Disciple, on the Roster and within this import alike: a
    // person is in one one-to-one at a time, and a second plan could only ever be
    // refused.
    if (planned.has(keyOf(participant.ref))) return notRecordable('pairing_already_planned')
    planned.add(keyOf(participant.ref))
    return { line: pairing.line, leader: leader.ref, participant: participant.ref, outcome: 'planned', reason: null }
  })

  const disciplerRows = new Set(
    pairings.flatMap((pairing) =>
      pairing.outcome === 'planned' && pairing.leader?.kind === 'row' ? [pairing.leader.index] : [],
    ),
  )
  const newRows = rows.flatMap((row, index) => (row.outcome === 'new' ? [index] : []))

  return {
    rows,
    pairings,
    rejections: rejections.sort((first, second) => first.line - second.line),
    counts: {
      newDisciplers: newRows.filter((index) => disciplerRows.has(index)).length,
      newDisciples: newRows.filter((index) => !disciplerRows.has(index)).length,
      pairsCreated: pairings.filter((pairing) => pairing.outcome === 'planned').length,
      alreadyOnTheRoster: rows.filter((row) => row.outcome === 'already_on_the_roster').length,
    },
  }
}
