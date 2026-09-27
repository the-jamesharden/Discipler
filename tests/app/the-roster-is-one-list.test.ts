import { describe, expect, it } from 'vitest'
import { intendedPairingId, personId, relationshipId } from '~/domain/ids'
import type { RosterEntry, RosterIntendedPairing, RosterRelationship } from '~/service/ports'
import { peopleTotal, ROSTER_MENU, shownAs, STATS_LABEL, NOBODY_SHOWN } from '../../app/roster/copy'
import { inPairingOrder, pairPopupHref, rosterStats } from '../../app/roster/lists'
import {
  EVERYONE,
  isEveryone,
  isShown,
  menuCounts,
  MENU_OPEN,
  pairHref,
  PAIRINGS,
  PAIRINGS_MEANS,
  rosterHref,
  theMenu,
  viewFields,
  viewIn,
  type RosterView,
} from '../../app/roster/menu'

/**
 * The Roster is one list (Roles per pairing, ticket 02). The All / Disciplers /
 * Disciples toggle went, and one menu replaced it: **Everyone** at the top, which
 * clears it, then Pairings (tick any, a person matches every one ticked), Gender
 * (pick one) and Access. Every option counts over the whole Roster, and what is
 * ticked lives in the address. Pure over the reader's own type, so the rule is
 * driven with no database near it.
 *
 * The Ministry below is the mock-ups' twelve (`.lavish/roles-per-pairing/`), so
 * the counts here are the counts James approved on screen, but for Women: Mia
 * has not completed Intake, so no gender is on file for her.
 */

let counter = 0

const person = (fullName: string, over: Partial<RosterEntry> = {}): RosterEntry => ({
  personId: personId(`person-${++counter}`),
  fullName,
  participationStatus: 'ready_to_pair',
  relationships: [],
  declaredSide: null,
  firstTime: null,
  holdsAnAccount: false,
  phone: null,
  email: null,
  gender: 'female',
  isAdmin: false,
  intendedPairings: [],
  ...over,
})

const held = (role: RosterRelationship['role'], over: Partial<RosterRelationship> = {}): RosterRelationship => ({
  relationshipId: relationshipId(`relationship-${++counter}`),
  role,
  withNames: [],
  leaderNames: [],
  participantNames: [],
  participantCount: 1,
  countsAsAGroup: false,
  name: null,
  awaitingAcceptance: false,
  ...over,
})

const plan = (role: RosterIntendedPairing['role']): RosterIntendedPairing => ({
  id: intendedPairingId(`plan-${++counter}`),
  role,
  withPersonId: personId(`person-with-${counter}`),
  withName: `Somebody ${counter}`,
  state: 'awaiting_intake',
  refusal: null,
})

const oneToOne = (leader: string, disciple: string) => ({
  leads: held('leader', { leaderNames: [leader], participantNames: [disciple] }),
  in: held('participant', { leaderNames: [leader], participantNames: [disciple] }),
})
const group = (name: string, leader: string, disciples: readonly string[]) => {
  const shape = { name, leaderNames: [leader], participantNames: disciples, participantCount: disciples.length, countsAsAGroup: true }
  return { leads: held('leader', shape), in: held('participant', shape) }
}

const tuesday = group('Tuesday Women’s', 'Grace Lee', ['Hannah Brooks', 'Lily Evans'])
const thursday = group('Men’s Thursday', 'David Morris', ['Noah Reed', 'Ben Carter'])
const graceEmily = oneToOne('Grace Lee', 'Emily Davis')
const emilyChloe = oneToOne('Emily Davis', 'Chloe Park')
const rachelHannah = oneToOne('Rachel Adams', 'Hannah Brooks')

const david = person('David Morris', { gender: 'male', isAdmin: true, holdsAnAccount: true, relationships: [thursday.leads] })
const grace = person('Grace Lee', { relationships: [tuesday.leads, graceEmily.leads] })
const emily = person('Emily Davis', { participationStatus: 'paired', relationships: [graceEmily.in, emilyChloe.leads] })
const chloe = person('Chloe Park', { participationStatus: 'paired', relationships: [emilyChloe.in] })
const rachel = person('Rachel Adams', { declaredSide: 'mentor', relationships: [rachelHannah.leads] })
const hannah = person('Hannah Brooks', { participationStatus: 'paired', relationships: [tuesday.in, rachelHannah.in] })
const lily = person('Lily Evans', { participationStatus: 'paired', relationships: [tuesday.in] })
const noah = person('Noah Reed', { gender: 'male', participationStatus: 'paired', relationships: [thursday.in] })
const ben = person('Ben Carter', { gender: 'male', participationStatus: 'paired', relationships: [thursday.in] })
const sarah = person('Sarah Kim', { declaredSide: 'mentee' })
const jacob = person('Jacob Hill', { gender: 'male', declaredSide: 'mentor' })
// No Intake, so no gender on file: the mock-ups counted her a woman, and the real
// Roster cannot.
const mia = person('Mia Chen', { participationStatus: 'no_intake_submitted', gender: null })
const roster = [david, grace, emily, chloe, rachel, hannah, lily, noah, ben, sarah, jacob, mia]

const view = (over: Partial<RosterView> = {}): RosterView => ({ ...EVERYONE, ...over })
const shown = (seen: RosterView) => roster.filter((each) => isShown(seen, each)).map(({ fullName }) => fullName)

describe('what each Pairings option means', () => {
  const who = (option: (typeof PAIRINGS)[number]) =>
    roster.filter((each) => PAIRINGS_MEANS[option](each)).map(({ fullName }) => fullName)

  it('is Disciples somebody for anybody leading an open pairing, one awaiting their acceptance included', () => {
    expect(who('disciples-somebody')).toEqual(['David Morris', 'Grace Lee', 'Emily Davis', 'Rachel Adams'])
    const invited = person('Asked To Lead', { relationships: [held('leader', { awaitingAcceptance: true })] })
    expect(PAIRINGS_MEANS['disciples-somebody'](invited)).toBe(true)
  })

  it('is Being discipled for anybody discipled in an open pairing, one-to-one or group', () => {
    expect(who('being-discipled')).toEqual(['Emily Davis', 'Chloe Park', 'Hannah Brooks', 'Lily Evans', 'Noah Reed', 'Ben Carter'])
  })

  it('is In a group for anybody on either side of a pairing with more than one Disciple now', () => {
    expect(who('in-a-group')).toEqual(['David Morris', 'Grace Lee', 'Hannah Brooks', 'Lily Evans', 'Noah Reed', 'Ben Carter'])
    // Read from the live count, as the size tag is: a group fallen to one Disciple is not one here.
    const fallen = person('Fallen', { relationships: [held('leader', { participantCount: 1, countsAsAGroup: true })] })
    expect(PAIRINGS_MEANS['in-a-group'](fallen)).toBe(false)
  })

  it('is Unpaired for anybody holding no open pairing on either side and no plan an import made', () => {
    expect(who('unpaired')).toEqual(['Sarah Kim', 'Jacob Hill', 'Mia Chen'])
    expect(PAIRINGS_MEANS.unpaired(person('Planned', { intendedPairings: [plan('participant')] }))).toBe(false)
  })

  it('is Offered to disciple, not yet discipling, for a Mentor answer from somebody who leads nothing', () => {
    // Rachel answered Mentor too, and leads Hannah.
    expect(who('offered-to-disciple')).toEqual(['Jacob Hill'])
  })

  it('is Awaiting Intake for anybody whose Participation Status is No Intake Submitted', () => {
    expect(who('awaiting-intake')).toEqual(['Mia Chen'])
  })
})

describe('who the Roster shows', () => {
  it('shows everybody, once each, with nothing ticked', () => {
    expect(isEveryone(EVERYONE)).toBe(true)
    expect(shown(EVERYONE)).toEqual(roster.map(({ fullName }) => fullName))
  })

  it('shows a person matching every Pairings option ticked, and not any one of them', () => {
    expect(shown(view({ pairings: ['being-discipled'] }))).toHaveLength(6)
    expect(shown(view({ pairings: ['disciples-somebody', 'being-discipled'] }))).toEqual(['Emily Davis'])
    expect(shown(view({ pairings: ['being-discipled', 'in-a-group'] }))).toEqual(['Hannah Brooks', 'Lily Evans', 'Noah Reed', 'Ben Carter'])
    expect(shown(view({ pairings: ['disciples-somebody', 'unpaired'] }))).toEqual([])
  })

  it('narrows by one gender, and shows men and women where none is picked', () => {
    expect(shown(view({ gender: 'men' }))).toEqual(['David Morris', 'Noah Reed', 'Ben Carter', 'Jacob Hill'])
    expect(shown(view({ gender: 'women' }))).toHaveLength(7)
    // Somebody no form has asked is shown under Men and women and under neither one.
    const unasked = person('Unasked', { gender: null })
    expect(isShown(EVERYONE, unasked)).toBe(true)
    expect(isShown(view({ gender: 'men' }), unasked) || isShown(view({ gender: 'women' }), unasked)).toBe(false)
  })

  it('shows the mock-up’s Being discipled · Women', () => {
    expect(shown(view({ pairings: ['being-discipled'], gender: 'women' }))).toEqual([
      'Emily Davis',
      'Chloe Park',
      'Hannah Brooks',
      'Lily Evans',
    ])
  })

  it('shows the Admins under Access', () => {
    expect(shown(view({ admins: true }))).toEqual(['David Morris'])
  })
})

describe('the counts beside each option', () => {
  it('counts every option over the whole Roster, as the mock-ups do', () => {
    expect(menuCounts(roster)).toEqual({
      everyone: 12,
      pairings: {
        'disciples-somebody': 4,
        'being-discipled': 6,
        'in-a-group': 6,
        unpaired: 3,
        'offered-to-disciple': 1,
        'awaiting-intake': 1,
      },
      gender: { all: 12, men: 4, women: 7 },
      admins: 1,
    })
  })

  it('never narrows a count by the other options ticked', () => {
    const counted = (seen: RosterView) =>
      theMenu(seen, roster).sections.flatMap(({ options }) => options.map(({ count }) => count))
    expect(counted(view({ pairings: ['being-discipled'], gender: 'women', admins: true }))).toEqual(counted(EVERYONE))
  })
})

describe('the Everyone menu', () => {
  it('reads Everyone with nothing ticked, and never Filter', () => {
    expect(shownAs(EVERYONE)).toBe('Everyone')
    expect(JSON.stringify(ROSTER_MENU)).not.toMatch(/filter/i)
  })

  it('names what is shown, joined by a middle dot, in the menu’s order', () => {
    expect(shownAs(view({ pairings: ['being-discipled'], gender: 'women' }))).toBe('Being discipled · Women')
    expect(shownAs(view({ gender: 'men' }))).toBe('Men')
    expect(shownAs(view({ admins: true }))).toBe('Admins')
    expect(shownAs(view({ pairings: ['in-a-group', 'disciples-somebody'], admins: true }))).toBe(
      'Disciples somebody · In a group · Admins',
    )
  })

  it('opens on Everyone, then Pairings, Gender and Access, in the spec’s words', () => {
    const menu = theMenu(EVERYONE, roster)
    expect(menu.button).toBe('Everyone')
    expect(menu.everyone).toMatchObject({ label: 'Everyone', count: 12, ticked: true, href: '/roster' })
    expect(menu.sections.map(({ heading, options }) => [heading, options.map(({ label }) => label)])).toEqual([
      [
        'Pairings',
        [
          'Disciples somebody',
          'Being discipled',
          'In a group',
          'Unpaired',
          'Offered to disciple, not yet discipling',
          'Awaiting Intake',
        ],
      ],
      ['Gender', ['Men and women', 'Men', 'Women']],
      ['Access', ['Admins']],
    ])
    // Men and women is the default, and ticked where nothing else in Gender is.
    expect(menu.sections[1]!.options.map(({ ticked }) => ticked)).toEqual([true, false, false])
    expect(menu.sections.map(({ pick }) => pick)).toEqual(['any', 'one', 'any'])
  })

  it('ticks what the address ticked, and Everyone clears all of it', () => {
    const seen = view({ pairings: ['being-discipled'], gender: 'women' })
    const menu = theMenu(seen, roster)
    expect(menu.button).toBe('Being discipled · Women')
    expect(menu.everyone).toMatchObject({ ticked: false, href: '/roster' })
    const ticked = menu.sections.flatMap(({ options }) => options.filter((option) => option.ticked).map(({ label }) => label))
    expect(ticked).toEqual(['Being discipled', 'Women'])
  })

  it('links each option to the address with that one option changed, keeping the menu open', () => {
    const seen = view({ pairings: ['being-discipled'], gender: 'women' })
    const [pairings, gender, access] = theMenu(seen, roster).sections
    const href = (options: typeof pairings, label: string) => options!.options.find((each) => each.label === label)!.href
    const open = `${MENU_OPEN[0]}=${MENU_OPEN[1]}`

    // A Pairings option ticks or unticks itself, and leaves the others as they were.
    expect(href(pairings, 'In a group')).toBe(`/roster?pairings=being-discipled&pairings=in-a-group&gender=women&${open}`)
    expect(href(pairings, 'Being discipled')).toBe(`/roster?gender=women&${open}`)
    // Gender picks one: another replaces it, and Men and women takes it away.
    expect(href(gender, 'Men')).toBe(`/roster?pairings=being-discipled&gender=men&${open}`)
    expect(href(gender, 'Men and women')).toBe(`/roster?pairings=being-discipled&${open}`)
    expect(href(gender, 'Women')).toBe(`/roster?pairings=being-discipled&gender=women&${open}`)
    expect(href(access, 'Admins')).toBe(`/roster?pairings=being-discipled&gender=women&access=admins&${open}`)
  })
})

describe('what is ticked, in the address', () => {
  const read = (query: string) => {
    const params = new URLSearchParams(query)
    return viewIn((field) => params.getAll(field))
  }

  it('reads what the menu wrote, and writes it back the same', () => {
    const seen = view({ pairings: ['disciples-somebody', 'awaiting-intake'], gender: 'men', admins: true })
    const fields = viewFields(seen)
    expect(fields).toEqual([
      ['pairings', 'disciples-somebody'],
      ['pairings', 'awaiting-intake'],
      ['gender', 'men'],
      ['access', 'admins'],
    ])
    expect(read(new URLSearchParams(fields.map(([name, value]) => [name, value])).toString())).toEqual(seen)
    expect(rosterHref(seen)).toBe('/roster?pairings=disciples-somebody&pairings=awaiting-intake&gender=men&access=admins')
    expect(rosterHref(EVERYONE)).toBe('/roster')
  })

  it('keeps the menu’s order and says each option once, whatever order the address said them in', () => {
    expect(read('pairings=unpaired&pairings=being-discipled&pairings=unpaired').pairings).toEqual(['being-discipled', 'unpaired'])
  })

  it('reads anything it does not know as nothing ticked, an old list included', () => {
    expect(read('list=disciplers')).toEqual(EVERYONE)
    expect(read('list=all&pairings=everyone&gender=both&access=leaders')).toEqual(EVERYONE)
    expect(read('pairings=')).toEqual(EVERYONE)
    // The first gender said is the one read, as with anything else an address says twice.
    expect(read('gender=women&gender=men').gender).toBe('women')
  })
})

describe('the stats line', () => {
  it('reads total, paired and unpaired over the whole Roster with nothing ticked', () => {
    // Paired is an open pairing in either role; a plan an import made is none.
    expect(rosterStats(roster)).toEqual({ total: 12, paired: 9, unpaired: 3 })
    const onlyPlanned = person('Planned', { intendedPairings: [plan('leader')] })
    expect(rosterStats([onlyPlanned])).toEqual({ total: 1, paired: 0, unpaired: 1 })
    expect([STATS_LABEL.total, STATS_LABEL.paired, STATS_LABEL.unpaired]).toEqual(['total', 'paired', 'unpaired'])
  })

  it('reads N shown and M on the Roster while anything is ticked', () => {
    expect([STATS_LABEL.shown, STATS_LABEL.onTheRoster]).toEqual(['shown', 'on the Roster'])
  })

  it('counts people at the top, for the whole Roster', () => {
    expect(peopleTotal(12)).toBe('12 people total')
    expect(peopleTotal(1)).toBe('1 person total')
  })

  it('says so where nobody matches what is ticked', () => {
    expect(NOBODY_SHOWN).toBe('Nobody on the Roster matches what is ticked.')
  })
})

describe('the Paired with cell', () => {
  it('says each pairing in one order: leading first, and a one-to-one before a group within each side', () => {
    const said = (entry: RosterEntry) => inPairingOrder(entry.relationships).map(({ role, participantCount }) => `${role} ${participantCount}`)
    expect(said(grace)).toEqual(['leader 1', 'leader 2'])
    expect(said(emily)).toEqual(['leader 1', 'participant 1'])
    expect(said(hannah)).toEqual(['participant 1', 'participant 2'])
  })
})

describe('where Pair goes', () => {
  it('opens the popup over what the Roster shows, on the side ticket 01 presets', () => {
    expect(pairHref(sarah, EVERYONE)).toBe(`/roster?pair=${sarah.personId}`)
    expect(pairHref(emily, view({ pairings: ['being-discipled'], gender: 'women' }))).toBe(
      `/roster?pairings=being-discipled&gender=women&pair=${emily.personId}`,
    )
  })

  it('never carries the menu open into the popup, or a list', () => {
    expect(pairHref(emily, view({ admins: true }))).not.toContain('menu=')
    expect(pairPopupHref(emily.personId)).toBe(`/roster?pair=${emily.personId}`)
    expect(pairPopupHref(emily.personId, 'disciple')).toBe(`/roster?pair=${emily.personId}&side=disciple`)
  })
})
