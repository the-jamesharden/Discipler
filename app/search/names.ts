import type { PersonId } from '~/domain/ids'
import { asList } from '~/domain/outbound-copy'
import type { SearchPage, SearchPerson, SearchRelationship } from '~/service/ports'
import { HELP_PAGES } from '../help/library'
import { initialsOf } from '../initials'
import { inPairingOrder, whyNotPairable } from '../roster/lists'
import { CANNOT_BE_PAIRED, PAIR_POPUP, pairingWithItsDirection } from '../roster/copy'
import {
  ADMIN,
  ADMIN_YOU,
  andMore,
  groupOf,
  PAIR_AWAITING,
  pairStarted,
  READY_TO_PAIR,
  WHERE,
} from './copy'
import type { DirectoryRow } from './match'
import type { SearchNames } from './pages'

/**
 * What `/search` answers with: the rows behind People, Relationships, Materials and
 * Help, each saying what it is and where it opens. Decided on the server so the browser
 * is sent a row and nothing it was derived from.
 */

/**
 * The line under a person. Their pairing in the Roster's own words rather than a
 * Participation Status, because *Ready to Pair* on somebody who leads says the opposite
 * of what they do (`app/roster/tags.ts`). The mock-up's "Ready to Pair" is what is left
 * for somebody who holds no pairing and can be given one.
 */
const lineUnder = (person: SearchPerson, you: PersonId | null): string => {
  if (person.isAdmin) return person.personId === you ? ADMIN_YOU : ADMIN

  const state = whyNotPairable(person)
  if (state) return CANNOT_BE_PAIRED[state]

  const said = inPairingOrder(person.pairings).flatMap((pairing) => pairingWithItsDirection(pairing) ?? [])
  return said[0] ? andMore(said[0], said.length - 1) : READY_TO_PAIR
}

const personRow = (person: SearchPerson, you: PersonId | null): DirectoryRow => ({
  label: person.fullName,
  sub: lineUnder(person, you),
  href: `/roster/${person.personId}`,
  where: WHERE.roster,
  icon: 'people',
  initials: initialsOf(person.fullName),
})

/** `October 4`, in the church's own zone, with the year once it is not this one. */
const startedOn = (date: Date, timeZone: string, now: Date): string => {
  const yearOf = (instant: Date) =>
    new Intl.DateTimeFormat('en-US', { year: 'numeric', timeZone }).format(instant)
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone,
    ...(yearOf(date) === yearOf(now) ? {} : { year: 'numeric' }),
  })
}

const relationshipRow = (
  relationship: SearchRelationship,
  timeZone: string,
  now: Date,
): DirectoryRow => {
  const { groupName, leaderNames, participantNames, isAGroup, acceptedAt } = relationship
  const everyone = [...leaderNames, ...participantNames]

  return {
    label: isAGroup
      ? PAIR_POPUP.groupLabel({
          name: groupName,
          leaders: leaderNames.map((fullName) => ({ fullName })),
        })
      : asList(everyone),
    sub: isAGroup
      ? groupOf(everyone.length)
      : acceptedAt
        ? pairStarted(startedOn(acceptedAt, timeZone, now))
        : PAIR_AWAITING,
    // To its card on the Overview, and not into it: opening a card reads its Concerns
    // and records the reading, which a search should not do on anybody's behalf. An
    // unaccepted one has no card until it has waited, so it goes to whoever leads it.
    href: relationship.onTheOverview
      ? `/overview#rel-${relationship.relationshipId}`
      : relationship.leaderId
        ? `/roster/${relationship.leaderId}`
        : '/roster',
    where: relationship.onTheOverview ? WHERE.overview : WHERE.roster,
    icon: isAGroup ? 'people' : 'pair',
    also: everyone.join(' '),
  }
}

export const searchNames = (page: SearchPage, you: PersonId | null, now: Date): SearchNames => ({
  people: page.people.map((person) => personRow(person, you)),
  relationships: page.relationships
    // Nobody left in it means no name to find it by.
    .filter((each) => each.groupName !== null || each.leaderNames.length + each.participantNames.length > 0)
    .map((each) => relationshipRow(each, page.timeZone, now)),
  materials: page.materials.map(({ materialId, title }) => ({
    label: title,
    href: `/materials/${materialId}`,
    where: WHERE.materials,
    icon: 'material',
  })),
  help: HELP_PAGES.map((page) => ({
    label: page.title,
    sub: page.lead,
    href: page.href,
    where: WHERE.helpCenter,
    icon: 'help',
  })),
})
