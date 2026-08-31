import type { PersonId } from './ids'
import {
  DAY_BLOCKS,
  WEEKDAYS,
  type AvailabilitySlot,
  type DayBlock,
  type Weekday,
} from './intake'

/**
 * The Availability Overlay: everyone in one relationship drawn on one grid, so a
 * Leader can see where a meeting fits.
 *
 * It is the same grid Intake collects on -- seven days by five named blocks -- and
 * that is not a coincidence to be maintained by hand. An overlay drawn on a
 * different grid from the one the answers were given on is not an overlay of
 * anything, so the axes are `WEEKDAYS` and `DAY_BLOCKS` themselves rather than a
 * copy of them. See `docs/adr/0006-the-availability-grid.md`.
 *
 * **Nothing here schedules anything.** The overlay names the slot with the greatest
 * overlap the Leader also marked and stops. The Leader chooses the time and sends
 * the invitation themselves -- including a slot with better overlap they did not
 * mark, which the grid draws and this never names. Availability is a starting point
 * for making first contact, not a standing record of anybody's schedule.
 */

export interface OverlayMember {
  readonly personId: PersonId
  readonly fullName: string
  readonly role: 'leader' | 'participant'
  /**
   * What they selected at Intake. Duplicates are ordinary -- a Person with two
   * submissions has two rows for a slot they picked twice -- and are counted once.
   */
  readonly slots: readonly AvailabilitySlot[]
}

export interface OverlayPerson {
  readonly personId: PersonId
  readonly fullName: string
  readonly role: 'leader' | 'participant'
  /**
   * Whether this is the Leader the grid is drawn for. Not the same question as
   * `role`: a group may hold several Leaders -- see
   * `one_to_one_one_open_leader`, which binds one-to-ones and deliberately leaves
   * groups alone -- and only one of them is reading.
   */
  readonly isYou: boolean
}

/**
 * Green and yellow, and the absence of both.
 *
 * A two-person reading, and deliberately not generalised. Where one other person is
 * on the grid the question is *can we two meet*, which has an asymmetric answer
 * worth a colour: `participant_only` is where the other person can meet and the
 * Leader said they could not, which is where a Leader may choose to move something.
 * Where several are, the question is *which slot gathers the most people*, and that
 * is answered by who is drawn in the cell rather than by shading it -- so every cell
 * is `unshaded` and each person carries their own colour instead.
 *
 * Keyed on *how many other people are on the grid* rather than on the Participant
 * count, and the two come apart on exactly one shape: a group holding a second
 * Leader. One Participant and a co-Leader is three people, and green-and-yellow
 * would be answering a question about two of them while drawing three.
 */
export type SlotShading = 'mutual' | 'participant_only' | 'unshaded'

export interface OverlaySlot {
  readonly day: Weekday
  readonly block: DayBlock
  /** Everyone who marked it, in the order `people` draws them. Leader included. */
  readonly available: readonly PersonId[]
  readonly leaderIsAvailable: boolean
  /** How many *other* people marked it. What the highlight ranks on. */
  readonly others: number
  readonly shading: SlotShading
  readonly recommended: boolean
}

export interface AvailabilityOverlay {
  /** The reading Leader first, then everyone else in the order they were given. */
  readonly people: readonly OverlayPerson[]
  /** Thirty-five cells, day-major: one row per day with the blocks along it. */
  readonly slots: readonly OverlaySlot[]
  /**
   * The slot with the greatest overlap the Leader also marked, or null where no
   * slot they marked gathers anybody. A suggestion and never a booking.
   */
  readonly recommended: AvailabilitySlot | null
  /**
   * Whether some slot the Leader marked gathers everybody else as well. False on a
   * relationship with nobody else left in it: a Leader with nobody to meet is not a
   * Leader who can meet everybody.
   */
  readonly everyoneCanMeet: boolean
}

/** `monday:midday`. The key both the Intake form and this module slice a slot by. */
const keyOf = (slot: { readonly day: string; readonly block: string }): string =>
  `${slot.day}:${slot.block}`

/**
 * The slots one Person marked, as a set of keys. A set rather than the array,
 * because two Intake submissions from one Person hold two rows for a slot they
 * picked twice -- and a cell that counted both would report an overlap of two
 * people where there is one.
 */
const marked = (member: OverlayMember): ReadonlySet<string> =>
  new Set(member.slots.map(keyOf))

/**
 * `you` is the Leader reading the grid, and `others` is everybody else in the
 * relationship whatever their role -- the Participants, and any co-Leader.
 *
 * Role is carried on each of them rather than assumed from the position, because a
 * group may hold several Leaders and only one of them is reading. The asymmetry the
 * whole overlay is built on -- *they can meet, you said you could not* -- is a claim
 * about the person in front of the screen, so `you` is the one whose marks constrain
 * the highlight, and a co-Leader is somebody to find a time with like anybody else.
 */
export const drawOverlay = (
  you: OverlayMember,
  others: readonly OverlayMember[],
): AvailabilityOverlay => {
  const people: OverlayPerson[] = [
    { personId: you.personId, fullName: you.fullName, role: you.role, isYou: true },
    ...others.map((person) => ({
      personId: person.personId,
      fullName: person.fullName,
      role: person.role,
      isYou: false,
    })),
  ]

  const leaderMarked = marked(you)
  const othersMarked = others.map(marked)

  // The grid is built from the axes rather than from the answers, so a slot nobody
  // selected is still a cell. A grid that drew only the slots somebody picked would
  // tell a Leader where people are free and never where they are not, which is half
  // the question -- and the rows would not line up between two relationships.
  const cells = WEEKDAYS.flatMap((day) =>
    DAY_BLOCKS.map((block) => {
      const key = keyOf({ day, block })
      const leaderIsAvailable = leaderMarked.has(key)

      const available: PersonId[] = leaderIsAvailable ? [you.personId] : []
      let present = 0
      othersMarked.forEach((slots, index) => {
        if (!slots.has(key)) return
        available.push(others[index]!.personId)
        present += 1
      })

      return { day, block, available, leaderIsAvailable, others: present }
    }),
  )

  // Only ever a slot the Leader marked. Where a fuller slot exists that they did
  // not, the grid still draws it and the Leader may still choose it -- what
  // Discipler must not do is put its own name to a time the Leader said they could
  // not attend.
  //
  // Ties go to the earlier cell, which is the earlier point in the week: the grid
  // is walked in order and a later cell has to be strictly better to displace one.
  // Not tidiness -- the same answers must highlight the same slot every time the
  // page is drawn, or a Leader returning to it reads two different suggestions.
  let best: (typeof cells)[number] | null = null
  for (const cell of cells) {
    if (!cell.leaderIsAvailable || cell.others === 0) continue
    if (!best || cell.others > best.others) best = cell
  }

  // *Everyone including the Leader*, which is the whole of the sentence. A slot
  // that gathers every Participant and not the Leader is not one where everyone can
  // meet, and the grid says so rather than recommending it.
  const everyoneCanMeet =
    others.length > 0 &&
    cells.some((cell) => cell.leaderIsAvailable && cell.others === others.length)

  const isRecommended = (cell: (typeof cells)[number]) =>
    best !== null && cell.day === best.day && cell.block === best.block

  return {
    people,
    slots: cells.map((cell) => ({
      ...cell,
      shading: shadingFor(cell, others.length),
      recommended: isRecommended(cell),
    })),
    recommended: best ? { day: best.day, block: best.block } : null,
    everyoneCanMeet,
  }
}

const shadingFor = (
  cell: { readonly leaderIsAvailable: boolean; readonly others: number },
  otherCount: number,
): SlotShading => {
  if (otherCount !== 1) return 'unshaded'
  if (cell.others === 0) return 'unshaded'
  return cell.leaderIsAvailable ? 'mutual' : 'participant_only'
}
