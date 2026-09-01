import { describe, expect, it } from 'vitest'
import { createMinistryWithAdmin } from '../support/local-supabase'
import { baseUrl, getPage, signIn, skipUnlessAppIsRunning } from '../support/app'
import { file, phoneNumbers } from '../support/roster'

/**
 * The half of ticket 26 that only exists on a screen. The domain proves that either
 * answer does the right thing; what no unit test can say is whether an Admin is
 * offered both, whether the offer survives navigating away, and whether pressing one
 * of them changes anything.
 *
 * A Ministry each, rather than one shared by the file. Half of what is worth
 * asserting here is what the Roster *stops* saying once a row is answered, and a
 * shared Ministry accumulates other tests' unanswered rows -- which say the same
 * words and would make every one of those assertions pass or fail for the wrong
 * reason.
 */

describe.skipIf(skipUnlessAppIsRunning)('an Admin answering a held import row', () => {
  const number = phoneNumbers()

  const upload = async (cookie: string, csv: string) => {
    const form = new FormData()
    form.set('file', new File([csv], 'congregation.csv', { type: 'text/csv' }))

    await fetch(`${baseUrl}/roster/import`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie },
      body: form,
    })
  }

  /**
   * A signed-in Admin whose Roster holds one number under `existing`, and who has
   * just uploaded a file naming that same number under `incoming` -- which is the
   * one thing the importer will not guess about.
   */
  const collide = async (existing: string, incoming: string) => {
    const ministry = await createMinistryWithAdmin('Riverside Chapel')
    const { cookie } = await signIn(ministry)
    const phone = number()

    await upload(cookie, file('Name,Phone', `${existing},${phone}`))
    await upload(cookie, file('Name,Phone', `${incoming},${phone}`))

    return { cookie, phone }
  }

  /**
   * One question as the page renders it, found by the name the file carried. Read
   * out of the markup rather than out of the database, because what this suite is
   * proving is that the page carries enough for the form beside it to work.
   */
  const questionFor = (html: string, fullName: string): string => {
    const block = html
      .split('<h3>Line ')
      .slice(1)
      .find((part) => part.slice(0, 200).includes(`“${fullName}”`))

    if (!block) throw new Error(`No question was rendered for ${fullName}`)
    return block
  }

  const fieldIn = (block: string, name: string): string => {
    const value = new RegExp(`name="${name}" value="([0-9a-f-]{36})"`).exec(block)?.[1]
    if (!value) throw new Error(`No ${name} was rendered on the question`)
    return value
  }

  const answering = (cookie: string, body: Record<string, string>) =>
    fetch(`${baseUrl}/roster/resolve`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    })

  it('is offered both answers, on the row, without re-uploading the file', async () => {
    const { cookie } = await collide('Emily Johnson', 'Em Johnson')

    // A plain Roster load, not the redirect the import came back on. The whole
    // point is that the question outlives the report that pointed at it.
    const { html } = await getPage('/roster', cookie)

    expect(html).toContain('Rows waiting on you')
    expect(html).toContain('Line 2')
    expect(html).toContain('Same person as Emily Johnson')
    expect(html).toContain('Someone else on this number')
  })

  it('renames the Person when the Admin says it is the same one', async () => {
    const { cookie } = await collide('David Ellis', 'Dave Ellis')

    const before = await getPage('/roster', cookie)
    const question = questionFor(before.html, 'Dave Ellis')

    const response = await answering(cookie, {
      rowId: fieldIn(question, 'rowId'),
      answer: 'same_person',
      personId: fieldIn(question, 'personId'),
    })
    expect(response.status).toBe(303)

    const { html } = await getPage('/roster', cookie)
    expect(html).toContain('Dave Ellis')
    expect(html).not.toContain('David Ellis')
    // Answered, so the question is gone from the screen and the Roster is the
    // only thing left saying anything about them.
    expect(html).not.toContain('Rows waiting on you')
  })

  it('adds a second Person when the Admin says it is somebody else', async () => {
    const { cookie } = await collide('Sam Okafor', 'Rita Okafor')

    const before = await getPage('/roster', cookie)
    const response = await answering(cookie, {
      rowId: fieldIn(questionFor(before.html, 'Rita Okafor'), 'rowId'),
      answer: 'someone_else',
    })
    expect(response.status).toBe(303)

    const { html } = await getPage('/roster', cookie)
    expect(html).toContain('Sam Okafor')
    expect(html).toContain('Rita Okafor')
    expect(html).not.toContain('Rows waiting on you')
  })

  it('changes nothing on a post that does not say which answer it means', async () => {
    // There is no default, so a form arriving without one is not a third answer --
    // it is a post that did not come from the Roster.
    const { cookie } = await collide('Peter Adeyemi', 'Pete Adeyemi')

    const before = await getPage('/roster', cookie)
    await answering(cookie, { rowId: fieldIn(questionFor(before.html, 'Pete Adeyemi'), 'rowId') })

    const { html } = await getPage('/roster', cookie)
    expect(html).toContain('Same person as Peter Adeyemi')
    expect(html).not.toContain('Pete Adeyemi</td>')
  })

  it('tells the Admin when somebody answered the row first', async () => {
    const { cookie } = await collide('Hannah Reid', 'Hana Reid')

    const before = await getPage('/roster', cookie)
    const row = fieldIn(questionFor(before.html, 'Hana Reid'), 'rowId')

    await answering(cookie, { rowId: row, answer: 'someone_else' })
    const second = await answering(cookie, { rowId: row, answer: 'someone_else' })

    expect(second.headers.get('location')).toContain('rowError=import_row.already_answered')
  })

  it('answers nothing for a signed-out visitor', async () => {
    const response = await answering('', {
      rowId: crypto.randomUUID(),
      answer: 'someone_else',
    })

    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toContain('/roster')
  })
})
