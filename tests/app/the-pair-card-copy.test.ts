import { describe, expect, it } from 'vitest'
import { pairShapeOf } from '~/domain/relationships'
import {
  ago,
  checkInLine,
  concernLabel,
  kindLine,
  materialLine,
  pairTitle,
  readingLine,
  stallLabel,
  stallSentence,
  textThem,
} from '../../app/pair-card/copy'

/**
 * What the pair card says (Pastor feedback, ticket 07), worded off the reader's
 * own types with no database near it. Every date in the Ministry's own zone.
 */

const zone = 'America/New_York'
// Monday 12 October 2026, 11pm in New York.
const now = new Date('2026-10-13T03:00:00Z')

describe('which pairs open the pair card', () => {
  it('is a one-to-one with no name, one Discipler and one Disciple', () => {
    expect(pairShapeOf(null, 1, 1)).toBe('one_to_one')
  })

  it('is a 1:2 pair with no name, one Discipler and two Disciples', () => {
    expect(pairShapeOf(null, 1, 2)).toBe('one_to_two')
  })

  it('is no pair at all for a Group, which has a name, or a nameless one larger than three', () => {
    expect(pairShapeOf("Tuesday Women's", 1, 2)).toBeNull()
    expect(pairShapeOf("Tuesday Women's", 1, 1)).toBeNull()
    expect(pairShapeOf(null, 1, 3)).toBeNull()
    expect(pairShapeOf(null, 2, 1)).toBeNull()
  })
})

describe('the head', () => {
  it('says the shape and since when', () => {
    expect(kindLine('one_to_one', new Date('2026-09-07T14:00:00Z'), now, zone)).toBe(
      'One to one · paired 7 Sep, 5 weeks ago',
    )
    expect(kindLine('one_to_two', new Date('2026-10-12T14:00:00Z'), now, zone)).toBe('1:2 pair · paired 12 Oct, today')
  })

  it('counts back in the unit a person would', () => {
    expect(ago(new Date('2026-10-11T14:00:00Z'), now)).toBe('yesterday')
    expect(ago(new Date('2026-10-06T14:00:00Z'), now)).toBe('6 days ago')
    expect(ago(new Date('2026-07-01T14:00:00Z'), now)).toBe('3 months ago')
  })

  it('names both people, and all three of a 1:2 pair', () => {
    expect(pairTitle(['Rachel Adams', 'Emily Davis'])).toBe('Rachel Adams and Emily Davis')
    expect(pairTitle(['Claire Lee', 'Ana Ruiz', 'Beth Shaw'])).toBe('Claire Lee, Ana Ruiz and Beth Shaw')
  })
})

describe('the band', () => {
  it('says who raised a Concern and when', () => {
    expect(concernLabel('Rachel Adams', new Date('2026-10-13T00:07:00Z'), now, zone)).toBe(
      'Concern · raised by Rachel Adams today',
    )
    expect(concernLabel('Sarah Mitchell', new Date('2026-09-22T00:07:00Z'), now, zone)).toBe(
      'Concern · raised by Sarah Mitchell on Mon 21 Sep',
    )
  })

  it('says who read it, this time and the time before', () => {
    expect(readingLine({ by: 'Dan Reyes', at: now }, null, now, zone)).toBe(
      'Read by Dan Reyes at 11:00pm. Resolving clears the words for good.',
    )
    expect(
      readingLine(
        { by: 'Dan Reyes', at: now },
        { by: null, at: new Date('2026-10-10T19:12:00Z') },
        now,
        zone,
      ),
    ).toBe(
      'Read by Dan Reyes at 11:00pm, and before that by an Admin on Sat 10 Oct at 3:12pm. Resolving clears the words for good.',
    )
  })

  it('reports a stall in the unit its condition reports', () => {
    expect(stallLabel({ kind: 'gone_silent', days: 22 })).toBe('Stalled · gone silent')
    expect(stallSentence({ kind: 'gone_silent', days: 22 }, 'Mark Wilson').figure).toBe('22 days since last contact')
    expect(stallLabel({ kind: 'not_meeting', weeks: 3 })).toBe('Stalled · not meeting')
    expect(stallSentence({ kind: 'not_meeting', weeks: 3 }, 'David Kim').figure).toBe('3 weeks running')
  })
})

describe('the people and the facts', () => {
  it('offers to text somebody by their first name', () => {
    expect(textThem('Emily Davis')).toBe('Text Emily')
  })

  it('says the last answer and its date, and never anything else of the week', () => {
    const answeredAt = new Date('2026-10-13T00:05:00Z')
    expect(checkInLine({ answeredAt, met: true, satisfaction: 'good' }, zone)).toBe('Mon 12 Oct · Met · B\u00a0good')
    expect(checkInLine({ answeredAt, met: false, satisfaction: null }, zone)).toBe('Mon 12 Oct · Did not meet')
    expect(checkInLine({ answeredAt, met: true, satisfaction: 'okay' }, zone)).toBe('Mon 12 Oct · Met · C\u00a0okay')
    expect(checkInLine({ answeredAt, met: true, satisfaction: 'concern' }, zone)).toBe('Mon 12 Oct · Met · D\u00a0concern')
  })

  it('says the Material running now and since when, or that there is none yet', () => {
    expect(materialLine({ title: 'Prayer practices', since: new Date('2026-09-21T15:00:00Z') }, zone)).toBe(
      'Prayer practices, since 21 Sep',
    )
    expect(materialLine({ title: null, since: new Date('2026-09-07T14:00:00Z') }, zone)).toBe('No material yet')
    expect(materialLine(null, zone)).toBe('No material yet')
  })
})
