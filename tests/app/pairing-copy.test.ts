import { describe, expect, it } from 'vitest'
import type { PairingRefusal } from '~/domain/errors'
import { relationshipId } from '~/domain/ids'
import {
  AWAITING_ACCEPTANCE,
  PAIR,
  PAIR_POPUP,
  REFUSALS,
  pairedSeparatelyReceipt,
  pairingRefusalMessage,
  partlyPairedReceipt,
  refusalAboutOneOfASet,
} from '../../app/roster/copy'

/**
 * A refusal that reaches the Admin as a constraint name, or as nothing at all, is
 * the silent no-op ticket 05 exists to rule out. The domain and the database decide
 * in codes; deciding how to *say* them is the screen's, the same rule the sign-in
 * page follows.
 */

const EVERY_REFUSAL: readonly PairingRefusal[] = [
  'relationship.needs_a_leader',
  'relationship.needs_a_participant',
  'relationship.leader_cannot_be_a_participant',
  'relationship.person_listed_twice',
  'relationship.person_already_in_this_relationship',
  'relationship.leader_already_leads_a_group',
  'relationship.participant_already_in_a_one_to_one',
  'relationship.person_belongs_to_another_ministry',
  'relationship.participant_has_not_completed_intake',
  'relationship.participant_has_opted_out',
  'relationship.leader_has_not_completed_intake',
  'relationship.leader_has_opted_out',
  'relationship.participant_was_removed',
  'relationship.leader_was_removed',
  'relationship.gender_must_match',
  'relationship.gender_does_not_match_the_declaration',
  'relationship.needs_a_gender_declaration',
  'relationship.already_has_a_leader',
  'relationship.needs_a_name',
  'relationship.material_is_not_on_the_list',
  'relationship.separate_needs_one_leader_and_several_participants',
]

describe('what a refused pairing says to an Admin', () => {
  it('lists every refusal the domain declares, and no more', () => {
    // The list above is written by hand, so it can drift from the union it mirrors:
    // dropping an entry would leave the tests below passing while covering less. The
    // `Record<PairingRefusal, string>` is the one thing that cannot drift -- omitting a
    // refusal there fails the build -- so it is what the list is measured against.
    expect([...EVERY_REFUSAL].sort()).toEqual(Object.keys(REFUSALS).sort())
  })

  it('says something for every refusal the domain and the database can raise', () => {
    for (const refusal of EVERY_REFUSAL) {
      expect(pairingRefusalMessage(refusal), refusal).toBeTruthy()
    }
  })

  it('says something different for each of them', () => {
    // Two refusals sharing one sentence is the silent no-op wearing a message: the
    // Admin is told something happened but not which thing to change.
    const said = EVERY_REFUSAL.map((refusal) => pairingRefusalMessage(refusal))
    expect(new Set(said).size).toBe(EVERY_REFUSAL.length)
  })

  it('never reflects the code itself back into the page', () => {
    // The sentences may of course use the word "relationship". What must never
    // appear is the code: a screen that renders what it was handed is a screen that
    // renders whatever somebody put in the query string.
    for (const refusal of EVERY_REFUSAL) {
      expect(pairingRefusalMessage(refusal), refusal).not.toContain(refusal)
      expect(pairingRefusalMessage(refusal), refusal).not.toMatch(/[a-z]_[a-z]/)
    }
  })

  it('names gender plainly, because that refusal is the one an Admin cannot work around', () => {
    expect(pairingRefusalMessage('relationship.gender_must_match')).toMatch(/gender/i)
  })

  it('says gender binds the one-to-one, because the Admin it stops has an alternative', () => {
    // The same people in a group are not refused. A sentence that said "a
    // relationship" would be true of the case in front of them and would hide the
    // way out of it.
    const said = pairingRefusalMessage('relationship.gender_must_match') ?? ''
    expect(said).toMatch(/one-to-one/i)
    expect(said).toMatch(/group/i)
  })

  it('tells the Admin what to do about a group that declared a gender', () => {
    // The Admin declared this themselves, so the refusal is not news about a rule --
    // it is a choice between two fixes, and only they know which one they meant.
    const said = pairingRefusalMessage(
      'relationship.gender_does_not_match_the_declaration',
    ) ?? ''
    expect(said).toMatch(/declared/i)
    expect(said).toMatch(/mixed/i)
  })

  it('offers a fix that works on a one-to-one, because the form asks every shape', () => {
    // The declaration fieldset is shown whatever is ticked, and the boundary keeps
    // what a one-to-one answered, so two women declared a men's relationship land
    // here. Telling that Admin to create a group, or to take somebody out of a pair,
    // is advice about a relationship they are not forming.
    const said = pairingRefusalMessage(
      'relationship.gender_does_not_match_the_declaration',
    ) ?? ''
    expect(said).not.toMatch(/group/i)
    expect(said).not.toMatch(/take them out/i)
  })

  it('asks the group question in the words the form asks it in', () => {
    const said = pairingRefusalMessage('relationship.needs_a_gender_declaration') ?? ''
    expect(said).toMatch(/group/i)
    expect(said).toMatch(/mixed/i)
  })

  it('distinguishes the two roles, because they send the Admin to different people', () => {
    expect(pairingRefusalMessage('relationship.leader_has_not_completed_intake')).not.toBe(
      pairingRefusalMessage('relationship.participant_has_not_completed_intake'),
    )
  })

  it('falls back rather than rendering a blank alert for a code it does not know', () => {
    expect(pairingRefusalMessage('something_else_entirely')).toBeTruthy()
    expect(pairingRefusalMessage(undefined)).toBeUndefined()
  })
})

describe('what the Pair popup says, from a Disciple (Manual pairing, ticket 12)', () => {
  it('is titled with the person whose row was pressed, and says who the list is for', () => {
    expect(PAIR_POPUP.title('Sam Lee')).toBe('Pair Sam Lee')
    expect(PAIR_POPUP.chooseADiscipler('Sam Lee')).toBe('Choose who will disciple Sam Lee.')
  })

  it('says how many somebody already leads, and nobody yet for none', () => {
    expect(PAIR_POPUP.leads(0)).toBe('leads nobody yet')
    expect(PAIR_POPUP.leads(1)).toBe('leads 1')
    expect(PAIR_POPUP.leads(3)).toBe('leads 3')
  })

  it('says what is about to be made, and the button is the same act', () => {
    // Roles per pairing, ticket 01: both sides named, then what the one picked to
    // disciple is sent, which the side adds (tests/app/the-pair-popup-picks-a-side.test.ts).
    expect(PAIR_POPUP.oneToOne('Claire Martinez', 'Sam Lee')).toBe('Claire Martinez will disciple Sam Lee, one to one.')
    expect(PAIR_POPUP.createOneToOne).toBe('Create 1:1 pair')
    // Nothing chosen: the button reads what the row's button read.
    expect(PAIR_POPUP.nothingChosen).toBe(PAIR)
  })

  // Roles per pairing, ticket 01: anybody can be picked on either side, and whoever
  // cannot be chosen is still listed greyed, so an empty list has no how-to-become
  // to say. Only gender leaves anybody off it.
  it('has one thing to say where there is nobody to choose, from either side', () => {
    expect(PAIR_POPUP.nobodyToChoose).toBe('There is nobody to choose yet.')
  })

  it('says Discipler and Disciple, never the model’s Leader, Participant or mentor', () => {
    const said = [
      PAIR_POPUP.title('A'),
      PAIR_POPUP.chooseADiscipler('A'),
      PAIR_POPUP.leads(2),
      PAIR_POPUP.oneToOne('A', 'B'),
      PAIR_POPUP.createOneToOne,
      PAIR_POPUP.nobodyToChoose,
      PAIR_POPUP.close,
    ]
    for (const sentence of said) expect(sentence).not.toMatch(/leader|participant|mentor/i)
  })
})

describe('why a row in the Pair popup is greyed (Manual pairing, ticket 23)', () => {
  it('names who they are already in a one-to-one with', () => {
    expect(PAIR_POPUP.greyed({ why: 'already_in_a_one_to_one', withName: 'David Chen' })).toBe(
      'Already in a 1:1 with David Chen',
    )
    // And says so without a name where the one-to-one names nobody leading it.
    expect(PAIR_POPUP.greyed({ why: 'already_in_a_one_to_one', withName: null })).toBe('Already in a 1:1')
  })

  it('says the words their Roster row already says where they cannot be paired', () => {
    expect(PAIR_POPUP.greyed({ why: 'not_pairable', reason: 'awaiting_intake' })).toBe('Awaiting Intake')
    expect(PAIR_POPUP.greyed({ why: 'not_pairable', reason: 'opted_out' })).toBe('Opted out')
  })

  it('says what the one-to-one declares where the gender is another, short enough for one line on a phone', () => {
    expect(PAIR_POPUP.greyed({ why: 'gender', declared: 'male' })).toBe('Men’s only: a 1:1 is same-gender')
    expect(PAIR_POPUP.greyed({ why: 'gender', declared: 'female' })).toBe('Women’s only: a 1:1 is same-gender')
  })
})

describe('what the Pair popup says, from a Discipler (Manual pairing, ticket 23)', () => {
  it('says who the list is for, and counts it in the Roster’s own word', () => {
    expect(PAIR_POPUP.chooseDisciples('Claire Martinez')).toBe('Choose who Claire Martinez will disciple.')
    expect(PAIR_POPUP.disciples(7)).toBe('7 disciples')
    expect(PAIR_POPUP.disciples(1)).toBe('1 disciple')
  })

  it('says Discipler and Disciple, never the model’s Leader, Participant or mentor', () => {
    const said = [
      PAIR_POPUP.chooseDisciples('A'),
      PAIR_POPUP.disciples(2),
    ]
    for (const sentence of said) expect(sentence).not.toMatch(/leader|participant|mentor/i)
  })
})

describe('what the Pair popup says of two or more ticked (Manual pairing, recut ticket 02)', () => {
  it('labels the toggle and its segments, and the N counts', () => {
    expect(PAIR_POPUP.pairThemAs).toBe('Pair them as')
    expect(PAIR_POPUP.segment('one_to_two', 2)).toBe('1:2 pair')
    expect(PAIR_POPUP.segment('one_to_two', 3)).toBe('1:2 pair')
    expect(PAIR_POPUP.segment('separate', 2)).toBe('2 × 1:1 pairs')
    expect(PAIR_POPUP.segment('separate', 5)).toBe('5 × 1:1 pairs')
  })

  it('says why 1:2 pair cannot be picked, by first name where it is about the Discipler', () => {
    expect(PAIR_POPUP.ruledOut('needs_exactly_two', 'Claire Martinez')).toBe('1:2 pair needs exactly two checked')
    expect(PAIR_POPUP.ruledOut('already_leads_a_group', 'Claire Martinez')).toBe('Claire already leads a group')
  })

  it('names a 1:2 pair by first names, the Discipler’s and then the two Disciples’', () => {
    expect(PAIR_POPUP.nameOfAOneToTwo('Claire Martinez', ['Sam Lee', 'Ana Ruiz'])).toBe('Claire with Sam & Ana')
    expect(PAIR_POPUP.nameOfAOneToTwo('  Mary Jo   Smith ', ['Cher', 'Ana  Ruiz'])).toBe('Mary with Cher & Ana')
  })

  it('says exactly what a 1:2 pair makes, and its button is the same act', () => {
    expect(PAIR_POPUP.oneToTwo('Claire Martinez', ['Sam Lee', 'Ana Ruiz'])).toBe(
      'Claire Martinez will disciple Sam Lee and Ana Ruiz together as a 1:2 pair.',
    )
    expect(PAIR_POPUP.createOneToTwo).toBe('Create 1:2 pair')
  })

  it('says exactly what N × 1:1 pairs makes, and its button is the same act', () => {
    expect(PAIR_POPUP.separately('Claire Martinez', ['Sam Lee', 'Ana Ruiz'])).toBe(
      'Claire Martinez will disciple Sam Lee and Ana Ruiz separately, in 2 one-on-ones.',
    )
    expect(PAIR_POPUP.separately('Claire Martinez', ['Sam Lee', 'Ana Ruiz', 'Rosa Delgado'])).toBe(
      'Claire Martinez will disciple Sam Lee, Ana Ruiz and Rosa Delgado separately, in 3 one-on-ones.',
    )
    expect(PAIR_POPUP.createSeparately(2)).toBe('Create 2 1:1 pairs')
    expect(PAIR_POPUP.createSeparately(3)).toBe('Create 3 1:1 pairs')
  })

  it('asks what they are running, and No material is what it is called', () => {
    expect(PAIR_POPUP.whatTheyAreRunning).toBe('What are they running?')
    expect(PAIR_POPUP.whatEachIsRunning).toBe('What is each of them running?')
    expect(PAIR_POPUP.noMaterial).toBe('No material')
  })

  it('says who a change of shape unticked, and why, in the words their row was greyed with', () => {
    expect(PAIR_POPUP.unticked('Brianna Frazier', 'Already in a 1:1 with David Chen')).toBe(
      'Brianna Frazier was unticked: Already in a 1:1 with David Chen.',
    )
  })

  it('says what a 1:2 pair declares where the gender is another, as short as the one-to-one’s', () => {
    expect(PAIR_POPUP.greyed({ why: 'gender', declared: 'female' }, 'a_one_to_two')).toBe('Women’s only: a 1:2 is same-gender')
    expect(PAIR_POPUP.greyed({ why: 'gender', declared: 'male' }, 'a_one_to_two')).toBe('Men’s only: a 1:2 is same-gender')
    // Every other reason is about the person and reads the same whatever is being made.
    expect(PAIR_POPUP.greyed({ why: 'not_pairable', reason: 'opted_out' }, 'a_one_to_two')).toBe('Opted out')
  })
})

describe('what the Pair popup says of a Group (Manual pairing, recut ticket 04)', () => {
  it('is the toggle’s last segment, whatever the count, beside a 1:1 pair below two ticks', () => {
    expect(PAIR_POPUP.segment('group', 0)).toBe('Group')
    expect(PAIR_POPUP.segment('group', 2)).toBe('Group')
    expect(PAIR_POPUP.segment('group', 7)).toBe('Group')
    expect(PAIR_POPUP.segment('pair', 0)).toBe('1:1 pair')
    expect(PAIR_POPUP.segment('pair', 1)).toBe('1:1 pair')
  })

  it('says what a Group picked first is waiting for, and its button has no count to say yet', () => {
    expect(PAIR_POPUP.groupNeedsTwo).toBe('A group needs two or more checked')
    expect(PAIR_POPUP.createGroup(0)).toBe('Create group')
    expect(PAIR_POPUP.createGroup(1)).toBe('Create group')
  })

  it('offers Women’s, Men’s and Coed, which is the screen’s word for mixed', () => {
    expect((['female', 'male', 'mixed'] as const).map(PAIR_POPUP.declares)).toEqual(['Women’s', 'Men’s', 'Coed'])
    expect(PAIR_POPUP.whatKindOfGroup).not.toMatch(/mixed/i)
  })

  it('asks for a name, with the Discipler’s first name as a hint', () => {
    expect(PAIR_POPUP.groupName).toBe('Group name')
    expect(PAIR_POPUP.groupNamePlaceholder('Claire Martinez')).toBe('Claire’s Group')
  })

  it('says exactly what a Group makes, with the count and the gender word live, and its button is the same act', () => {
    const three = ['Sam Lee', 'Ana Ruiz', 'Rosa Delgado']
    expect(PAIR_POPUP.group('Claire Martinez', 'female', three)).toBe(
      'Claire Martinez will lead a women’s group of 3: Sam Lee, Ana Ruiz and Rosa Delgado.',
    )
    expect(PAIR_POPUP.group('David Chen', 'male', ['Tom Wilson', 'Hal Moss'])).toBe(
      'David Chen will lead a men’s group of 2: Tom Wilson and Hal Moss.',
    )
    expect(PAIR_POPUP.group('Claire Martinez', 'mixed', three)).toBe(
      'Claire Martinez will lead a coed group of 3: Sam Lee, Ana Ruiz and Rosa Delgado.',
    )
    expect(PAIR_POPUP.createGroup(3)).toBe('Create group of 3')
  })

  it('never says a gender the toggle does not show: undeclared, the sentence says none', () => {
    const said = PAIR_POPUP.group('Claire Martinez', null, ['Sam Lee', 'Ana Ruiz'])
    expect(said).toBe('Claire Martinez will lead a group of 2: Sam Lee and Ana Ruiz.')
    expect(said).not.toMatch(/women|men|coed|mixed/i)
  })

  it('says what a Group declares where the gender is another, and what would open the row again', () => {
    expect(PAIR_POPUP.greyed({ why: 'gender', declared: 'female' }, 'a_womens_group')).toBe(
      'Women’s group: choose Coed to include',
    )
    expect(PAIR_POPUP.greyed({ why: 'gender', declared: 'male' }, 'a_mens_group')).toBe(
      'Men’s group: choose Coed to include',
    )
  })
})

describe('what the Pair popup says of a group a Discipler is added to (Manual pairing, recut ticket 04)', () => {
  const grace = { fullName: 'Grace Lee' }
  const david = { fullName: 'David Chen' }

  it('says who they will co-lead it with, and the button is the same act', () => {
    expect(PAIR_POPUP.coLead('Claire Martinez', { name: 'Grace’s Group', leaders: [grace] })).toBe(
      'Claire Martinez will co-lead Grace’s Group with Grace Lee.',
    )
    // The one place the Roster's copy says it (James, 2026-09-21, having seen both).
    expect(PAIR_POPUP.addAsCoLeader).toBe('Add as co-leader')
  })

  it('names every leader the group already has', () => {
    expect(PAIR_POPUP.coLead('Claire Martinez', { name: 'Thursday Table', leaders: [grace, david] })).toBe(
      'Claire Martinez will co-lead Thursday Table with Grace Lee and David Chen.',
    )
  })

  it('names a group nobody has named as its leaders’ group, and does not say them twice', () => {
    expect(PAIR_POPUP.coLead('Claire Martinez', { name: null, leaders: [{ fullName: 'Ruth Bader' }] })).toBe(
      'Claire Martinez will co-lead Ruth Bader’s group.',
    )
    // Named by nobody and led by nobody, it is still a sentence.
    expect(PAIR_POPUP.coLead('Claire Martinez', { name: null, leaders: [] })).toBe('Claire Martinez will co-lead the group.')
    expect(PAIR_POPUP.coLead('Claire Martinez', { name: 'Thursday Table', leaders: [] })).toBe(
      'Claire Martinez will co-lead Thursday Table.',
    )
  })

  it('counts both in the toolbar, and only the Disciples where there are no groups to offer', () => {
    expect(PAIR_POPUP.counts(PAIR_POPUP.listed('discipler', 2, 5), 3)).toBe('2 asked · 5 more · 3 groups')
    expect(PAIR_POPUP.counts(PAIR_POPUP.listed('discipler', 2, 5), 0)).toBe('2 asked · 5 more')
  })
})

/**
 * Manual pairing, ticket 21. A set of one-to-ones is all or none, so what it says
 * has two jobs a single pairing's does not: which of several people a refusal is
 * about, and how much of the set landed.
 */
describe('what a set of separate one-to-ones says to an Admin', () => {
  it('says what separate pairing needs, and what to do with several Disciplers', () => {
    const said =
      pairingRefusalMessage('relationship.separate_needs_one_leader_and_several_participants') ?? ''
    expect(said).toMatch(/one Discipler/)
    expect(said).toMatch(/two or more/)
  })

  it('names the Disciple a refusal is about, and says that none of the set was made', () => {
    const said = refusalAboutOneOfASet('Sam Lee', 'Somebody selected has opted out, and cannot be paired.')
    expect(said).toBe(
      'Sam Lee: Somebody selected has opted out, and cannot be paired. '
      + 'None of these one-to-ones was made.',
    )
  })

  it('counts the one-to-ones made, not the people in them', () => {
    expect(pairedSeparatelyReceipt(3)).toBe(
      '3 one-to-ones are paired. Their Discipler has been invited to each, and nobody else has '
      + 'been contacted yet.',
    )
    expect(pairedSeparatelyReceipt(1)).toMatch(/^1 one-to-one is paired\./)
  })

  it('never reports the set where part of it landed: how many were made, and who was not', () => {
    expect(
      partlyPairedReceipt({
        formed: 2,
        notPaired: ['Ana Ruiz', 'Ruth Okafor'],
        reason: 'Somebody selected has opted out, and cannot be paired.',
      }),
    ).toBe(
      'Only 2 of 4 one-to-ones were made. Ana Ruiz and Ruth Okafor were not paired. '
      + 'Ana Ruiz: Somebody selected has opted out, and cannot be paired.',
    )
    expect(partlyPairedReceipt({ formed: 1, notPaired: ['Ruth Okafor'], reason: undefined })).toBe(
      'Only 1 of 2 one-to-ones was made. Ruth Okafor was not paired. '
      + 'Something went wrong partway. Pair them again from here.',
    )
  })
})

/**
 * Manual pairing, recut ticket 03: the Ministry's groups under the Disciplers, in
 * the popup opened from a Disciple. A group row says its name, who leads it, how
 * many Disciples it has, what it declared, and its state when it is not running.
 */
describe('the groups in the Pair popup', () => {
  const thursdayTable = { name: 'Thursday Table', leaders: [{ fullName: 'David Chen' }] }

  it('heads them Groups, and counts them beside the people in the line under the title', () => {
    expect(PAIR_POPUP.groupsHeading).toBe('Groups')
    expect(PAIR_POPUP.counts(PAIR_POPUP.listed('disciple', 4, 2), 3)).toBe('4 lead or offered · 2 more · 3 groups')
    expect(PAIR_POPUP.counts(PAIR_POPUP.listed('discipler', 4, 2), 1)).toBe('4 asked · 2 more · 1 group')
  })

  it('counts no groups where the Ministry has none to offer', () => {
    expect(PAIR_POPUP.counts(PAIR_POPUP.listed('disciple', 4, 2), 0)).toBe('4 lead or offered · 2 more')
  })

  it('labels a group by its name, and one nobody has named as its leaders’ group, never as a person', () => {
    expect(PAIR_POPUP.groupLabel(thursdayTable)).toBe('Thursday Table')
    expect(PAIR_POPUP.groupLabel({ name: null, leaders: [{ fullName: 'Grace Lee' }] })).toBe('Grace Lee’s group')
    expect(
      PAIR_POPUP.groupLabel({ name: null, leaders: [{ fullName: 'Grace Lee' }, { fullName: 'David Chen' }] }),
    ).toBe('Grace Lee and David Chen’s group')
    expect(PAIR_POPUP.groupLabel({ name: null, leaders: [] })).toBe('Unnamed group')
  })

  it('calls an unnamed group the same thing on a Disciple’s row, on its own row and in the sentence', () => {
    const unnamed = { name: null, leaders: [{ fullName: 'Grace Lee' }] }
    const inIt = {
      relationshipId: relationshipId('an-unnamed-group'),
      role: 'participant' as const,
      withNames: [],
      leaderNames: ['Grace Lee'],
      participantNames: [],
      participantCount: 3,
      countsAsAGroup: true,
      name: null,
      awaitingAcceptance: false,
    }
    expect(PAIR_POPUP.doingNow([inIt], { leading: true })).toBe(`In ${PAIR_POPUP.groupLabel(unnamed)}`)
    expect(PAIR_POPUP.joinGroup('Sam Lee', unnamed)).toBe(`Sam Lee will join ${PAIR_POPUP.groupLabel(unnamed)}.`)
  })

  it('says who leads it, how many Disciples it has and what it declared', () => {
    expect(
      PAIR_POPUP.groupDetails({ ...thursdayTable, discipleCount: 3, declaredGender: null, state: null }),
    ).toEqual(['led by David Chen', '3 disciples', 'Coed'])
    expect(
      PAIR_POPUP.groupDetails({
        name: 'Grace’s Group',
        leaders: [{ fullName: 'Grace Lee' }, { fullName: 'Ana Ruiz' }],
        discipleCount: 4,
        declaredGender: 'female',
        state: null,
      }),
    ).toEqual(['led by Grace Lee and Ana Ruiz', '4 disciples', 'Women’s'])
    expect(
      PAIR_POPUP.groupDetails({ ...thursdayTable, discipleCount: 2, declaredGender: 'male', state: null }),
    ).toEqual(['led by David Chen', '2 disciples', 'Men’s'])
  })

  it('says its state only when it is not running', () => {
    const details = (state: 'paused' | 'awaiting_leader_acceptance') =>
      PAIR_POPUP.groupDetails({ ...thursdayTable, discipleCount: 3, declaredGender: null, state })
    expect(details('paused').at(-1)).toBe('paused')
    // As the Roster row behind the popup already says it.
    expect(details('awaiting_leader_acceptance').at(-1)).toBe(AWAITING_ACCEPTANCE)
    expect(AWAITING_ACCEPTANCE).toBe('awaiting acceptance')
  })

  it('does not say the leaders twice on a group named for them', () => {
    expect(
      PAIR_POPUP.groupDetails({
        name: null,
        leaders: [{ fullName: 'Grace Lee' }],
        discipleCount: 3,
        declaredGender: null,
        state: null,
      }),
    ).toEqual(['3 disciples', 'Coed'])
  })

  it('says what is about to happen, naming every leader, and the button is the same act', () => {
    expect(PAIR_POPUP.joinGroup('Sam Lee', thursdayTable)).toBe(
      'Sam Lee will join Thursday Table, led by David Chen.',
    )
    expect(
      PAIR_POPUP.joinGroup('Sam Lee', {
        name: 'Thursday Table',
        leaders: [{ fullName: 'David Chen' }, { fullName: 'Grace Lee' }, { fullName: 'Ana Ruiz' }],
      }),
    ).toBe('Sam Lee will join Thursday Table, led by David Chen, Grace Lee and Ana Ruiz.')
    expect(PAIR_POPUP.addToGroup).toBe('Add to group')
  })

  it('says a group nobody has named by who leads it, in the sentence too', () => {
    expect(PAIR_POPUP.joinGroup('Sam Lee', { name: null, leaders: [{ fullName: 'Grace Lee' }] })).toBe(
      'Sam Lee will join Grace Lee’s group.',
    )
  })

  it('still makes a sentence of a group that names nobody leading it', () => {
    expect(PAIR_POPUP.joinGroup('Sam Lee', { name: 'Thursday Table', leaders: [] })).toBe(
      'Sam Lee will join Thursday Table.',
    )
    expect(PAIR_POPUP.joinGroup('Sam Lee', { name: null, leaders: [] })).toBe('Sam Lee will join the group.')
  })

  it('says Discipler and Disciple, never the model’s Leader, Participant or mentor', () => {
    const said = [
      PAIR_POPUP.groupsHeading,
      PAIR_POPUP.counts(PAIR_POPUP.listed('disciple', 2, 1), 2),
      ...PAIR_POPUP.groupDetails({ ...thursdayTable, discipleCount: 3, declaredGender: null, state: 'awaiting_leader_acceptance' }),
      PAIR_POPUP.joinGroup('A', thursdayTable),
      PAIR_POPUP.addToGroup,
    ]
    for (const sentence of said) expect(sentence).not.toMatch(/\bleader\b|participant|mentor/i)
  })
})
