import { describe, expect, it } from 'vitest'
import {
  drawOverlay,
  type AvailabilityOverlay,
  type OverlayMember,
  type OverlaySlot,
} from '~/domain/availability-overlay'
import { personId } from '~/domain/ids'
import { DAY_BLOCKS, WEEKDAYS, type AvailabilitySlot } from '~/domain/intake'

/**
 * The Availability Overlay: everyone's Intake availability drawn on one grid, so a
 * Leader can see where a meeting fits.
 *
 * Nothing here schedules anything, and that is the rule the whole module is built
 * to keep. The overlay names the slot with the greatest overlap the Leader also
 * marked and stops there -- the Leader chooses the time and sends the invitation
 * themselves, including a slot with better overlap they did not mark. Where no slot
 * gathers everyone including the Leader, it says so rather than naming a time the
 * Leader cannot attend.
 */

const slots = (...keys: string[]): readonly AvailabilitySlot[] =>
  keys.map((key) => {
    const [day, block] = key.split(':')
    return { day, block } as AvailabilitySlot
  })

const member = (name: string, ...keys: string[]): OverlayMember => ({
  personId: personId(`person-${name.toLowerCase().replace(/\s+/g, '-')}`),
  fullName: name,
  role: 'participant',
  slots: slots(...keys),
})

/** The Leader reading the grid, and any co-Leader beside them. */
const leader = (name: string, ...keys: string[]): OverlayMember => ({
  ...member(name, ...keys),
  role: 'leader',
})

const at = (overlay: AvailabilityOverlay, key: string): OverlaySlot => {
  const [day, block] = key.split(':')
  const found = overlay.slots.find((slot) => slot.day === day && slot.block === block)
  if (!found) throw new Error(`The overlay has no slot at ${key}`)
  return found
}

describe('the availability overlay', () => {
  it('draws one cell for every slot on the grid, days down and blocks across', () => {
    const overlay = drawOverlay(leader('David Ellis', 'monday:midday'), [
      member('Emily Johnson', 'monday:midday'),
    ])

    expect(overlay.slots).toHaveLength(WEEKDAYS.length * DAY_BLOCKS.length)

    // Day-major, so a renderer walking the list in order emits one row per day with
    // the blocks along it -- which is the axis assignment the spec fixes.
    expect(overlay.slots.slice(0, DAY_BLOCKS.length).map((slot) => slot.block)).toEqual([
      ...DAY_BLOCKS,
    ])
    expect([...new Set(overlay.slots.map((slot) => slot.day))]).toEqual([...WEEKDAYS])
  })

  it('puts everyone on the same grid, the Leader first', () => {
    const overlay = drawOverlay(leader('David Ellis', 'monday:midday'), [
      member('Ruth Adeyemi', 'monday:midday'),
      member('Marcus Webb', 'tuesday:evening'),
    ])

    expect(overlay.people.map((person) => person.fullName)).toEqual([
      'David Ellis',
      'Ruth Adeyemi',
      'Marcus Webb',
    ])
    expect(overlay.people.map((person) => person.role)).toEqual([
      'leader',
      'participant',
      'participant',
    ])
    expect(overlay.people.map((person) => person.isYou)).toEqual([true, false, false])
  })

  describe('with one Participant', () => {
    const me = leader('David Ellis', 'monday:midday', 'tuesday:evening')
    const emily = member('Emily Johnson', 'monday:midday', 'thursday:morning')
    const overlay = drawOverlay(me, [emily])

    it('shades a slot they both marked as mutual', () => {
      expect(at(overlay, 'monday:midday').shading).toBe('mutual')
    })

    it('shades a slot only the Participant marked as theirs alone', () => {
      // The asymmetry is the point: it shows a Leader exactly where the other
      // person can meet and they said they could not, which is where a Leader may
      // choose to move something.
      expect(at(overlay, 'thursday:morning').shading).toBe('participant_only')
    })

    it('leaves a slot only the Leader marked unshaded', () => {
      // Green and yellow are the two colours the spec names, and neither of them is
      // this. A Leader's own free evening that nobody can meet in is not a finding.
      expect(at(overlay, 'tuesday:evening').shading).toBe('unshaded')
    })

    it('leaves a slot nobody marked unshaded', () => {
      expect(at(overlay, 'saturday:early_morning').shading).toBe('unshaded')
    })
  })

  it('shades nothing when there are several Participants, because each carries a colour', () => {
    const overlay = drawOverlay(leader('David Ellis', 'monday:midday'), [
      member('Ruth Adeyemi', 'monday:midday'),
      member('Marcus Webb', 'monday:midday'),
    ])

    // Green and yellow are a two-person reading and do not generalise: with two
    // Participants on the grid, the question is which slot gathers the most of
    // them, and that is answered by who is drawn in each cell.
    expect(overlay.slots.every((slot) => slot.shading === 'unshaded')).toBe(true)
    expect(at(overlay, 'monday:midday').available).toHaveLength(3)
  })

  it('names who is available in each slot, in the order the people are drawn', () => {
    const me = leader('David Ellis', 'monday:midday')
    const ruth = member('Ruth Adeyemi', 'monday:midday', 'friday:evening')
    const marcus = member('Marcus Webb', 'friday:evening')
    const overlay = drawOverlay(me, [ruth, marcus])

    expect(at(overlay, 'monday:midday').available).toEqual([me.personId, ruth.personId])
    expect(at(overlay, 'friday:evening').available).toEqual([ruth.personId, marcus.personId])
  })

  describe('the slot it highlights', () => {
    it('is the one with the greatest overlap that the Leader also marked', () => {
      const overlay = drawOverlay(leader('David Ellis', 'monday:midday', 'friday:evening'), [
        member('Ruth Adeyemi', 'monday:midday', 'friday:evening'),
        member('Marcus Webb', 'friday:evening'),
        member('Dani Osei', 'friday:evening'),
      ])

      expect(overlay.recommended).toEqual({ day: 'friday', block: 'evening' })
      expect(at(overlay, 'friday:evening').recommended).toBe(true)
      expect(at(overlay, 'monday:midday').recommended).toBe(false)
      expect(overlay.slots.filter((slot) => slot.recommended)).toHaveLength(1)
    })

    it('is never a slot the Leader did not mark, however well it gathers', () => {
      // The Leader may still choose it -- the grid draws it, and it is on the list
      // in front of them. What Discipler must not do is recommend a time the Leader
      // said they could not attend.
      const overlay = drawOverlay(leader('David Ellis', 'monday:midday'), [
        member('Ruth Adeyemi', 'monday:midday', 'friday:evening'),
        member('Marcus Webb', 'friday:evening'),
        member('Dani Osei', 'friday:evening'),
      ])

      expect(overlay.recommended).toEqual({ day: 'monday', block: 'midday' })
      expect(at(overlay, 'friday:evening').available).toHaveLength(3)
      expect(at(overlay, 'friday:evening').recommended).toBe(false)
    })

    it('breaks a tie on the order of the week, so the same grid always highlights the same slot', () => {
      const overlay = drawOverlay(leader('David Ellis', 'friday:evening', 'monday:midday'), [
        member('Ruth Adeyemi', 'monday:midday', 'friday:evening'),
      ])

      expect(overlay.recommended).toEqual({ day: 'monday', block: 'midday' })
    })

    it('is nothing at all where no slot the Leader marked gathers anybody', () => {
      const overlay = drawOverlay(leader('David Ellis', 'monday:midday'), [
        member('Emily Johnson', 'thursday:morning'),
      ])

      expect(overlay.recommended).toBeNull()
      expect(overlay.slots.some((slot) => slot.recommended)).toBe(false)
    })

    it('is nothing at all where the Leader marked no availability of their own', () => {
      const overlay = drawOverlay(leader('David Ellis'), [
        member('Emily Johnson', 'thursday:morning'),
      ])

      expect(overlay.recommended).toBeNull()
    })
  })

  describe('whether everyone can meet', () => {
    it('holds where one slot gathers every Participant and the Leader', () => {
      const overlay = drawOverlay(leader('David Ellis', 'monday:midday'), [
        member('Ruth Adeyemi', 'monday:midday'),
        member('Marcus Webb', 'monday:midday', 'friday:evening'),
      ])

      expect(overlay.everyoneCanMeet).toBe(true)
    })

    it('fails where the fullest slot the Leader marked still leaves somebody out', () => {
      const overlay = drawOverlay(leader('David Ellis', 'monday:midday'), [
        member('Ruth Adeyemi', 'monday:midday'),
        member('Marcus Webb', 'friday:evening'),
      ])

      // There is still a slot to highlight -- Monday gathers Ruth -- and the grid
      // says plainly that it does not gather everyone, rather than staying quiet and
      // letting the highlight read as *this is the time*.
      expect(overlay.recommended).toEqual({ day: 'monday', block: 'midday' })
      expect(overlay.everyoneCanMeet).toBe(false)
    })

    it('fails where the only slot gathering everyone is one the Leader did not mark', () => {
      const overlay = drawOverlay(leader('David Ellis', 'monday:midday'), [
        member('Ruth Adeyemi', 'monday:midday', 'friday:evening'),
        member('Marcus Webb', 'friday:evening'),
      ])

      // *Everyone including the Leader* is the test, and it is the whole point of
      // the sentence. Friday gathers both Participants and the Leader cannot attend.
      expect(overlay.everyoneCanMeet).toBe(false)
    })

    it('fails where nobody has any availability on file at all', () => {
      const overlay = drawOverlay(leader('David Ellis'), [member('Emily Johnson')])

      expect(overlay.everyoneCanMeet).toBe(false)
      expect(overlay.recommended).toBeNull()
    })

    it('does not hold on a relationship with no Participants left in it', () => {
      // A Leader whose only Participant has departed has nobody to meet, and a grid
      // reporting *everyone can meet on Monday* would be true and useless.
      const overlay = drawOverlay(leader('David Ellis', 'monday:midday'), [])

      expect(overlay.everyoneCanMeet).toBe(false)
      expect(overlay.recommended).toBeNull()
    })
  })

  it('ignores a slot outside the grid rather than drawing a cell for it', () => {
    // Availability arrives from the database as rows keyed to an enum, so this is a
    // drift check rather than an input check: a block added to the type and not to
    // WEEKDAYS/DAY_BLOCKS must not silently grow the grid.
    const overlay = drawOverlay(
      { ...member('David Ellis'), slots: slots('someday:midday', 'monday:teatime') },
      [member('Emily Johnson', 'monday:midday')],
    )

    expect(overlay.slots).toHaveLength(35)
    expect(at(overlay, 'monday:midday').leaderIsAvailable).toBe(false)
  })

  it('counts a Person once however many times they marked the same slot', () => {
    // Two Intake submissions from one Person are two rows for the same slot, and a
    // cell that counted both would report an overlap of two people where there is
    // one.
    const emily = member('Emily Johnson')
    const overlay = drawOverlay(leader('David Ellis', 'monday:midday'), [
      { ...emily, slots: slots('monday:midday', 'monday:midday') },
    ])

    expect(at(overlay, 'monday:midday').available).toEqual([
      overlay.people[0]!.personId,
      emily.personId,
    ])
    expect(at(overlay, 'monday:midday').others).toBe(1)
  })

  describe('a group holding a second Leader', () => {
    /**
     * `one_to_one_one_open_leader` binds one-to-ones to a single Leader and
     * deliberately leaves groups alone, so a co-led group is an ordinary shape --
     * and the co-Leader is somebody to find a time with like anybody else.
     */
    const me = leader('David Ellis', 'monday:midday')
    const coLeader = leader('Priya Raman', 'monday:midday')
    const ruth = member('Ruth Adeyemi', 'monday:midday')

    it('draws the co-Leader on the grid, with their own place among the people', () => {
      const overlay = drawOverlay(me, [coLeader, ruth])

      expect(overlay.people.map((person) => person.fullName)).toEqual([
        'David Ellis',
        'Priya Raman',
        'Ruth Adeyemi',
      ])
      expect(overlay.people.map((person) => person.role)).toEqual([
        'leader',
        'leader',
        'participant',
      ])
      // Two Leaders and only one of them is reading. The asymmetry the grid is
      // built on is a claim about the person in front of the screen.
      expect(overlay.people.map((person) => person.isYou)).toEqual([true, false, false])
      expect(at(overlay, 'monday:midday').available).toHaveLength(3)
    })

    it('counts the co-Leader in whether everyone can meet', () => {
      const busy = leader('Priya Raman', 'friday:evening')
      const overlay = drawOverlay(me, [busy, ruth])

      // Monday gathers the reading Leader and Ruth. Reporting that as *everyone*
      // would be telling a Leader to invite a co-Leader who cannot come.
      expect(overlay.recommended).toEqual({ day: 'monday', block: 'midday' })
      expect(overlay.everyoneCanMeet).toBe(false)
    })

    it('still shades, because one Participant and a co-Leader is one Participant', () => {
      const overlay = drawOverlay(me, [coLeader, ruth])

      // Green and yellow answer *can we two meet*, and the two are the reading
      // Leader and the person they are discipling. A co-Leader standing alongside
      // does not take that question away -- they carry their own colour in the cell
      // and the shading is a second signal over the top.
      expect(at(overlay, 'monday:midday').shading).toBe('mutual')
    })

    it('shades on the Participant and not on whoever else marked the slot', () => {
      // Friday is the co-Leader alone: one other person marked it, and it is not a
      // slot the reading Leader and Ruth can meet in.
      const overlay = drawOverlay(me, [leader('Priya Raman', 'friday:evening'), ruth])

      expect(at(overlay, 'friday:evening').others).toBe(1)
      expect(at(overlay, 'friday:evening').shading).toBe('unshaded')
    })

    it('shades a slot the Participant marked and the reading Leader did not', () => {
      const overlay = drawOverlay(me, [coLeader, member('Ruth Adeyemi', 'thursday:morning')])

      expect(at(overlay, 'thursday:morning').shading).toBe('participant_only')
    })
  })
})
