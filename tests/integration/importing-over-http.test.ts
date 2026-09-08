import { beforeAll, describe, expect, it } from 'vitest'
import { createMinistryWithAdmin, type MinistryFixture } from '../support/local-supabase'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import { file, phoneNumbers } from '../support/roster'

/**
 * The headline of the ticket, driven the way an Admin does it: paste the rows,
 * press Import, and see the congregation on the Roster. Over HTTP against the
 * running app, because a report an Admin cannot read is the failure this ticket
 * exists to prevent and no unit test can tell you whether it reached the page.
 */

describe.skipIf(skipUnlessAppIsRunning)('an Admin importing a spreadsheet', () => {
  let ministry: MinistryFixture

  const number = phoneNumbers()

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
  })

  /** The dialog's form, as a browser posts it: the layout and the pasted rows. */
  const upload = async (cookie: string, rows: string, mode = 'people_only') => {
    const response = await fetch(`${baseUrl}/roster/import`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ mode, rows }),
    })

    return { response, location: response.headers.get('location') ?? '' }
  }

  /** One Person's row on the Roster, tags stripped. */
  const rowOf = (html: string, name: string): string => {
    const row = html
      .split('<tr')
      .find((candidate) => new RegExp(`data-testid="roster-name"[^>]*>${name}<`).test(candidate))
    expect(row, `no row for ${name}`).toBeDefined()
    return row!.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  }

  it('sees the imported people on the Roster', async () => {
    const { cookie } = await signIn(ministry)

    const { response, location } = await upload(
      cookie,
      file('Name,Phone,Email', `Ada Rowe,${number()},ada@example.test`, `Ben Okafor,${number()},`),
    )

    expect(response.status).toBe(303)
    expect(location).toContain('added=2')

    const { html } = await getPage(`/roster?${location.split('?')[1] ?? ''}`, cookie)
    expect(html).toContain('Ada Rowe')
    expect(html).toContain('Ben Okafor')
  })

  it('sees them as No Intake Submitted, not as people it may pair', async () => {
    const { cookie } = await signIn(ministry)

    await upload(cookie, file('Name,Phone', `Cara Nolan,${number()}`))

    // On the Disciples list, where everyone an upload adds lands.
    const { html } = await getPage('/roster?list=disciples', cookie)
    expect(html).toContain('No Intake Submitted')
  })

  it('is told which rows were not imported, by line', async () => {
    const { cookie } = await signIn(ministry)

    const { location } = await upload(
      cookie,
      file('Name,Phone', `,${number()}`, `Dana Price,${number()}`, 'Eli Frank,ask him'),
    )

    const { html } = await getPage(`/roster?${location.split('?')[1] ?? ''}`, cookie)

    expect(html).toContain('Line 2')
    expect(html).toContain('no name')
    expect(html).toContain('Line 4')
    expect(html).toContain('the phone number could not be read')
  })

  it('is told when the rows have no column it can use, and imports none of them', async () => {
    const { cookie } = await signIn(ministry)

    const { location } = await upload(
      cookie,
      file('Nickname,Number', 'Zebedee Unread,5550169999'),
    )

    expect(location).toContain('error=no_name_column')

    // The dialog is open already, with the reason inside it beside the rows.
    const { html } = await getPage(`/roster?${location.split('?')[1] ?? ''}`, cookie)
    expect(html).toMatch(/class="modal-bg open"/)
    expect(html).toContain('no column of names')
    expect(html).not.toContain('Zebedee Unread')
  })

  it('is told to paste something when nothing was', async () => {
    const { cookie } = await signIn(ministry)

    const { location } = await upload(cookie, '   \n')
    expect(location).toContain('error=nothing_pasted')
  })

  it('carries the import dialog on the Roster, opened from a link with no script', async () => {
    const { cookie } = await signIn(ministry)
    const { html } = await getPage('/roster', cookie)

    expect(html).toContain('href="#import"')
    expect(html).toContain('Import Dataset')
    expect(html).toMatch(/<div[^>]*id="import"[^>]*class="modal-bg"/)
    expect(html).toContain('Already paired')
    expect(html).toContain('People only')
    expect(html).toContain('<textarea name="rows"')
    expect(html).toContain('mailto:support@trydiscipler.com')
    // Without script the review is the server's, and the page says so.
    expect(html).toContain('Review and confirm happens after you press Import')
    expect(html).not.toContain('type="file"')
  })

  it('plans the pairs an Already paired paste describes, and says so on both rows', async () => {
    const { cookie } = await signIn(ministry)

    const { location } = await upload(
      cookie,
      [
        'Discipler\tDiscipler Phone\tDiscipler Email\tDisciple\tDisciple Phone\tDisciple Email',
        `Sam Rivera\t${number()}\tsam@example.test\tTaylor Brooks\t${number()}\t`,
      ].join('\n'),
      'already_paired',
    )

    expect(location).toContain('added=2')
    expect(location).toContain('planned=1')

    const { html } = await getPage(`/roster?${location.split('?')[1] ?? ''}`, cookie)
    expect(html).toContain('2 people were added.')
    expect(html).toContain('1 pair was planned.')

    // Sam is a Discipler by the plan; Taylor is the Disciple; both say *planned*.
    const disciplers = await getPage('/roster', cookie)
    expect(rowOf(disciplers.html, 'Sam Rivera')).toContain('Taylor Brooks planned')
    expect(rowOf(disciplers.html, 'Sam Rivera')).toContain('awaiting Intake')
    const disciples = await getPage('/roster?list=disciples', cookie)
    expect(rowOf(disciples.html, 'Taylor Brooks')).toContain('Sam Rivera planned')
    expect(disciples.html).not.toMatch(/data-testid="roster-name"[^>]*>Sam Rivera</)
  })

  it('plans a pair from a People only paste naming somebody already on the Roster', async () => {
    const { cookie } = await signIn(ministry)
    await upload(cookie, file('Name,Phone', `Ruth Adeyemi,${number()}`))

    const { location } = await upload(
      cookie,
      file('Name,Role,Phone,Paired With', `Omar Haddad,Disciple,${number()},Ruth Adeyemi`),
    )

    expect(location).toContain('added=1')
    expect(location).toContain('planned=1')
    const { html } = await getPage('/roster', cookie)
    expect(rowOf(html, 'Ruth Adeyemi')).toContain('Omar Haddad planned')
  })

  it('is told, by line, about a pair it would not plan, and still imports the person', async () => {
    const { cookie } = await signIn(ministry)

    const { location } = await upload(
      cookie,
      file('Name,Role,Phone,Paired With', `Lone Row,Disciple,${number()},Nobody Here`),
    )

    expect(location).toContain('added=1')
    expect(location).not.toContain('planned=')
    const { html } = await getPage(`/roster?${location.split('?')[1] ?? ''}`, cookie)
    expect(html).toContain('Line 2')
    expect(html).toContain('neither in these rows nor on the Roster')
  })

  it('renders nothing at all for an invented report in the query string', async () => {
    const { cookie } = await signIn(ministry)

    const { html } = await getPage(
      `/roster?added=1&refused=%3Cscript%3Ealert(1)%3C%2Fscript%3E%3A2`,
      cookie,
    )

    // The wording comes from the code, never from the URL, so an unrecognised
    // problem is dropped rather than rendered: the report says a Person was added
    // and lists no refused rows at all.
    expect(html).toContain('1 person was added')
    expect(html).not.toContain('rows were not imported')
    expect(html).not.toContain('<script>alert(1)</script>')
  })

  it('turns away a visitor who is not signed in', async () => {
    const { response, location } = await upload('', 'Name,Phone\nIntruder,5550169998')

    expect(response.status).toBe(303)
    expect(location).toContain('/roster')

    // Nothing was imported: the Roster is reachable only by its own Admin, and the
    // page they land on will send them to sign in.
    const { response: roster } = await getPage('/roster', '')
    expect(roster.status).toBe(307)
  })
})
