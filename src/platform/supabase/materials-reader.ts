import type { SupabaseClient } from '@supabase/supabase-js'
import { systemClock, type Clock } from '~/domain/clock'
import { materialId, relationshipId, type MinistryId } from '~/domain/ids'
import type { Gender } from '~/domain/intake'
import { materialInUseAt, type MaterialPeriod } from '~/domain/materials'
import { deriveRelationshipState } from '~/domain/relationship-state'
import type {
  ClosedMaterialPeriod,
  MaterialOnTheList,
  MaterialRelationship,
  MaterialsPage,
  MaterialsReader,
} from '~/service/ports'
import { careNeededFrom } from './care-needed-reader'
import { adminPage, documentFor, list, readPageDocument, type PageDocument } from './page'
import {
  byNames,
  concernsFrom,
  gather,
  historyOf,
  instant,
  membersFrom,
  namesFrom,
  pausesFrom,
  weeksFrom,
} from './relationship-history'
import { declaredGenderOf, text } from './rows'
import { createSupabaseServerClient } from './server-client'

/**
 * The Materials tab: the Ministry's Materials, and every accepted unended
 * relationship with what it is working through now, what it worked through
 * before, and the state its history derives.
 *
 * One document, `materials_page`, read through the signed-in Admin's session so
 * the policies are what scope it to their Ministry. The Overview's history rides
 * in it under `history`, and the pill and the flag line on each card come from
 * `deriveRelationshipState` and Care Needed over exactly those rows -- the same
 * rows, from the same document -- so a relationship Stalled on the Overview is
 * Stalled here. The rest of the document is what the Overview does not read:
 * the Materials, the periods, the relationships' names and declarations, and
 * the genders the filter's one-to-one rule needs.
 *
 * SQL batches and TypeScript derives (`docs/adr/0023-a-page-is-one-read.md`).
 * Which period is running, which folder a relationship files under, and what
 * the "Previously" line says are all decided here, from the rows.
 */

/**
 * What a Ministry the caller cannot see reads as: no zone, nothing listed. The
 * honest empty state rather than a failure, as the Overview's is.
 */
const NOTHING_YET: MaterialsPage = { timeZone: null, materials: [], relationships: [], care: [] }

/**
 * The live Materials, in title order. A removed one (the flag ticket 02 adds) is
 * kept off this list and off nothing else: the periods that name it still name
 * it, which is what keeps a card's "Previously" line honest about a Material
 * the Ministry no longer offers.
 */
const materialsOn = (doc: PageDocument): readonly MaterialOnTheList[] =>
  list(doc, 'materials')
    .flatMap((row) => {
      const id = text(row.id)
      const title = text(row.title)
      // Both columns are not-null in the schema. A row without either is the
      // reader and the table having drifted apart, and a folder silently left off
      // a tab an Admin reads as *everything we hold* is the wrong answer shown
      // confidently.
      if (!id || !title) {
        throw new Error(`A Material arrived with no id or no title: ${JSON.stringify(row)}`)
      }
      if (instant(row.removed) !== null) return []
      return [{ materialId: materialId(id), title }]
    })
    .sort((a, b) => a.title.localeCompare(b.title) || a.materialId.localeCompare(b.materialId))

/**
 * Every period of every relationship, grouped by relationship, as
 * `material_periods` emits them: gapless and non-overlapping, with the
 * Material's title alongside and a null Material on the stretch before
 * anything was assigned.
 */
const periodsOf = (doc: PageDocument): Map<string, MaterialPeriod[]> => {
  const byRelationship = new Map<string, MaterialPeriod[]>()
  for (const row of list(doc, 'material_periods')) {
    const relationship = text(row.relationship_id)
    const startedAt = instant(row.started_at)
    if (!relationship || !startedAt) {
      throw new Error(`A Material period arrived without saying whose or when: ${JSON.stringify(row)}`)
    }
    const material = text(row.material_id)
    gather(byRelationship, relationship, {
      materialId: material ? materialId(material) : null,
      title: text(row.title),
      startedAt,
      endedAt: instant(row.ended_at),
    })
  }
  return byRelationship
}

/**
 * The gender each Person last declared at Intake, by Person. A row without both
 * halves is left out: a Person who never completed Intake has no gender here,
 * and the relationship they lead files under All only.
 */
const gendersOf = (doc: PageDocument): Map<string, Gender> =>
  new Map(
    list(doc, 'genders').flatMap((row) => {
      const person = text(row.person_id)
      const gender = declaredGenderOf(row.gender)
      return person !== null && gender !== null ? [[person, gender] as const] : []
    }),
  )

/**
 * The closed periods a card lists, earliest first. A zero-length period covers
 * no instant -- it is what assigning a Material at the very instant of
 * acceptance leaves behind -- and is skipped rather than printed as a stretch
 * that began and ended on the same day.
 */
const closedPeriodsOf = (periods: readonly MaterialPeriod[]): readonly ClosedMaterialPeriod[] =>
  periods
    .flatMap((period) =>
      period.endedAt !== null && period.endedAt.getTime() > period.startedAt.getTime()
        ? [{ title: period.title, startedAt: period.startedAt, endedAt: period.endedAt }]
        : [],
    )
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())

/**
 * The whole tab, out of one page's document and one reading of the clock.
 */
export const materialsFrom = (doc: PageDocument, clock: Clock): MaterialsPage => {
  const history = historyOf(doc)

  // A Ministry an Admin does not belong to comes back with no zone, and there is
  // nothing to derive a week against. The empty state rather than a guessed
  // zone, as on the Overview.
  const timeZone = history.timeZone
  if (!timeZone) return NOTHING_YET

  // Once for the whole tab, so the cards cannot disagree about what day it is,
  // and from the injected clock like every other time-dependent rule here.
  const now = clock.now()

  const nameOf = namesFrom(history)
  const members = membersFrom(history, nameOf)
  const weeks = weeksFrom(history)
  const concerns = concernsFrom(history, nameOf)
  const pauses = pausesFrom(history)
  const periods = periodsOf(doc)
  const genders = gendersOf(doc)

  const relationships: MaterialRelationship[] = []

  for (const row of list(doc, 'relationships')) {
    const id = text(row.id)
    const acceptedAt = instant(row.accepted_at)
    // The function lists accepted relationships and nothing else. A row without
    // either column is the reader and the function having drifted apart.
    if (!id || !acceptedAt) {
      throw new Error(`A relationship arrived with no id or no accepted_at: ${JSON.stringify(row)}`)
    }

    // The history opens at acceptance with a period that has no Material, and it
    // never has a gap, so an accepted relationship is on some period right now.
    // One that is not is a history the database promised could not exist, and a
    // card left off a folder over it would be a wrong answer shown confidently.
    const own = periods.get(id) ?? []
    const running = materialInUseAt(own, now)
    if (running === null) {
      throw new Error(`Relationship ${id} is accepted but on no Material period right now`)
    }

    const { leaders, participants, people } = members.get(id) ?? {
      leaders: [],
      participants: [],
      people: [],
    }
    const groupName = text(row.name)
    // A group from what it is now: named, or discipling more than one person.
    // The relationship's kind is a capacity declaration and is not read (ADR-0004).
    const isAGroup = groupName !== null || participants.length > 1

    // The folder the filter files it under. What the relationship declared, where
    // it declared one; for a one-to-one that declared none, the gender its Leader
    // gave at Intake; and nothing for a group that declared none, which is mixed
    // and appears under All only.
    const declared = declaredGenderOf(row.declared_gender)
    const leader = people.find((person) => person.role === 'leader')
    const gender = declared ?? (isAGroup ? null : leader ? (genders.get(leader.personId) ?? null) : null)

    // The same derivation the Overview and Care Needed run, over the same rows.
    // Its throw is deliberately not caught, for the reason theirs is not.
    const derived = deriveRelationshipState(
      {
        acceptedAt,
        endedAt: null,
        pausedAt: pauses.get(id)?.pausedAt ?? null,
        timeZone,
        weeks: weeks.get(id) ?? [],
        concerns: concerns.raised.get(id) ?? [],
      },
      now,
    )

    relationships.push({
      relationshipId: relationshipId(id),
      leaderNames: leaders,
      participantNames: participants,
      groupName,
      isAGroup,
      acceptedAt,
      runningMaterialId: running.materialId,
      since: running.startedAt,
      previously: closedPeriodsOf(own),
      gender,
      state: derived.state,
      reasons: derived.reasons,
      openConcerns: derived.openConcerns,
    })
  }

  return {
    timeZone,
    materials: materialsOn(doc),
    relationships: relationships.sort(byNames),
    care: careNeededFrom(history, clock),
  }
}

/**
 * The whole tab against whichever signed-in client it is handed, for the tests
 * that drive it with a real session rather than a Next.js request context.
 * Asking about a Ministry the session does not administer reads as the empty
 * state the policies would have returned.
 */
export const readMaterials = async (
  supabase: SupabaseClient,
  ministryId: MinistryId,
  clock: Clock,
): Promise<MaterialsPage> => {
  const doc = await documentFor(supabase, ministryId, 'materials_page')
  return doc ? materialsFrom(doc, clock) : NOTHING_YET
}

/**
 * Built with a clock rather than reaching for one, because which period is
 * running now and how long a care item has waited are time-dependent rules like
 * any other, and the composition root decides whose clock answers them.
 */
export const createSupabaseMaterialsReader = (clock: Clock = systemClock): MaterialsReader => ({
  async readMaterialsPage(surface, gender) {
    // The tab is read under its own name with the filter beside it, for the edge
    // log; a folder is read under its own name and carries no filter, because the
    // function reads nothing off it either way.
    const doc =
      surface === 'materials'
        ? await readPageDocument(await createSupabaseServerClient(), 'materials_page', { gender })
        : await readPageDocument(await createSupabaseServerClient(), 'material_page')
    return adminPage(doc, () => materialsFrom(doc, clock))
  },
})
