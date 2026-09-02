import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { baseUrl, skipUnlessAppIsRunning } from '../support/app'
import {
  addMembership,
  addPerson,
  createMinistryWithAdmin,
  localSupabase,
  openMaterialHistory,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The headline of ticket 03, driven the way a congregant does it: open the link,
 * fill the form in, press Submit. Over HTTP against the running app, because this is
 * the one surface in Discipler used by somebody who will never have an account, and
 * no unit test can tell you whether they could actually reach it.
 *
 * Since ticket 29 the link opens the group form, so what is filled in here is that
 * form: the same questions the single page asked, minus the Goal and plus which
 * group. What ticket 03 promised -- a Person with no account lands on the Roster
 * as Ready to Pair, with the route they arrived by on the record -- holds unchanged.
 */
describe.skipIf(skipUnlessAppIsRunning)('a Person completing Intake from a link', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool
  let groupId: string

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })

    // One group for the link to offer. A Ministry with none shows a page that says
    // so, which is its own test in `joining-a-group-over-http`.
    const leader = await addPerson(ministry, 'Ruth Adeyemi', { phone: '+15558120090', answers: { gender: 'female' } })
    const first = await addPerson(ministry, 'Emily Johnson', { phone: '+15558120091', answers: { gender: 'female' } })
    const acceptedAt = new Date('2026-03-02T09:00:00Z')
    const { rows } = await pool.query<{ id: string }>(
      `insert into relationship (ministry_id, kind, accepted_at, name, declared_gender)
       values ($1, 'group', $2, 'Tuesday Women’s Group', 'female') returning id`,
      [ministry.id, acceptedAt],
    )
    groupId = rows[0]!.id
    await openMaterialHistory(ministry, groupId, acceptedAt)
    await addMembership({ ministry, relationshipId: groupId, kind: 'group', personId: leader, role: 'leader' })
    await addMembership({ ministry, relationshipId: groupId, kind: 'group', personId: first, role: 'participant' })
  })

  afterAll(async () => {
    await pool.end()
  })

  const submit = async (fields: Record<string, string>, slots: string[]) => {
    const body = new URLSearchParams(fields)
    for (const slot of slots) body.append('availability', slot)

    const response = await fetch(`${baseUrl}/intake/${ministry.id}/submit`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    return { response, location: response.headers.get('location') ?? '' }
  }

  it('serves the form to somebody with no account at all', async () => {
    const response = await fetch(`${baseUrl}/intake/${ministry.id}`, { redirect: 'manual' })
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('Riverside Chapel')
    // The first screen. The grid and both consent decisions are on later ones.
    expect(html).toContain('name="ageBand"')
    expect(html).toContain('name="gender"')

    const last = await fetch(
      `${baseUrl}/intake/${ministry.id}?step=4&ageBand=35-44&gender=female&availability=monday:12&groupId=${groupId}`,
      { redirect: 'manual' },
    ).then((r) => r.text())
    expect(last).toContain('name="smsConsent"')
    expect(last).toContain('value="declined"')
  })

  it('records the submission and moves the Person to Ready to Pair', async () => {
    const { response, location } = await submit(
      {
        fullName: 'Hannah Reeves',
        phone: '555 812 0100',
        email: 'hannah@example.test',
        ageBand: '35-44',
        gender: 'female',
        groupId,
        smsConsent: 'yes',
        contactSharing: 'granted',
        via: 'qr',
      },
      ['wednesday:18', 'saturday:12'],
    )

    expect(response.status).toBe(303)
    expect(location).toContain('/done')

    const { rows } = await pool.query(
      `select participation_status(p) as status from person p
        where p.ministry_id = $1 and p.full_name = 'Hannah Reeves'`,
      [ministry.id],
    )
    // In a group now, which is what Paired means.
    expect(rows[0].status).toBe('paired')

    const { rows: consents } = await pool.query(
      `select c.source from consent_record c join person p on p.id = c.person_id
        where c.ministry_id = $1 and p.full_name = 'Hannah Reeves'`,
      [ministry.id],
    )
    // A QR code at a leaders' meeting is the other route, and the record says so.
    expect(consents.every((row) => row.source === 'qr_code')).toBe(true)
  })

  it('sends an incomplete form back to the page with codes, never with what was typed', async () => {
    const { response, location } = await submit(
      {
        fullName: 'Nathan Cole',
        phone: '555 812 0101',
        ageBand: '35-44',
        gender: 'female',
        groupId,
        contactSharing: 'granted',
        via: 'link',
      },
      [],
    )

    expect(response.status).toBe(303)
    expect(location).toContain('refused=')
    expect(location).toContain('intake.availability_not_selected')
    expect(location).toContain('intake.sms_consent_required')
    expect(location).not.toContain('Nathan')
    expect(location).not.toContain('0101')

    const { rows } = await pool.query(
      `select count(*)::int as n from person where ministry_id = $1 and full_name = 'Nathan Cole'`,
      [ministry.id],
    )
    expect(rows[0].n).toBe(0)
  })

  it('refuses a route it does not recognise rather than recording the primary one', async () => {
    const { location } = await submit(
      {
        fullName: 'Iris Bramwell',
        phone: '555 812 0102',
        ageBand: '25-34',
        gender: 'female',
        groupId,
        smsConsent: 'yes',
        contactSharing: 'granted',
        via: 'admin_attested',
      },
      ['monday:12'],
    )

    // An Admin attesting on a congregant's behalf is not a route to Intake, and a
    // consent record that cannot say how the Person came to agree must fail rather
    // than quietly record the pastor link.
    expect(location).toContain('intake.source_unknown')

    const { rows } = await pool.query(
      `select count(*)::int as n from person where ministry_id = $1 and full_name = 'Iris Bramwell'`,
      [ministry.id],
    )
    expect(rows[0].n).toBe(0)
  })
})
