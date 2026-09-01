import { AGE_BANDS } from '~/domain/intake'
import {
  MOST_BANDS_APART,
  QUIET_HOURS,
  type MinistrySettingsRefusal,
} from '~/domain/ministry-settings'
import {
  starterMessageToLeader,
  starterMessageToParticipant,
} from '~/domain/outbound-copy'
import { refusalsIn } from '../refusals'

/**
 * Everything the Ministry settings say in words, in one place. The boundary deals
 * in codes and the screen decides how to say them, for the same reason the
 * Discipleship Goals' copy is its own module: rewording what an Admin reads is a
 * different reason to change than anything the domain changes for.
 */

/** `9` as `9am`, for a control that offers whole hours between 8am and 9pm. */
export const hourLabel = (hour: number): string =>
  hour === 12 ? 'noon' : hour < 12 ? `${hour}am` : `${hour - 12}pm`

const REFUSALS: Record<MinistrySettingsRefusal, string> = {
  'settings.name_missing': 'A ministry needs a name.',
  'settings.timezone_unknown':
    'That is not a timezone we recognise. Pick one from the list — it is the clock every check-in, availability block and week is read against.',
  'settings.leader_noun_missing': 'A ministry needs a word for the person leading.',
  'settings.participant_noun_missing':
    'A ministry needs a word for the person being discipled.',
  // The bounds are read from the domain rather than written out, so a ladder that
  // gains a band and a clamp that moves cannot leave this sentence saying the old
  // numbers -- which is the one kind of wrong an Admin has no way to notice.
  'settings.age_band_gap_unreadable': `The age gap is a whole number of bands, from 0 to ${MOST_BANDS_APART}.`,
  'settings.checkin_day_unreadable': 'Pick a day of the week for the check-in.',
  'settings.checkin_hour_outside_quiet_hours': `Check-ins go out on the hour, between ${hourLabel(QUIET_HOURS.earliest)} and ${hourLabel(QUIET_HOURS.latest)} in your own timezone.`,
}

/**
 * The sentences for the refusals that came back on the query string, in the order
 * they arrived -- which is the order of the fields on the page, so an Admin reads
 * their mistakes top to bottom the way they filled the form in.
 *
 * The sentences are this screen's and the lookup is not: `refusalsIn` is shared
 * with every other surface that reads codes off a query string, and it is what
 * keeps the `Object.hasOwn` -- rather than `in`, which walks the prototype chain
 * -- in one place instead of in each of them.
 */
export const refusalMessages = (codes: string | undefined): readonly string[] =>
  refusalsIn(REFUSALS, codes)

/** The days, in the order a week is read, with the numbers the schema stores. */
export const DAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
] as const

/**
 * What each age gap actually permits, said as the sentence the number is short
 * for. *1* on its own is the reading this setting exists to prevent -- an integer
 * with no stated direction is read as symmetric, and a symmetric reading would
 * exclude most of a ministry's real pairings.
 */
export const gapLabel = (bands: number): string =>
  bands === 0
    ? 'Never older than their leader'
    : bands === 1
      ? // The worked example is read off the ladder rather than written out, for the
        // reason the refusal sentence above is: a band added or reworded would
        // otherwise leave this illustrating a ladder the product no longer has.
        `Up to 1 band older (a ${AGE_BANDS[1]} leader may be suggested a ${AGE_BANDS[2]} participant)`
      : `Up to ${bands} bands older`

/**
 * A real message, with the two places a Ministry's own words go marked out: the
 * name the message reads as, and the word it calls the reader's role by.
 *
 * Composed by the same functions that compose the messages Discipler actually
 * sends -- prefix, disclosure and all -- because a preview an Admin trusts and a
 * message their congregation receives that were built by two functions would
 * eventually differ, and the difference would surface as somebody's church saying
 * a word they had asked it not to.
 */
// Two characters no message body can contain and no Ministry can type, so the
// splits below can never land in the middle of a sentence that happened to repeat
// a word -- which is what a Ministry calling itself "Mentor Church" would
// otherwise do to this.
const NAME = '\u0001'
const NOUN = '\u0000'

export interface MessagePreview {
  /** Who receives it, said above the message rather than inferred from it. */
  readonly to: string
  /** Everything before the name the message reads as. */
  readonly opening: string
  /** Everything between that name and the Ministry's word for the role. */
  readonly middle: string
  /** Everything after the word. */
  readonly closing: string
}

const around = (composed: string, to: string): MessagePreview => {
  // The name first and the word second, always: `composeMessage` puts the name in
  // front of every body it composes, so a message where these came back the other
  // way round would be one this preview has misunderstood rather than one it
  // should render approximately.
  const [opening, rest] = composed.split(NAME)
  const [middle, closing] = (rest ?? '').split(NOUN)

  if (opening === undefined || middle === undefined || closing === undefined) {
    throw new Error('The preview could not find where the ministry’s own words go')
  }

  return { to, opening, middle, closing }
}

/**
 * The two Starter Messages, which are the messages that call somebody by their
 * role -- one for each word, so a Ministry sees both of its own words in the
 * message the person who reads that word actually gets.
 *
 * Composed with sentinels rather than with the Ministry's real values, so the page
 * knows *where* each editable word goes without knowing anything about the
 * sentence around it. That is what lets it wrap both in elements and keep them in
 * step as an Admin types, with no second copy of the message out here.
 */
export const messagePreviews = (): readonly MessagePreview[] => [
  around(
    starterMessageToLeader({
      ministryName: NAME,
      participantNames: ['Emily Johnson'],
      leaderNoun: NOUN,
    }),
    'What a leader receives when a match is agreed',
  ),
  around(
    starterMessageToParticipant({
      ministryName: NAME,
      leaderNames: ['David Ellis'],
      participantNoun: NOUN,
    }),
    'What a participant receives at the same moment',
  ),
]
