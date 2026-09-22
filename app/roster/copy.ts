import type { GroupJoinRefusal, ImportRowRefusal, PairingRefusal } from '~/domain/errors'
import type { Gender } from '~/domain/intake'
import { asList } from '~/domain/outbound-copy'
import type { ParticipationStatus } from '~/domain/participation'
import type { MemberRole } from '~/domain/relationships'
import type { RowProblem } from '~/domain/roster'
import type { GroupToJoin } from '~/service/ports'
import {
  isDiscipledBySomebody,
  leadsSomebody,
  offeredToMentor,
  askedToBeDiscipled,
  plannedAs,
  type RosterFacts,
} from './lists'
import type { Greyed } from './greying'
import { MIXED, type GroupDeclaration } from './declared-gender'
import { PAIR_SHAPE, type PairShape, type ReadAs, type ShapeRuledOut } from './pair-shape'
import type { ImportFailure } from './report'

/**
 * Everything the Roster says in words, in one place. The derivation deals in facts
 * and the import deals in codes; deciding how to say them is the screen's, for the
 * same reason sign-in failures are.
 *
 * One module because it changes for one reason -- somebody rewording what an Admin
 * reads -- and that is a different reason from the one the wire format in
 * `report.ts` changes for.
 */

export const participationStatusLabel: Record<ParticipationStatus, string> = {
  no_intake_submitted: 'No Intake Submitted',
  ready_to_pair: 'Ready to Pair',
  paired: 'Paired',
  opted_out: 'Opted Out',
}

/**
 * The three lists the Roster is, and how each is named above its table. The words
 * are the product's own (ticket 36): a pastor thinks in who disciples whom, and
 * the model's Leader and Participant are for the code.
 *
 * All is everybody once, and is where the Roster opens (Manual pairing, ticket
 * 06): a pastor looking for one person should not have to know which side they
 * are on first. The two sides are the lists a person is on in one role.
 */
export type RosterSide = 'disciplers' | 'disciples'
export type RosterList = 'all' | RosterSide
export const ROSTER_LISTS: readonly RosterList[] = ['all', 'disciplers', 'disciples']
export const isRosterList = (value: unknown): value is RosterList =>
  value === 'all' || value === 'disciplers' || value === 'disciples'

/** Where the Roster opens, and what an address that names no list of ours shows. */
export const DEFAULT_LIST: RosterList = 'all'

export const LIST_LABEL: Record<RosterList, string> = {
  all: 'All',
  disciplers: 'Disciplers',
  disciples: 'Disciples',
}

/** The column heading over the names: the side's own word, and on All a word for people. */
export const LIST_HEADING: Record<RosterList, string> = {
  all: 'Name',
  disciplers: 'Discipler',
  disciples: 'Disciple',
}

const LIST_NOUN: Record<RosterList, readonly [one: string, many: string]> = {
  all: ['person', 'people'],
  disciplers: ['discipler', 'disciplers'],
  disciples: ['disciple', 'disciples'],
}

/** *49 disciplers total*, at the top right, in the prototype's own words; *49 people total* on All. */
export const listCount = (list: RosterList, count: number): string =>
  `${count} ${LIST_NOUN[list][count === 1 ? 0 : 1]} total`

/**
 * The three numbers under the toggle, each a bold count and a word. *In groups*
 * left with Manual pairing, ticket 06: it means something only within one side.
 */
export const STATS_LABEL = {
  total: 'total',
  paired: 'paired',
  unpaired: 'unpaired',
} as const

/** All has no sentence of its own: with nobody on it the Roster itself is empty, and says so. */
export const EMPTY_LIST: Record<RosterSide, string> = {
  disciplers:
    'No disciplers yet. Somebody becomes one when they disciple somebody, or when they offer to on the Intake form.',
  disciples: 'No disciples yet. Everyone on the Roster who is not a discipler is here.',
}

/**
 * A pairing an import planned, on the row of either person in it (ADR-0022).
 * *planned* while it waits on Intake; *not made* once the pairing rules refused
 * it, until the Follow-Up Item that raised is resolved.
 */
export const PLANNED = 'planned'
export const AWAITING_INTAKE = 'awaiting Intake'
export const NOT_MADE = 'not made'
export const SEE_FOLLOW_UP = 'see Follow-Up'

export const PAIR = 'Pair'
export const UNPAIRED = 'Unpaired'

/**
 * Why a row offers no Pair, said in its Paired with cell where the button would
 * have been (Manual pairing, ticket 07). Not a status column: the reason there is
 * nothing to press, now that no chip under the name explains it.
 */
export type NotPairable = 'awaiting_intake' | 'opted_out'
export const CANNOT_BE_PAIRED: Record<NotPairable, string> = {
  awaiting_intake: 'Awaiting Intake',
  opted_out: 'Opted out',
}

/**
 * The Pair popup over the Roster, opened from a Disciple's row (Manual pairing,
 * ticket 12). A sentence says exactly what is about to be made and the button is
 * the same act; with nothing chosen there is no sentence and the button reads what
 * the row's did. Cancel and Clear are the import dialog's own words.
 */
/** A group as a Disciple's row names it: what the Ministry calls it, and who leads it where nobody has named it. */
export interface GroupOnARow {
  readonly name: string | null
  readonly leaders: readonly { readonly fullName: string }[]
}

/** A group as the popup lists it among the groups to join (Manual pairing, recut ticket 03): what it is called, and what it is. */
export interface GroupListed extends GroupOnARow {
  readonly discipleCount: number
  /** What it declared. Null is the model's mixed, which the screen calls Coed. */
  readonly declaredGender: GroupToJoin['declaredGender']
  /** Null while it is running. */
  readonly state: GroupToJoin['state']
}

/** What a declaration is called on the screen: whose it is, never what anybody is. */
const declaredAs = (declared: Gender): string => (declared === 'male' ? 'Men’s' : 'Women’s')

/** The screen's word for the model's mixed, on a group's row and on the gender toggle. */
const COED = 'Coed'

/** Who leads a group, by name, in the order the document gave. */
const leadersOf = (group: GroupOnARow): readonly string[] => group.leaders.map(({ fullName }) => fullName)

/**
 * What a group is called wherever the popup names one. One nobody has named is its
 * leaders' group, *Grace Lee's group*, and never their bare names, which in a list
 * of people read as a second Grace Lee (decided by James on 2026-09-21).
 */
const nameOfAGroup = (group: GroupOnARow): string =>
  group.name ?? (group.leaders.length === 0 ? 'Unnamed group' : `${asList(leadersOf(group))}’s group`)

/**
 * How a group is said in the popup's sentence, for either side: what it is called,
 * and its leaders where they are still to be said. Named for its leaders, it has
 * said them already; named by nobody and led by nobody, it is *the group*, which
 * reads as a sentence where its label would not.
 */
const inASentence = (group: GroupOnARow): { readonly called: string; readonly leaders: string | null } => ({
  called: group.name === null && group.leaders.length === 0 ? 'the group' : nameOfAGroup(group),
  leaders: group.name !== null && group.leaders.length > 0 ? asList(leadersOf(group)) : null,
})

/** A first name out of the one `full_name` Discipler holds. Splitting it is a copy decision, so it is made here. */
const firstNameOf = (fullName: string): string => fullName.trim().split(/\s+/)[0] ?? ''

export const PAIR_POPUP = {
  title: (fullName: string): string => `Pair ${fullName}`,
  chooseADiscipler: (disciple: string): string => `Choose who will disciple ${disciple}.`,
  disciplers: (count: number): string => (count === 1 ? '1 discipler' : `${count} disciplers`),
  /** People, across everything they lead: a group of three is three. */
  leads: (people: number): string => (people === 0 ? 'leads nobody yet' : `leads ${people}`),
  oneToOne: (discipler: string, disciple: string): string =>
    `${discipler} will disciple ${disciple} in a one-on-one.`,
  createOneToOne: 'Create 1:1 pair',
  nothingChosen: PAIR,
  noDisciplers: 'There is nobody to choose yet. Somebody becomes a discipler when they offer to on the Intake form.',
  /**
   * An empty list where gender left somebody or some group off it (James,
   * 2026-09-21). The sentence above would say how a discipler comes to be, which is
   * not why there is nobody here, so only its first half is said.
   */
  nobodyToChoose: 'There is nobody to choose yet.',
  close: 'Close',
  /**
   * From a Discipler (Manual pairing, ticket 23): the list is of Disciples, ticked
   * with boxes. One tick is the one-to-one the other side makes, in the same
   * sentence and on the same button.
   */
  chooseDisciples: (discipler: string): string => `Choose who ${discipler} will disciple.`,
  disciples: (count: number): string => (count === 1 ? '1 disciple' : `${count} disciples`),
  /** The group a Disciple is already in, on their row. One nobody has named is said by who leads it. */
  inGroup: (group: GroupOnARow): string =>
    `in ${nameOfAGroup(group)}`,
  /**
   * Two or more ticked (Manual pairing, recut ticket 02): the toggle that asks what
   * to make of them, the sentence and the button for each shape, and the Material
   * dropdowns. The sentence says exactly what is about to be made and the button is
   * the same act.
   */
  pairThemAs: 'Pair them as',
  segment: (shape: PairShape, ticked: number): string =>
    // The Group shape is what is left: named once, in `./pair-shape`, which this
    // file reads types from and nothing else.
    shape === 'one_to_two'
      ? '1:2 pair'
      : shape === 'separate'
        ? `${ticked} × 1:1 pairs`
        : shape === PAIR_SHAPE
          ? '1:1 pair'
          : 'Group',
  /** Beneath the toggle, in grey. The cap is about the Discipler, by first name as the spec has it. */
  ruledOut: (why: ShapeRuledOut, discipler: string): string =>
    why === 'needs_exactly_two'
      ? '1:2 pair needs exactly two checked'
      : `${firstNameOf(discipler)} already leads a group`,
  /**
   * What a 1:2 pair is called: `{First} with {First} & {First}`. A 1:2 is a group for
   * every rule and a group is named, so the popup names it and asks nothing; the
   * name is never shown there. It is what the weekly question calls the three.
   */
  nameOfAOneToTwo: (discipler: string, disciples: readonly [string, string]): string =>
    `${firstNameOf(discipler)} with ${firstNameOf(disciples[0])} & ${firstNameOf(disciples[1])}`,
  oneToTwo: (discipler: string, disciples: readonly string[]): string =>
    `${discipler} will disciple ${asList(disciples)} together as a 1:2 pair.`,
  createOneToTwo: 'Create 1:2 pair',
  separately: (discipler: string, disciples: readonly string[]): string =>
    `${discipler} will disciple ${asList(disciples)} separately, in ${disciples.length} one-on-ones.`,
  createSeparately: (pairs: number): string => `Create ${pairs} 1:1 pairs`,
  /**
   * A Group (Manual pairing, recut ticket 04): what it declares, what it is called,
   * and the sentence and button that say it. The gender toggle sits directly under
   * the shape toggle with no label over it, as the mock has it, so it is named for a
   * screen reader. Coed is the screen's word for the model's mixed.
   */
  whatKindOfGroup: 'What kind of group',
  declares: (declared: GroupDeclaration): string => (declared === MIXED ? COED : declaredAs(declared)),
  groupName: 'Group name',
  /** A hint in the empty field, and never submitted as the name. */
  groupNamePlaceholder: (discipler: string): string => `${firstNameOf(discipler)}’s Group`,
  /** The count and the gender word are live. It never says a gender the toggle does not show: undeclared, it says none. */
  group: (discipler: string, declared: GroupDeclaration | null, disciples: readonly string[]): string => {
    const kind = declared === null ? 'a group' : `a ${PAIR_POPUP.declares(declared).toLowerCase()} group`
    return `${discipler} will lead ${kind} of ${disciples.length}: ${asList(disciples)}.`
  },
  /** Picked before two are ticked, which it can be so that Coed can be chosen first, it has no count to say yet. */
  createGroup: (disciples: number): string => (disciples < 2 ? 'Create group' : `Create group of ${disciples}`),
  /** Beneath the toggle, in grey, while a Group has fewer than two ticked. */
  groupNeedsTwo: 'A group needs two or more checked',
  whatTheyAreRunning: 'What are they running?',
  whatEachIsRunning: 'What is each of them running?',
  noMaterial: 'No material',
  /**
   * Who a change of shape unticked, so nobody is dropped silently, and why, in the
   * words their row was greyed with. The reason is said here and not left to the
   * row, which may have opened again by the time this is read.
   */
  unticked: (fullName: string, why: string): string => `${fullName} was unticked: ${why}.`,
  noDisciples: 'There is nobody to choose yet. Somebody can be chosen once they have completed Intake.',
  /**
   * The Ministry's groups, under the people (Manual pairing, recut ticket 03),
   * listed like people. The line under the title counts both, and counts no groups
   * where there are none to offer, as no heading stands over none.
   */
  groupsHeading: 'Groups',
  counts: (people: string, groups: number): string =>
    groups === 0 ? people : `${people} · ${groups === 1 ? '1 group' : `${groups} groups`}`,
  /** What a group's row is called, as a Disciple's row already says it. */
  groupLabel: nameOfAGroup,
  /**
   * Beneath it: who leads it, how many Disciples it has, what it declared, and its
   * state when it is not running. Coed is the screen's word for the model's mixed.
   * A group named for its leaders does not say them a second time.
   */
  groupDetails: (group: GroupListed): readonly string[] => [
    ...(group.name !== null && group.leaders.length > 0 ? [`led by ${asList(leadersOf(group))}`] : []),
    PAIR_POPUP.disciples(group.discipleCount),
    group.declaredGender === null ? COED : declaredAs(group.declaredGender),
    // Still awaiting its leader is said as the Roster row behind the popup says it.
    ...(group.state === null ? [] : [group.state === 'paused' ? 'paused' : AWAITING_ACCEPTANCE]),
  ],
  /** Every leader is named. A group nobody has named is said by who leads it. */
  joinGroup: (disciple: string, group: GroupOnARow): string => {
    const { called, leaders } = inASentence(group)
    return `${disciple} will join ${called}${leaders === null ? '' : `, led by ${leaders}`}.`
  },
  addToGroup: 'Add to group',
  /**
   * From a Discipler (Manual pairing, recut ticket 04): choosing a group adds them
   * to it as another of its Disciplers, by invitation. Everybody who leads it is
   * named, and one named for them has said them already, as `joinGroup` has it.
   * The button says *co-leader*, the one place the Roster's copy does (James,
   * 2026-09-21, having seen it as *co-discipler* too): it names a person beside
   * another, not the model's role, and `tests/app/roster-vocabulary.test.ts` lets
   * that word through and no other.
   */
  coLead: (discipler: string, group: GroupOnARow): string => {
    const { called, leaders } = inASentence(group)
    return `${discipler} will co-lead ${called}${leaders === null ? '' : ` with ${leaders}`}.`
  },
  addAsCoLeader: 'Add as co-leader',
  /**
   * Why a row cannot be chosen, on the row and in one line (Manual pairing, ticket
   * 23). Somebody who cannot be paired reads what their Roster row already reads.
   * The gender reason says what the one-to-one declares and never what anybody's
   * own gender is. It opens as the mock does and is cut to fit one line at phone
   * width, which the mock's own sentence does not. A 1:2 pair declares the
   * Discipler's gender, and says so in the same words and the same length.
   */
  greyed: (greyed: Greyed, readAs: ReadAs = 'a_one_to_one'): string =>
    greyed.why === 'already_in_a_one_to_one'
      ? greyed.withName === null
        ? 'Already in a 1:1'
        : `Already in a 1:1 with ${greyed.withName}`
      : greyed.why === 'not_pairable'
        ? CANNOT_BE_PAIRED[greyed.reason]
        : readAs === 'a_one_to_one' || readAs === 'a_one_to_two'
          ? `${declaredAs(greyed.declared)} only: a ${readAs === 'a_one_to_two' ? '1:2' : '1:1'} is same-gender`
          : // A Group says what opens the row again, because on this screen something does.
            `${declaredAs(greyed.declared)} group: choose Coed to include`,
} as const

/** The receipt the pairing route redirects to, said about what just happened. */
export const pairedReceipt = (disciples: number): string =>
  disciples === 1
    ? 'They are paired. The Discipler has been invited, and nobody else has been contacted yet.'
    : `A group of ${disciples} is paired. Its Discipler has been invited, and nobody else has been contacted yet.`

/**
 * The receipt for a set of separate one-to-ones (Manual pairing, ticket 21). It
 * counts the one-to-ones made and not the people in them, because the number above
 * reads as the size of one group and three one-to-ones are not a group of three.
 */
export const pairedSeparatelyReceipt = (pairs: number): string =>
  `${pairs} ${pairs === 1 ? 'one-to-one is' : 'one-to-ones are'} paired. Their Discipler has `
  + 'been invited to each, and nobody else has been contacted yet.'

/**
 * A set that passed its check and was still stopped partway. The one outcome the
 * set exists to avoid, so it is said as what it is: how many were made out of how
 * many, who was not, and why where there is a why. Never the number asked for.
 *
 * The reason is about the first of those not paired, which is where it stopped.
 * The names come from the Roster and never from the address.
 */
export const partlyPairedReceipt = ({
  formed,
  notPaired,
  reason,
}: {
  readonly formed: number
  readonly notPaired: readonly string[]
  readonly reason: string | undefined
}): string =>
  `Only ${formed} of ${formed + notPaired.length} one-to-ones ${formed === 1 ? 'was' : 'were'} made. `
  + `${asList(notPaired)} ${notPaired.length === 1 ? 'was' : 'were'} not paired. `
  + (reason === undefined
    ? 'Something went wrong partway. Pair them again from here.'
    : `${notPaired[0] ?? 'Somebody'}: ${reason}`)

/**
 * Unpair, on a person's Pairings card (James, 2026-09-21). One word for three acts
 * (`./unpair`). The question names who it is about, because a person can hold
 * several pairings and a group ends for more people than the one on the page.
 * The outcome is asked as the two things an Admin would say, and they are the
 * model's `completed` and `discontinued`.
 */
export const UNPAIR = {
  button: 'Unpair',
  /**
   * `group` is null for a one-to-one, and carries what the Ministry calls the
   * group, where it calls it anything. `ledOnBy` is who goes on leading a group a
   * Discipler is taken out of, and is empty wherever the pairing ends.
   */
  question: ({
    person,
    group,
    endsItFor,
    ledOnBy,
  }: {
    readonly person: string
    readonly group: { readonly name: string | null } | null
    readonly endsItFor: readonly string[]
    readonly ledOnBy: readonly string[]
  }): string =>
    !group
      ? `Unpair ${person} and ${asList(endsItFor)}?`
      : ledOnBy.length > 0
        ? `Unpair ${person} from ${group.name ?? 'this group'}? ${asList(ledOnBy)} ${ledOnBy.length === 1 ? 'goes' : 'go'} on leading it.`
        : `Unpair ${person} from ${group.name ?? 'this group'}? It ends for ${asList(endsItFor)} too.`,
  consequence: 'Their history is kept, and nobody is sent anything.',
  finishedWell: 'It finished well',
  didNotRunItsCourse: 'It did not run its course',
  reasonPlaceholder: 'Optional. Anything you want remembered about how it ended.',
  confirm: 'Yes, unpair',
  goBack: 'Go back',
}

/**
 * What an ending records where the Admin wrote no reason. The database requires
 * one, and *who* is already recorded beside it as `ended_by`.
 */
export const UNPAIRED_BLANK_REASON = 'Unpaired from the Roster.'

/** What the person page says after an Unpair, by what happened. Codes in the address, never prose. */
export type Unpaired = 'ended' | 'cancelled' | 'left' | 'withdrawn'
export const UNPAIRED_RECEIPT: Record<Unpaired, string> = {
  ended: 'Unpaired. The history is kept, and nobody was sent anything.',
  cancelled: 'Unpaired. It had not started, and nobody was sent anything.',
  left: 'Unpaired from the group, which goes on without them. Nobody was sent anything.',
  withdrawn: 'Unpaired. Their invitation no longer works, the group goes on as it was, and nobody was sent anything.',
}
export const isUnpaired = (value: string | undefined): value is Unpaired =>
  value !== undefined && Object.hasOwn(UNPAIRED_RECEIPT, value)

/** Why an Unpair did not happen. The page was true when it was drawn, and something changed under it. */
export const UNPAIR_REFUSED = 'That pairing changed while you were looking at it, so nothing was done. Have another look and press Unpair again.'

/**
 * The receipt for somebody an Admin has just put into a group (Manual pairing,
 * ticket 22). Their name as the Roster holds it: the address carries an id, and
 * a name is looked up, never read off the address.
 *
 * What happened and not what is true of the group. `told` is whether the command
 * texted anybody: a Discipler who has not accepted the group yet is sent nothing
 * but their invitation, so a group still awaiting them is joined in silence, and
 * the receipt must not say somebody was told when nobody was. The Disciple is
 * never sent anything, either way.
 */
export const joinedGroupReceipt = (fullName: string, told: boolean): string =>
  `${fullName} is in the group now. `
  + (told
    ? 'Its Discipler has been told, and nobody else has been contacted.'
    : 'Nobody has been contacted about it.')

/**
 * The receipt for a Discipler an Admin has just added to a group (Manual pairing,
 * ticket 22). An invitation and not a fact about who leads: they lead nothing
 * until they accept, and the group does not wait for them.
 */
export const invitedToGroupReceipt = (fullName: string): string =>
  `${fullName} has been invited to help lead the group, and nobody else has been contacted. `
  + 'The group carries on meanwhile.'

/**
 * A number as a person reads it: a North American number as `(706) 555-0142`,
 * which is how the church's own spreadsheet had it, and anything else as it is
 * stored. Display only; the stored value stays E.164 (ADR-0005).
 */
export const displayPhone = (phone: string): string => {
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(phone)
  return us ? `(${us[1]}) ${us[2]}-${us[3]}` : phone
}

/**
 * Said above the import, in the design's own words, because it is exactly the
 * product rule: a paste adds names and numbers, and where it says who disciples
 * whom it records a plan and pairs nobody (ADR-0022); nobody receives anything
 * until they complete Intake themselves.
 */
export const IMPORT_IS_NEVER_CONSENT =
  'An import adds names, phone numbers and emails. Where a row says who disciples '
  + 'whom, the pair is planned, not made: it forms itself once both have completed '
  + 'Intake. People land as No Intake Submitted, cannot be paired, and receive nothing '
  + 'until they complete Intake themselves. Importing a person is never consent.'

/**
 * What the person page says of somebody who offered to mentor on the Intake form.
 * It was a tag on the Roster row until Manual pairing, ticket 07: the answer still
 * makes them a Discipler, and the Disciplers list says so without a tag.
 *
 * Worded as something they did rather than as something they are. *Offered to
 * mentor* is an answer on a form; *Mentor* would read as a role somebody holds.
 *
 * The mentee answer is not said, and the unanswered case is not said either: a
 * *Not asked* on every other Person would make state out of a signal, and *asked
 * to be mentored* is what every Person on this Roster is already presumed to want.
 */
export const OFFERED_TO_MENTOR = 'Offered to mentor'

/**
 * Whether this is their first time, per Disciple, in the Pair popup. Both
 * answers are said outright, including *has done this before* -- said only for the
 * first-timers, a blank would read as *no* rather than as *nobody asked them*.
 *
 * Takes the answer the Roster actually holds. The form carries this as two words
 * because the screen words them as statements and a `yes` meaning *first time*
 * reads backwards; by the time it reaches a Roster row it is the boolean
 * `intake_submission.first_time`, and turning that back into `first_time` to look
 * a label up would be the round trip the wording was avoiding, run in reverse.
 */
export const firstTimeLabel = (firstTime: boolean): string =>
  firstTime ? 'New to this' : 'Has done this before'

/**
 * The same fact in the words the person page says it in, since ticket 36: lower
 * case and after the names, as a note on the pairing rather than a title. The
 * Roster row follows in the rebuild; the constant above goes with it.
 */
export const AWAITING_ACCEPTANCE = 'awaiting acceptance'

/**
 * The two sides of a pairing, as an Admin screen names them. Discipler and
 * Disciple are the product's own words and are said in place of Leader and
 * Participant on every Admin surface (ticket 36); the nouns a Ministry types are
 * for its messages and never reach a screen (ADR-0015).
 */
export const DISCIPLING = 'Discipling'
export const DISCIPLED_BY = 'Discipled by'

/**
 * One pairing on a person's page, as a sentence: who it is with, and which group
 * where the Ministry has named it (Unpair, 2026-09-21), because a Discipler's page
 * can hold several and Unpair asks about one of them by that name.
 */
export const pairingLine = ({
  role,
  names,
  groupName,
}: {
  readonly role: MemberRole
  readonly names: readonly string[]
  readonly groupName: string | null
}): string =>
  role === 'leader'
    ? `${DISCIPLING} ${groupName === null ? '' : `${groupName}: `}${names.join(', ')}`
    : `${DISCIPLED_BY} ${names.join(', ')}${groupName === null ? '' : ` in ${groupName}`}`

/**
 * How big a pairing is, from the live count of Disciples in it and never from
 * the relationship's kind (ADR-0004). `1:1` is the prototype's own pill; a group
 * says how many members it has.
 */
export const pairingSizeLabel = (disciples: number): string =>
  disciples <= 1 ? '1:1' : `${disciples} members`

/**
 * What a Person is on the Roster, and on the strength of what. A Discipler is a
 * fact -- they lead somebody, they signed up as one on the form, or an import
 * paired them as one -- and this is the one sentence that says which, so a
 * Discipler reading Ready to Pair can be understood rather than reported as a bug.
 *
 * Read off the same rule the three lists are drawn from (`lists.ts`), never
 * re-derived here: the page behind a name on the Disciplers list must say
 * Discipler, whichever of the three facts put them there.
 */
export const whoTheyAre = (person: RosterFacts): string => {
  const leads = leadsSomebody(person)
  const asDiscipler = [
    leads ? 'disciples somebody' : null,
    offeredToMentor(person) ? 'offered to on their Intake form' : null,
    plannedAs(person, 'leader') ? 'an import paired them as one' : null,
  ].filter(isSaid)
  const asDisciple = [
    isDiscipledBySomebody(person) ? 'being discipled' : null,
    askedToBeDiscipled(person) ? 'asked to be on their Intake form' : null,
    plannedAs(person, 'participant') ? 'an import paired them to be discipled' : null,
  ].filter(isSaid)

  const discipler =
    asDiscipler.length > 0
      ? `A Discipler - ${listed([...asDiscipler, ...(leads ? [] : ['disciples nobody yet'])])}`
      : null

  if (discipler && asDisciple.length > 0) return `${discipler}. Also a Disciple - ${listed(asDisciple)}.`
  if (discipler) return discipler
  return asDisciple.length > 0 ? `A Disciple - ${listed(asDisciple)}` : 'A Disciple - not yet paired'
}

const isSaid = (reason: string | null): reason is string => reason !== null

/** Reasons as a sentence lists them: `a`, `a, and b`, `a, b, and c`. */
const listed = (reasons: readonly string[]): string =>
  reasons.length <= 2
    ? reasons.join(', and ')
    : `${reasons.slice(0, -1).join(', ')}, and ${reasons[reasons.length - 1]}`

/** The sentence beside a freshly issued Intake link. */
export const intakeLinkInstruction = (fullName: string, expiresAt: Date): string =>
  `Send this to ${fullName}. It opens their own Intake form with their answers already in it, and works until ${expiresAt.toISOString().slice(0, 10)}.`

/**
 * The page was asked for a link and the one on file has run out. Reachable because
 * the query string carries the fact that one was asked for and not the token: an
 * Admin who bookmarks the result, or comes back a fortnight later, asks again
 * without going through the act that mints one.
 */
export const NO_INTAKE_LINK_STANDING =
  'The link that was issued has run out. Press Intake link for a new one.'

export const NO_ACCOUNT =
  'No account. One arrives when they accept an invitation to disciple somebody.'

/** The receipt for a new invitation, said only when a text actually went out. */
export const REINVITED = (fullName: string): string =>
  `A new invitation has been sent to ${fullName}.`

/**
 * The action offered on the row of anybody who holds an account, and only there.
 * A button that is always present and refuses most of the time teaches an Admin
 * that the product does not know its own state.
 */
export const RESET_PASSWORD = 'Reset password'

const PROBLEMS: Record<RowProblem, string> = {
  no_name: 'no name',
  no_phone: 'no phone number',
  phone_unreadable: 'the phone number could not be read',
  email_unreadable: 'the email address could not be read',
  too_many_fields: 'more columns than the header row',
  // Name and number together, per ADR-0005: two people on one phone are two people.
  repeated_in_this_file: 'the same person appears earlier in the file',
  already_on_the_roster: 'already on the Roster',
  same_number_different_name:
    'this number is on the Roster under a different name — check whether it is the same person or someone sharing the number',
  // The rest are about the pair a row described. The person on the row is still
  // imported; only the pairing is not planned, and each says what to change.
  role_unreadable: 'Role must say Discipler or Disciple, so the pair was not planned',
  paired_with_no_role:
    'names who they are paired with but no Role says whether they are the Discipler or the Disciple, so the pair was not planned',
  paired_with_unknown: 'names somebody in Paired with who is neither in these rows nor on the Roster, so the pair was not planned',
  paired_with_ambiguous:
    'names somebody in Paired with that two people go by - add their row to the paste, with their number, so the pair can be planned',
  paired_with_held:
    'is paired with a row that is waiting on you - answer that row, then paste this line again',
  paired_with_self: 'pairs a person with themselves',
  paired_with_conflict: 'pairs two people the other way round from an earlier row',
  pairing_already_planned:
    'the Disciple on this row is already planned to be discipled by somebody - a person is in one one-to-one at a time',
}

export const rowProblemMessage = (problem: RowProblem): string => PROBLEMS[problem]

/**
 * The heading over the rows an Admin can still answer. Named as *waiting on you*
 * rather than as errors: nothing went wrong with these rows, and the file is not
 * where the answer is. The one thing missing is a fact only somebody who knows the
 * congregation has.
 */
export const HELD_ROWS_HEADING = 'Rows waiting on you'

/**
 * Said once, above the rows, rather than repeated on each of them. It says what
 * Discipler does not know and why, because an Admin who does not understand the
 * question is the one most likely to click whichever button is on the left.
 */
export const HELD_ROWS_EXPLANATION =
  'Each of these came in on a phone number the Roster already holds, under a name '
  + 'it has never seen. That is either the same person with their name written '
  + 'differently, or somebody else who shares the phone — a spouse, a parent and a '
  + 'teenager. Discipler cannot tell, and will not guess.'

/**
 * How the question reads when the Roster no longer holds anybody on that number.
 * It should not happen: the row exists because the number was held. It is said
 * rather than the row being dropped, because a question that disappeared would be
 * the silent expiry this whole surface exists to prevent.
 */
export const NOBODY_ON_THIS_NUMBER =
  'Nobody is on the Roster against this number any more, so there is nobody left to '
  + 'rename. Adding them is the only answer left.'

/**
 * One answer per Person the number already reaches, each naming that Person. A
 * number may reach two of them, and *the same person* is a different question about
 * each -- so the button says whose name is about to change rather than leaving an
 * Admin to work out which of two the product had in mind.
 */
export const samePersonAnswer = (fullName: string): string => `Same person as ${fullName}`

/** Said under the button, so the consequence is visible before it is clicked. */
export const samePersonConsequence = (was: string, becomes: string): string =>
  `${was} keeps their history and everything they are part of, and is called ${becomes} from now on.`

export const SOMEONE_ELSE_ANSWER = 'Someone else on this number'

export const SOMEONE_ELSE_CONSEQUENCE =
  'A second person is added on the same phone. Nobody already on the Roster changes.'

/**
 * Why an answer could not be applied. None of them is a disagreement about which
 * answer was right -- that is the Admin's -- so each says what moved underneath
 * them and what to do about it.
 *
 * A `Record` rather than a lookup with a default, like the import failures above:
 * a refusal added to `ImportRowRefusal` and left unworded fails the build rather
 * than falling through to a sentence that names nothing.
 *
 * The lookup below still has a fallback, and that is a different job. The `Record`
 * answers *is every refusal this product can raise worded*, at build time; the
 * fallback answers *what does the page say about a string somebody typed into the
 * query bar*, which is the same promise the sign-in page makes about an invented
 * `?error=` -- the screen says its own words, and nothing a stranger supplied is
 * reflected back into it.
 */
const IMPORT_ROW_REFUSALS: Record<ImportRowRefusal, string> = {
  'import_row.already_answered':
    'Somebody answered that row before you did. The Roster below shows where it landed.',
  'import_row.person_is_not_on_this_number':
    'That person is not on the phone number this row came in on. Reload the Roster and answer it again.',
  // The row stays. Nothing here can close it -- neither answer is a default and
  // neither is Discipler's to choose -- so it says plainly that both have been
  // overtaken rather than quietly hiding a question nobody answered.
  'import_row.name_is_already_on_this_number':
    'That name is already on the Roster against this number, so neither answer would '
    + 'add anything. The row was left as it was.',
}

export const importRowRefusalMessage = (code: string | undefined): string | undefined => {
  if (!code) return undefined
  return (
    IMPORT_ROW_REFUSALS[code as ImportRowRefusal] ?? 'That row could not be answered.'
  )
}

const FAILURES: Record<ImportFailure, string> = {
  nothing_pasted: 'Paste your rows first, with their header row.',
  too_large: 'That is more than this import accepts at once. Paste it in parts and try again.',
  nothing_to_read: 'Nothing was pasted but blank lines.',
  no_name_column:
    'These rows have no column of names. Name the column Name or Full Name and try again.',
  no_phone_column:
    'These rows have no column of phone numbers. Name the column Phone or Mobile and try again.',
  no_discipler_columns:
    'These rows have no Discipler and Discipler Phone columns. Add them, or choose People only.',
  no_disciple_columns:
    'These rows have no Disciple and Disciple Phone columns. Add them, or choose People only.',
  roster_changed:
    'The Roster changed while this import was running, so none of it was applied. Try it again.',
}

export const importFailureMessage = (code: string | undefined): string | undefined => {
  if (!code) return undefined
  return FAILURES[code as ImportFailure] ?? 'Those rows could not be imported.'
}

/** What an import did, in the sentences the Roster says after the redirect. */
export const peopleAdded = (added: number): string =>
  added === 1 ? '1 person was added.' : `${added} people were added.`

/**
 * Said only when a pair was planned. A plan is not a pairing (ADR-0022), and the
 * sentence says what it is waiting on rather than leaving *planned* to be read as
 * *done*.
 */
export const pairsPlanned = (planned: number): string =>
  planned === 1
    ? '1 pair was planned. It forms itself once both people have completed Intake.'
    : `${planned} pairs were planned. Each forms itself once both people have completed Intake.`

export const rowsNotImported = (refused: number): string =>
  refused === 1 ? '1 row was not imported:' : `${refused} rows were not imported:`

/**
 * Said apart from the rows not imported, because the person on each of these rows
 * was: only the pair the row described is not planned, and the count says so.
 */
export const pairsNotPlanned = (refused: number): string =>
  refused === 1 ? '1 pair was not planned:' : `${refused} pairs were not planned:`

/**
 * Why a pairing was refused, in words an Admin can act on. A `Record` rather than a
 * lookup with a default, so that adding a refusal to `PairingRefusal` and forgetting
 * to word it fails the build rather than falling through to "that pairing could not
 * be created" -- which is the silent no-op again, wearing a message.
 *
 * Each sentence names the thing to change. "Emily is already in a one-to-one" sends
 * the Admin somewhere; "constraint violated" does not.
 */
export const REFUSALS: Record<PairingRefusal, string> = {
  'relationship.needs_a_leader': 'Choose the Discipler.',
  'relationship.needs_a_participant':
    'Choose at least one person to be discipled.',
  'relationship.leader_cannot_be_a_participant':
    'The Discipler cannot also be one of the people they disciple.',
  'relationship.person_listed_twice':
    'Somebody was selected twice. Each person can be in this pairing once.',
  'relationship.person_already_in_this_relationship':
    'Somebody is already in this pairing.',
  // Named as a cap rather than as an error: the Admin has not done anything wrong,
  // they have run into how much this leader is already carrying.
  'relationship.leader_already_leads_a_group':
    'This Discipler already leads a group. A Discipler leads one group at a time, and '
    + 'any number of one-to-ones.',
  'relationship.participant_already_in_a_one_to_one':
    'Somebody selected is already being discipled one-to-one. A person is in one '
    + 'one-to-one at a time, and any number of groups.',
  'relationship.person_belongs_to_another_ministry':
    'Somebody selected is not on this Ministry\u2019s Roster.',
  'relationship.participant_has_not_completed_intake':
    'Somebody selected has not completed Intake yet. Being on the Roster is not the '
    + 'same as asking to take part.',
  'relationship.participant_has_opted_out':
    'Somebody selected has opted out, and cannot be paired.',
  'relationship.leader_has_not_completed_intake':
    'This Discipler has not completed Intake yet. Send them the Intake link first.',
  'relationship.leader_has_opted_out': 'This Discipler has opted out, and cannot disciple anybody.',
  // The one refusal with no way around it. Said as a policy rather than as a
  // mistake, because an Admin who reads it as a mistake will go looking for the
  // setting that turns it off, and there is not one on this screen. It names the
  // one-to-one, because the Admin it stops has a real alternative -- the same people
  // in a group are not refused -- and a sentence that said "a relationship" would
  // hide that from them.
  'relationship.gender_must_match':
    'A one-to-one must be between two people of the same gender. This is a '
    + 'safeguarding rule and pairing by hand does not override it. A group can be '
    + 'mixed, if you say that is what it is.',
  // Names what the Admin themselves declared, because the fix is one of two things
  // and they are the only person who knows which: change who is in it, or say it is
  // mixed. A sentence that only said "genders do not match" would describe a rule
  // rather than the choice in front of them.
  //
  // Names no shape and does not say to remove somebody: the form asks the question of
  // every shape, so an Admin who declared a men's relationship and then selected two
  // women reaches this on a pair, where there is nothing to create and taking one of
  // the two out leaves nobody. Saying it is mixed is the fix that works either way.
  'relationship.gender_does_not_match_the_declaration':
    'Somebody selected is not of the gender this pairing was declared to be. '
    + 'Either change who is in it, or say it is mixed.',
  // Only a group is asked, so the wording says group. An Admin pairing two people
  // never sees this: their relationship’s gender is the gender of the two of them.
  'relationship.needs_a_gender_declaration':
    'Say whether this is a men’s group, a women’s group, or a mixed one. Everybody '
    + 'in a men’s or women’s group must be of that gender.',
  // Only a group is asked, like the declaration above. The name is what the group
  // Intake link offers and what the weekly check-in asks about.
  'relationship.needs_a_name':
    'Give this group a name. It is what people will see on the group link, and what '
    + 'its Discipler is asked about each week.',
  'relationship.already_has_a_leader':
    'A one-to-one has one Discipler. Add another person to be discipled to make it '
    + 'a group, and it can then have several.',
  // Reached when the list moved under an open form. Nothing was formed, so the
  // sentence says what to do next rather than what went missing.
  'relationship.material_is_not_on_the_list':
    'That Material is no longer on this Ministry’s list. Choose another, or pair '
    + 'without one.',
  // Manual pairing, ticket 21. About the submission and nobody in it. It says what
  // the other shape needs as well, because the Admin it stops chose several
  // Disciplers on purpose and the way on is a submission each.
  'relationship.separate_needs_one_leader_and_several_participants':
    'Pairing separately needs one Discipler and two or more people to be discipled. '
    + 'With several Disciplers, pair each of them in turn.',
}

/**
 * The age band is deliberately not in the list. It governs suggestion only, so
 * pairing across it by hand is a supported thing to do and produces no refusal at
 * all -- there is nothing here to say about it.
 */
export const pairingRefusalMessage = (code: string | undefined): string | undefined => {
  if (!code) return undefined
  // A code arriving from the query string is whatever somebody typed there. It is
  // looked up, never rendered.
  return REFUSALS[code as PairingRefusal] ?? 'That pairing could not be made.'
}

/**
 * A refusal of one one-to-one in a set of several (Manual pairing, ticket 21). The
 * sentences above say *somebody selected*, which is enough beside one Disciple and
 * not beside four, so the Disciple is named in front of it. And it says none of the
 * set was made, because an Admin refused about one of four will otherwise wonder
 * about the other three.
 */
export const refusalAboutOneOfASet = (fullName: string, message: string): string =>
  `${fullName}: ${message} None of these one-to-ones was made.`

/**
 * The cap a Discipler added to a group can run into, about the Discipler by name
 * where the Roster still holds them: the Admin chose one person, and the sentence
 * is about that person. A function and not a constant for the name's sake, and
 * declared as one so the `Record` below can use it. Named as a cap and not as an
 * error, as the pairing's own sentence for it is.
 */
export function alreadyLeadsAGroup(fullName: string | undefined): string {
  return `${fullName ?? 'This Discipler'} already leads a group. A Discipler leads one group at `
    + 'a time, and any number of one-to-ones.'
}

/**
 * Why somebody could not be put into a group that already exists (Manual pairing,
 * ticket 22), for the refusals that act has of its own. A `Record`, so a code added
 * to `GroupJoinRefusal` and left unworded fails the build.
 */
export const GROUP_JOIN_REFUSALS: Record<GroupJoinRefusal, string> = {
  'joining.group_not_found': 'That group is not one of this Ministry’s. Choose one from the list.',
  'joining.group_has_ended':
    'That group has ended, so nobody can be added to it. Choose another group.',
  'joining.not_a_group':
    'That pairing is a one-to-one, not a group, so nobody can be added to it. Choose a group.',
  'joining.person_not_found': 'That person is not on this Ministry’s Roster.',
  'joining.already_in_the_group': 'They are already in this group.',
  'joining.already_leads_a_group': alreadyLeadsAGroup(undefined),
  'joining.role_not_recognised':
    'That did not say whether to add them as a Disciple or as a Discipler. Open Pair again and choose.',
}

/**
 * The rules forming a group is held to, refusing the same insert here, and said
 * about this act. The pairing's own sentences are about a selection on a form that
 * declares what the group is: *say it is mixed* is a fix there, and here the group
 * said what it is when it was formed and the Admin is choosing which group.
 *
 * Only the ones this act can meet. Any other falls through to the pairing's
 * wording, which is the same rule in the words of the screen that first met it.
 */
export const PAIRING_REFUSALS_ON_JOINING: Partial<Record<PairingRefusal, string>> = {
  'relationship.participant_has_not_completed_intake':
    'They have not completed Intake yet. Send them the Intake link first, then add them.',
  'relationship.participant_has_opted_out': 'They have opted out, and cannot be added to a group.',
  'relationship.gender_does_not_match_the_declaration':
    'This is a men’s or a women’s group, and they are not of that gender. Choose a '
    + 'group of their own gender, or a mixed one.',
  'relationship.person_already_in_this_relationship': 'They are already in this group.',
  'relationship.person_belongs_to_another_ministry': 'That person is not on this Ministry’s Roster.',
  // The same two readiness rules, met by a Discipler being added to lead.
  'relationship.leader_has_not_completed_intake':
    'They have not completed Intake yet. Send them the Intake link first, then add them.',
  'relationship.leader_has_opted_out': 'They have opted out, and cannot be added to a group.',
  // The index's own code, should it ever arrive in place of this act's.
  'relationship.leader_already_leads_a_group': alreadyLeadsAGroup(undefined),
}

/**
 * `fullName` is who the Admin was adding, as the Roster holds them and never as an
 * address said it. Only the cap names them; every other sentence says *they*.
 */
export const groupJoinRefusalMessage = (
  code: string | undefined,
  fullName?: string,
): string | undefined => {
  if (!code) return undefined
  if (code === 'joining.already_leads_a_group' || code === 'relationship.leader_already_leads_a_group') {
    return alreadyLeadsAGroup(fullName)
  }
  // Looked up, never rendered, like every other code that arrives in an address.
  return (
    GROUP_JOIN_REFUSALS[code as GroupJoinRefusal]
    ?? PAIRING_REFUSALS_ON_JOINING[code as PairingRefusal]
    ?? REFUSALS[code as PairingRefusal]
    ?? 'They could not be added to that group.'
  )
}
