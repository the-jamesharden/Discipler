import { beforeAll, describe, expect, it } from 'vitest'
import { createMinistryWithAdmin, type MinistryFixture } from '../support/local-supabase'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import { file, phoneNumbers } from '../support/roster'

/**
 * The headline of the ticket, driven the way an Admin does it: choose a file, press
 * Import, and see the congregation on the Roster. Over HTTP against the running app,
 * because a report an Admin cannot read is the failure this ticket exists to prevent
 * and no unit test can tell you whether it reached the page.
 */

describe.skipIf(skipUnlessAppIsRunning)('an Admin importing a spreadsheet', () => {
  let ministry: MinistryFixture

  const number = phoneNumbers()

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
  })

  const upload = async (cookie: string, csv: string) => {
    const form = new FormData()
    form.set('file', new File([csv], 'congregation.csv', { type: 'text/csv' }))

    const response = await fetch(`${baseUrl}/roster/import`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie },
      body: form,
    })

    return { response, location: response.headers.get('location') ?? '' }
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

    const { html } = await getPage('/roster', cookie)
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

  it('is told when the file has no column it can use, and imports none of it', async () => {
    const { cookie } = await signIn(ministry)

    const { location } = await upload(
      cookie,
      file('Nickname,Number', 'Zebedee Unread,5550169999'),
    )

    expect(location).toContain('error=no_name_column')

    const { html } = await getPage(`/roster?${location.split('?')[1] ?? ''}`, cookie)
    expect(html).toContain('no column of names')
    expect(html).not.toContain('Zebedee Unread')
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
