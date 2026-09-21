import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addMembership,
  addPerson,
  createMinistryWithAdmin,
  createRelationship,
  localSupabase,
  pairOneToOne,
  type MinistryFixture,
} from '../support/local-supabase'
import { getPage, signIn, skipUnlessAppIsRunning } from '../support/app'

/**
 * The Roster as three lists, driven the way an Admin reads it: the toggle, the
 * three numbers, the five columns, and the words on them. Two lists in ticket 36;
 * All, and All as the default, in Manual pairing, ticket 06.
 */

describe.skipIf(skipUnlessAppIsRunning)('the Roster’s three lists', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await pool.end()
  })

  let numbered = 0
  const number = () =>
    `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  /** The name cell, so an assertion can say which list somebody is on. */
  const names = (html: string): string[] =>
    [...html.matchAll(/data-testid="roster-name"[^>]*>([^<]+)</g)].map((match) => match[1]!)

  /** One Person's row, found by the test id the name carries, tags stripped. */
  const rowOf = (html: string, name: string): string => {
    const row = html
      .split('<tr')
      .find((candidate) => new RegExp(`data-testid="roster-name"[^>]*>${name}<`).test(candidate))
    expect(row, `no row for ${name}`).toBeDefined()
    return row!.split('</tr>')[0]!.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  }

  const statsLine = (html: string): string =>
    (html.match(/<p class="stats-line">([\s\S]*?)<\/p>/)?.[1] ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()

  /** The toggle's links, in order: what each says, where it goes, and whether it is the one being looked at. */
  const toggle = (html: string) => {
    const nav = html.match(/<nav class="seg"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? ''
    return [...nav.matchAll(/<a ([^>]*)>([^<]*)<\/a>/g)].map(([, attributes, label]) => ({
      label,
      href: attributes!.match(/href="([^"]*)"/)?.[1],
      current: /aria-current="true"/.test(attributes!),
    }))
  }

  it('opens on All, with three plain links directly under the title', async () => {
    const { cookie } = await signIn(ministry)
    const { html } = await getPage('/roster', cookie)

    expect(toggle(html)).toEqual([
      { label: 'All', href: '/roster?list=all', current: true },
      { label: 'Disciplers', href: '/roster?list=disciplers', current: false },
      { label: 'Disciples', href: '/roster?list=disciples', current: false },
    ])
    // Directly under the word Roster: the card's head holds the title and its
    // actions and nothing else, and the toggle is the very next thing after it.
    const head = html.match(/<div class="card-head"><h2 class="card-title">Roster<\/h2><div class="actions"[^>]*>(?:(?!<div|<\/div>)[\s\S])*<\/div><\/div>(<[a-z]+[^>]*>)/)
    expect(head, 'the Roster card head, then what follows it').not.toBeNull()
    expect(head![1]).toMatch(/^<nav class="seg"/)
    // The old names for the two sides went with the third list.
    expect(html).not.toContain('All Disciplers')
    expect(html).not.toContain('All Disciples')
  })

  it('shows the list its address names, and All for one it does not know', async () => {
    const { cookie } = await signIn(ministry)
    const current = async (path: string) =>
      toggle((await getPage(path, cookie)).html).filter((link) => link.current).map((link) => link.label)

    expect(await current('/roster?list=all')).toEqual(['All'])
    expect(await current('/roster?list=disciplers')).toEqual(['Disciplers'])
    expect(await current('/roster?list=disciples')).toEqual(['Disciples'])
    expect(await current('/roster?list=everyone')).toEqual(['All'])
    expect(await current('/roster?list=')).toEqual(['All'])
    // A refresh is the same address, and the same list.
    expect(await current('/roster?list=disciples')).toEqual(['Disciples'])
  })

  it('lists a Discipler on one side and a Disciple on the other, with the five columns', async () => {
    const { cookie } = await signIn(ministry)

    const phone = number()
    const david = await addPerson(ministry, 'David Chen', { phone })
    await pool.query(`update person set email = 'david.c@example.org' where id = $1`, [david])
    const tom = await addPerson(ministry, 'Tom Wilson', { phone: number() })
    await pairOneToOne(ministry, david, tom)

    const disciplers = await getPage('/roster?list=disciplers', cookie)
    expect(names(disciplers.html)).toContain('David Chen')
    expect(names(disciplers.html)).not.toContain('Tom Wilson')
    expect(disciplers.html).toContain('<th>Discipler</th>')
    expect(disciplers.html).toContain('<th>Email</th>')
    expect(disciplers.html).toContain('<th>Phone</th>')
    expect(disciplers.html).toContain('<th>Paired with</th>')
    // Contact details on the row, to an Admin (ADR-0021), the number as a person
    // reads it.
    expect(disciplers.html).toContain('david.c@example.org')
    expect(disciplers.html).toContain(`(${phone.slice(2, 5)}) ${phone.slice(5, 8)}-${phone.slice(8)}`)
    expect(disciplers.html).toMatch(/\d+ disciplers? total/)

    const disciples = await getPage('/roster?list=disciples', cookie)
    expect(names(disciples.html)).toContain('Tom Wilson')
    expect(names(disciples.html)).not.toContain('David Chen')
    expect(disciples.html).toContain('<th>Disciple</th>')
    expect(disciples.html).toMatch(/\d+ disciples? total/)

    // All has both, and its heading and its count read for people, not for a side.
    const all = await getPage('/roster', cookie)
    expect(names(all.html)).toContain('David Chen')
    expect(names(all.html)).toContain('Tom Wilson')
    expect(all.html).toContain('<th>Name</th>')
    expect(all.html).not.toContain('<th>Discipler</th>')
    expect(all.html).not.toContain('<th>Disciple</th>')
    expect(all.html).toMatch(/\d+ people total/)
    expect(all.html).not.toMatch(/\d+ disciplers? total/)
    expect(all.html).not.toMatch(/\d+ disciples? total/)
    for (const heading of ['Email', 'Phone', 'Paired with']) expect(all.html).toContain(`<th>${heading}</th>`)
    // Each names the other, and no line says which way it runs: the toggle above
    // answers that, and a word on every line is clutter (James, reviewing this
    // ticket, which first shipped *disciples* / *discipled by* here).
    expect(rowOf(all.html, 'David Chen')).toContain('Tom Wilson 1:1')
    expect(rowOf(all.html, 'Tom Wilson')).toContain('David Chen 1:1')
    expect(rowOf(all.html, 'David Chen')).not.toContain('disciples Tom Wilson')
    expect(rowOf(all.html, 'Tom Wilson')).not.toContain('discipled by')
  })

  it('puts somebody who offered to lead on the Intake form among the Disciplers, unpaired, with Pair', async () => {
    const { cookie } = await signIn(ministry)

    const priya = await addPerson(ministry, 'Priya Raman', { phone: number() })
    await pool.query(
      `insert into consent_record
         (ministry_id, person_id, consent, granted, version, source, decided_at, intake_path, declared_side)
       values ($1, $2, 'sms', true, '2026-09-v1', 'pastor_link', now(), 'discipleship', 'mentor')`,
      [ministry.id, priya],
    )

    const { html } = await getPage('/roster?list=disciplers', cookie)
    expect(names(html)).toContain('Priya Raman')
    const row = rowOf(html, 'Priya Raman')
    // Being on this list is what says she offered; the tag that said it a second
    // time went with Manual pairing, ticket 07.
    expect(row).not.toContain('Offered to mentor')
    expect(row).toContain('Unpaired')
    // Preselected as the Discipler, since that is what she offered to be.
    expect(html).toContain(`href="/roster/pair?leaderId=${priya}"`)

    const disciples = await getPage('/roster?list=disciples', cookie)
    expect(names(disciples.html)).not.toContain('Priya Raman')
  })

  it('shows somebody who disciples one person and is discipled by another on both sides, and once on All', async () => {
    const { cookie } = await signIn(ministry)

    const grace = await addPerson(ministry, 'Grace Lee', { phone: number() })
    const emily = await addPerson(ministry, 'Emily Davis', { phone: number() })
    const ruth = await addPerson(ministry, 'Ruth Adeyemi', { phone: number() })
    await pairOneToOne(ministry, grace, emily)
    await pairOneToOne(ministry, ruth, grace)

    const disciplers = await getPage('/roster?list=disciplers', cookie)
    expect(names(disciplers.html)).toContain('Grace Lee')
    const asDiscipler = rowOf(disciplers.html, 'Grace Lee')
    expect(asDiscipler).toContain('Emily Davis')
    expect(asDiscipler).not.toContain('Ruth Adeyemi')

    const disciples = await getPage('/roster?list=disciples', cookie)
    expect(names(disciples.html)).toContain('Grace Lee')
    const asDisciple = rowOf(disciples.html, 'Grace Lee')
    expect(asDisciple).toContain('Ruth Adeyemi')
    expect(asDisciple).not.toContain('Emily Davis')

    // On All she is one row, and the one cell holds both pairings: who she
    // disciples first, then who disciples her, with no word for either.
    const all = await getPage('/roster', cookie)
    expect(names(all.html).filter((name) => name === 'Grace Lee')).toHaveLength(1)
    const once = rowOf(all.html, 'Grace Lee')
    expect(once).toContain('Emily Davis 1:1')
    expect(once).toContain('Ruth Adeyemi 1:1')
    expect(once.indexOf('Emily Davis')).toBeLessThan(once.indexOf('Ruth Adeyemi'))
    expect(once).not.toMatch(/disciples Emily|discipled by/)
    // Nobody is said twice, whichever side or sides they are on.
    expect(new Set(names(all.html)).size).toBe(names(all.html).length)
  })

  it('counts a group by the people being discipled in it, and says how many members', async () => {
    const { cookie } = await signIn(ministry)

    const daniel = await addPerson(ministry, 'Daniel Okafor', { phone: number() })
    const group = await createRelationship(ministry, 'group')
    await addMembership({ ministry, relationshipId: group, kind: 'group', personId: daniel, role: 'leader' })
    for (const name of ['Caleb Foster', 'Noah Williams', 'Ethan Nguyen']) {
      const member = await addPerson(ministry, name, { phone: number() })
      await addMembership({ ministry, relationshipId: group, kind: 'group', personId: member, role: 'participant' })
    }

    const disciplers = await getPage('/roster?list=disciplers', cookie)
    const row = rowOf(disciplers.html, 'Daniel Okafor')
    expect(row).toContain('Caleb Foster, Ethan Nguyen, Noah Williams')
    expect(row).toContain('3 members')

    // Each member's row names the Discipler and says it is a group.
    const disciples = await getPage('/roster?list=disciples', cookie)
    const member = rowOf(disciples.html, 'Caleb Foster')
    expect(member).toContain('Daniel Okafor')
    expect(member).toContain('3 members')

    const all = await getPage('/roster', cookie)
    expect(rowOf(all.html, 'Daniel Okafor')).toContain('Caleb Foster, Ethan Nguyen, Noah Williams 3 members')
    expect(rowOf(all.html, 'Caleb Foster')).toContain('Daniel Okafor 3 members')
  })

  it('adds up the three numbers for the list being looked at, and never says in groups', async () => {
    // A Ministry of its own, so the numbers are these people and nobody else's.
    const own = await createMinistryWithAdmin('Counting Chapel')
    const { cookie } = await signIn(own)

    const leader = await addPerson(own, 'Amara Boateng', { phone: number() })
    const group = await createRelationship(own, 'group')
    await addMembership({ ministry: own, relationshipId: group, kind: 'group', personId: leader, role: 'leader' })
    for (const name of ['Bea Ojo', 'Cara Ude']) {
      const member = await addPerson(own, name, { phone: number() })
      await addMembership({ ministry: own, relationshipId: group, kind: 'group', personId: member, role: 'participant' })
    }
    const solo = await addPerson(own, 'Dele Bakare', { phone: number() })
    await pairOneToOne(own, solo, await addPerson(own, 'Ezra Kimani', { phone: number() }))
    const offered = await addPerson(own, 'Femi Ade', { phone: number() })
    await pool.query(
      `insert into consent_record
         (ministry_id, person_id, consent, granted, version, source, decided_at, intake_path, declared_side)
       values ($1, $2, 'sms', true, '2026-09-v1', 'pastor_link', now(), 'discipleship', 'mentor')`,
      [own.id, offered],
    )
    await addPerson(own, 'Gia Imported', { phone: number(), intake: false })

    // Disciplers: the group's leader, the one-to-one's leader, and the offer.
    const disciplers = await getPage('/roster?list=disciplers', cookie)
    expect(statsLine(disciplers.html)).toBe('3 total 2 paired 1 unpaired')
    expect(disciplers.html).toContain('3 disciplers total')

    // Disciples: two members, one one-to-one, one imported, and the Admin's own
    // row, who is on the Roster like anybody else and has not been paired.
    const disciples = await getPage('/roster?list=disciples', cookie)
    expect(statsLine(disciples.html)).toBe('5 total 3 paired 2 unpaired')

    // All: the seven of them and the Admin, once each. Paired is anybody in an
    // open pairing in either role: the two leaders and the three they disciple.
    const all = await getPage('/roster', cookie)
    expect(statsLine(all.html)).toBe('8 total 5 paired 3 unpaired')
    expect(all.html).toContain('8 people total')

    for (const { html } of [all, disciplers, disciples]) expect(html).not.toContain('in groups')
  })

  it('shows a pairing an import planned on both rows, and says not made once it is refused', async () => {
    // A Ministry of its own, so the numbers are these two people and nobody else.
    const own = await createMinistryWithAdmin('Planned Chapel')
    const { cookie } = await signIn(own)

    // Two people an import brought in paired, neither past Intake yet. The plan
    // puts Sam among the Disciplers and Taylor among the Disciples, each row naming
    // the other and saying it is planned and waiting.
    const sam = await addPerson(own, 'Sam Rivera', { phone: number(), intake: false })
    const taylor = await addPerson(own, 'Taylor Brooks', { phone: number(), intake: false })
    const plan = crypto.randomUUID()
    await pool.query(
      `insert into intended_pairing (id, ministry_id, leader_id, participant_id, planned_at)
       values ($1, $2, $3, $4, now())`,
      [plan, own.id, sam, taylor],
    )

    const disciplers = await getPage('/roster?list=disciplers', cookie)
    const asDiscipler = rowOf(disciplers.html, 'Sam Rivera')
    expect(asDiscipler).toContain('Taylor Brooks')
    expect(asDiscipler).toContain('planned')
    expect(asDiscipler).toContain('awaiting Intake')
    // A Discipler who has not completed Intake is offered nothing to press, like
    // anybody else who has not (James, 2026-09-19), and the plan line has already
    // said why: the row does not say *Awaiting Intake* a second time after it.
    expect(asDiscipler).not.toContain('Awaiting Intake')
    expect(disciplers.html).not.toContain(`/roster/pair?leaderId=${sam}`)
    // Not paired: a plan is not a pairing. Sam is the one Discipler here.
    expect(statsLine(disciplers.html)).toBe('1 total 0 paired 1 unpaired')

    const disciples = await getPage('/roster?list=disciples', cookie)
    const asDisciple = rowOf(disciples.html, 'Taylor Brooks')
    expect(asDisciple).toContain('Sam Rivera')
    expect(asDisciple).toContain('planned')

    // On All the plan is on the row of each person it is about, reading as it
    // does on the side lists, and still counts nobody as paired.
    const all = await getPage('/roster', cookie)
    const samOnAll = rowOf(all.html, 'Sam Rivera')
    expect(samOnAll).toContain('Taylor Brooks planned')
    expect(samOnAll).not.toContain('disciples Taylor')
    expect(samOnAll).toContain('awaiting Intake')
    const taylorOnAll = rowOf(all.html, 'Taylor Brooks')
    expect(taylorOnAll).toContain('Sam Rivera planned')
    expect(taylorOnAll).not.toContain('discipled by')
    expect(taylorOnAll).toContain('awaiting Intake')
    // The same on All: said once, and no Pair for either of them.
    expect(samOnAll).not.toContain('Awaiting Intake')
    expect(taylorOnAll).not.toContain('Awaiting Intake')
    expect(all.html).not.toContain(`/roster/pair?leaderId=${sam}`)
    expect(all.html).not.toContain(`pair=${taylor}`)
    expect(statsLine(all.html)).toBe('3 total 0 paired 3 unpaired')

    // Refused, with its Follow-Up Item still open: the row says not made and
    // points at the tab where the Admin acts on it.
    await pool.query(
      `update intended_pairing
          set closed_at = now(), outcome = 'refused', refusal = 'relationship.gender_must_match'
        where id = $1`,
      [plan],
    )
    await pool.query(
      `insert into follow_up_item (ministry_id, kind, person_id, relationship_id, raised_at, payload)
       values ($1, 'intended_pairing_refused', $2, null, now(),
               jsonb_build_object('intendedPairingId', $3::text, 'refusal', 'relationship.gender_must_match'))`,
      [own.id, taylor, plan],
    )
    const refused = await getPage('/roster?list=disciples', cookie)
    const row = rowOf(refused.html, 'Taylor Brooks')
    expect(row).toContain('not made')
    // *not made* does not say why there is no Pair, so the row does.
    expect(row).toContain('Awaiting Intake')
    expect(rowOf((await getPage('/roster', cookie)).html, 'Taylor Brooks')).toContain('Sam Rivera not made')
    expect(refused.html).toContain('href="/follow-up"')

    // Resolved, and the plan is gone from the row.
    await pool.query(
      `update follow_up_item set resolved_at = now() where payload ->> 'intendedPairingId' = $1`,
      [plan],
    )
    const after = await getPage('/roster?list=disciples', cookie)
    expect(rowOf(after.html, 'Taylor Brooks')).not.toContain('not made')
    expect(rowOf(after.html, 'Taylor Brooks')).toContain('Awaiting Intake')
  })

  it('has no footnote explaining a status, because no row prints one', async () => {
    // The sentence under the table explained the chip under every name. Both went
    // with Manual pairing, ticket 07.
    const { cookie } = await signIn(ministry)
    for (const list of ['all', 'disciplers', 'disciples']) {
      const { html } = await getPage(`/roster?list=${list}`, cookie)
      expect(html).not.toContain('Status says whether a person is being discipled')
      expect(html).not.toContain('reads Ready to Pair')
    }
  })

  it('offers an empty list its own sentence', async () => {
    const own = await createMinistryWithAdmin('Empty Chapel')
    const { cookie } = await signIn(own)
    // The Admin is on the Roster, as a Disciple; nobody is a Discipler yet.
    const { html } = await getPage('/roster?list=disciplers', cookie)
    expect(html).toContain('No disciplers yet')
    // All is never empty while anybody is on the Roster, and the Admin is.
    const all = await getPage('/roster', cookie)
    expect(names(all.html)).toHaveLength(1)
    expect(all.html).not.toContain('No disciplers yet')
  })
})
