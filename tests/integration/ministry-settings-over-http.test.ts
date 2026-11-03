import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addPersonWithAccount,
  createMinistryWithAdmin,
  localSupabase,
  type MinistryFixture,
} from '../support/local-supabase'
import {
  baseUrl,
  getPage,
  signIn,
  signInAs,
  skipUnlessAppIsRunning,
} from '../support/app'

/**
 * The settings screen an Admin edits from, driven the way an Admin drives it.
 *
 * Two claims here are claims about a *screen* and cannot be proved anywhere else.
 * The Language preview has to render the ministry's own words inside a real
 * message, or the section is two text boxes whose effect nobody can see until a
 * congregant receives a text. And message structure, reply tokens and the opt-out
 * footer have to be **absent** -- not disabled, not greyed out, not present and
 * unclickable -- because a greyed-out box invites *can you turn that on for us?*
 */

describe.skipIf(skipUnlessAppIsRunning)('the Ministry settings screen', () => {
  let ministry: MinistryFixture
  let pool: pg.Pool

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await pool.end()
  })

  const post = async (cookie: string, body: Record<string, string>) => {
    const response = await fetch(`${baseUrl}/settings/save`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    })
    return { response, location: response.headers.get('location') ?? '' }
  }

  /**
   * The page as an Admin sees it. Next serialises the whole query string into the
   * flight payload after `</main>` whatever a page does with it, so an assertion
   * that a screen says nothing about something has to be made against what it
   * rendered rather than against the whole response.
   */
  const asRendered = (html: string) =>
    html.slice(html.indexOf('<main'), html.indexOf('</main>'))

  const filled = {
    name: 'Riverside Chapel',
    fromName: 'Riverside',
    timezone: 'America/Chicago',
    leaderNoun: 'mentor',
    participantNoun: 'mentee',
    suggestGenderMatch: 'yes',
    suggestMaxAgeBandGap: '1',
    checkinDay: '1',
    checkinHour: '9',
  }

  const settingsOf = async () => {
    const { rows } = await pool.query<Record<string, unknown>>(
      `select name, from_name, timezone, leader_noun, participant_noun,
              suggest_gender_match, suggest_max_age_band_gap, checkin_day, checkin_hour
         from ministry where id = $1`,
      [ministry.id],
    )
    return rows[0]!
  }

  it('shows three sections in one form, with one save', async () => {
    const { cookie } = await signIn(ministry)
    const { html } = await getPage('/settings', cookie)
    const page = asRendered(html)

    for (const section of ['Ministry', 'Language', 'Pairing']) {
      expect(page).toContain(`>${section}</h2>`)
    }

    // One form over all three, and one button. Three saves would let a Ministry's
    // Language land while its Pairing was refused.
    expect(page.match(/<form/g)).toHaveLength(1)
    expect(page).toContain('action="/settings/save"')

    // It is reachable from the screen an Admin is already on, or it is a page
    // nobody finds.
    const { html: roster } = await getPage('/roster', cookie)
    expect(roster).toContain('"/settings"')
  })

  it('saves all three sections from the one button', async () => {
    const { cookie } = await signIn(ministry)

    const { location } = await post(cookie, {
      ...filled,
      timezone: 'Europe/London',
      leaderNoun: 'discipleship coach',
      participantNoun: 'friend',
      suggestMaxAgeBandGap: '2',
      checkinDay: '4',
      checkinHour: '19',
    })

    expect(location).toContain('/settings')

    expect(await settingsOf()).toMatchObject({
      timezone: 'Europe/London',
      leader_noun: 'discipleship coach',
      participant_noun: 'friend',
      suggest_max_age_band_gap: 2,
      checkin_day: 4,
      checkin_hour: 19,
    })
  })

  /**
   * The section that earns the tab. The preview is the real message -- composed by
   * the same function the sender calls, prefix and opt-out disclosure and all --
   * with this Ministry's own words in it.
   */
  it('shows the ministry its own words inside its own messages', async () => {
    const { cookie } = await signIn(ministry)

    await post(cookie, { ...filled, leaderNoun: 'shepherd', participantNoun: 'friend' })

    const { html } = await getPage('/settings', cookie)
    const page = asRendered(html)

    // The words, in the messages the people who read them actually receive. Each
    // sits in its own element so the script can keep it in step as an Admin types,
    // which is what makes the preview live rather than merely current.
    expect(page).toContain('>shepherd</span>')
    expect(page).toContain('you’ve been paired with someone to be their <span data-preview-word="leaderNoun">shepherd</span>')
    // The word for a person being discipled is saved and, since 2026-09-21, is in
    // no message: James's own sentence for the Participant's Starter Message does
    // not say it. So it is on the form and has no preview to be in.
    expect(page).toContain('value="friend"')
    expect(page).not.toContain('>friend</span>')
    // The name the messages read as, in the same shape and for the same reason:
    // *Messages read as* is editable too, and a preview that went on showing the
    // old name would be lying about the half of the message it did not update.
    expect(page).toContain('>Riverside</span>')
    // The message around them, not a fragment of one: the prefix in front and the
    // rest of the real composed invitation behind. It carries no opt-out line,
    // because it is neither first contact nor the Starter Message.
    const invitation = page.slice(page.indexOf('<blockquote'), page.indexOf('</blockquote>'))
    expect(invitation).toContain('Have a look and let us know: discipler.example/invitation/')
    expect(invitation).not.toContain('Reply STOP to opt out')
  })

  it('says what was wrong and saves nothing when the form cannot be taken', async () => {
    const { cookie } = await signIn(ministry)
    const before = await settingsOf()

    // 6am, which the constraint under the column refuses and the form should never
    // have offered -- and a blank word for a role.
    const { location } = await post(cookie, {
      ...filled,
      checkinHour: '6',
      participantNoun: '  ',
    })

    expect(location).toContain('error=')

    // The Location header is absolute, and `getPage` takes a path.
    const { html } = await getPage(new URL(location).pathname + new URL(location).search, cookie)
    const page = asRendered(html)

    expect(page).toContain('between 8am and 9pm')
    expect(page).toContain('word for the person being discipled')
    // Not half of it. One form, one save.
    expect(await settingsOf()).toEqual(before)
  })

  /**
   * The two constraints are not the same kind of thing and the screen does not
   * present them as though they were: one is a safeguarding rule with its own
   * heading and its own warning, the other is a dial in a list of options.
   */
  it('presents the gender rule and the age gap as different controls', async () => {
    const { cookie } = await signIn(ministry)
    const { html } = await getPage('/settings', cookie)
    const page = asRendered(html)

    expect(page).toContain('type="checkbox"')
    expect(page).toContain('name="suggestGenderMatch"')
    expect(page).toContain('permits mixed one-to-ones')

    expect(page).toContain('name="suggestMaxAgeBandGap"')
    // The word the whole setting turns on: an integer with no stated direction is
    // read as symmetric, which would exclude most of a ministry's real pairings.
    expect(page).toMatch(/<strong>above<\/strong>/)
    expect(page).toContain('Never older than their leader')
  })

  it('offers every day, and only the hours nobody is texted outside of', async () => {
    const { cookie } = await signIn(ministry)
    const { html } = await getPage('/settings', cookie)
    const page = asRendered(html)

    for (const day of ['Sunday', 'Monday', 'Saturday']) expect(page).toContain(day)

    expect(page).toContain('value="8"')
    expect(page).toContain('value="21"')
    // The hours outside the clamp are not offered at all. `value="7"` is the one
    // that would have to appear for a 7am cadence to be pickable.
    expect(page).not.toContain('<option value="7"')
    expect(page).not.toContain('<option value="22"')
  })

  /**
   * Absent, and not disabled. Message structure and reply tokens are a state
   * machine and the opt-out footer is a carrier obligation; none of the three is a
   * ministry's to vary, and a greyed-out box invites a request to enable it.
   */
  it('offers nothing at all about message structure, reply tokens or the footer', async () => {
    const { cookie } = await signIn(ministry)
    const { html } = await getPage('/settings', cookie)
    const page = asRendered(html)

    // No control anywhere on the page is disabled or read-only, which is the shape
    // a "you cannot change this" field would take.
    expect(page).not.toContain('disabled')
    expect(page).not.toContain('readOnly')
    expect(page).not.toContain('readonly')

    for (const absent of [
      'name="optOut',
      'name="footer',
      'name="replyToken',
      'name="messageTemplate',
      'name="messageBody',
    ]) {
      expect(page).not.toContain(absent)
    }

    // `Reply STOP` appears exactly where it belongs -- inside the preview of a real
    // message -- and never as a field an Admin could edit.
    expect(page).not.toMatch(/<input[^>]*Reply STOP/)
  })

  /**
   * The check-in's four sentences (Exponential launch, ticket 40). The phone is the
   * point: it is composed by the functions that send, so what is on it is the frame
   * around whatever the church wrote.
   */
  describe('what the check-in says', () => {
    const wordsOf = async () => {
      const { rows } = await pool.query<Record<string, string | null>>(
        `select checkin_question_sentence as question, checkin_rating_sentence as rating,
                checkin_concern_sentence as concern, checkin_thanks_sentence as thanks
           from ministry where id = $1`,
        [ministry.id],
      )
      return rows[0]!
    }

    const nothingSaved = { question: null, rating: null, concern: null, thanks: null }

    // As it reads: entities undone, and without the comment React puts between a
    // piece of text and a value beside it.
    const unescaped = (html: string) =>
      html.replaceAll('<!-- -->', '').replaceAll('&#x27;', "'").replaceAll('&amp;', '&')

    const phoneOn = (page: string) => {
      const phone = page.indexOf('class="w-screen"')
      return unescaped(page.slice(phone, page.indexOf('</figure>', phone)))
    }

    it('sits under the check-in hour, with Discipler’s words on every line', async () => {
      const { cookie } = await signIn(ministry)
      await post(cookie, filled)

      const { html } = await getPage('/settings', cookie)
      const page = unescaped(asRendered(html))

      expect(page.indexOf('What the check-in says')).toBeGreaterThan(page.indexOf('name="checkinHour"'))

      for (const [name, words] of [
        ['checkInQuestion', 'Did you meet with [name] this week?'],
        ['checkInRating', 'How did the meeting go?'],
        ['checkInConcern', 'Please tell us more about the concern.'],
        ['checkInThanks', 'Thank you. We’ll check in with you next week.'],
      ] as const) {
        expect(page).toMatch(
          new RegExp(`name="${name}"[^>]*>${words.replace(/[.?[\]]/g, '\\$&')}</textarea>`),
        )
      }

      expect(page).toContain('Always ends with “Reply 1 for yes, 2 for no.” so the answer can be counted.')
      expect(page).toContain(
        'Always ends with “Reply A for outstanding, B for good, C for okay, D for concern.” so the answer can be counted.',
      )
      expect(page).toContain('Use Discipler’s wording')
      expect(page).toContain('before “via Discipler”')
      expect(page).toContain('If one person runs discipleship, use their own name.')
    })

    it('shows the phone with the whole frame around Discipler’s words', async () => {
      const { cookie } = await signIn(ministry)
      await post(cookie, filled)

      const { html } = await getPage('/settings', cookie)
      const phone = phoneOn(asRendered(html))

      expect(phone).toContain(
        'Riverside via Discipler: Did you meet with Jordan Ellis this week? Reply 1 for yes, 2 for no. Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
      )
      expect(phone).toContain(
        'Riverside via Discipler: How did the meeting go? Reply A for outstanding, B for good, C for okay, D for concern.',
      )
      expect(phone).toContain('Riverside via Discipler: Please tell us more about the concern.')
      expect(phone).toContain('Riverside via Discipler: Thank you. We’ll check in with you next week.')
    })

    it('saves nothing for a form left as Discipler wrote it, or left blank', async () => {
      const { cookie } = await signIn(ministry)

      await post(cookie, {
        ...filled,
        checkInQuestion: 'Did you meet with [name] this week?',
        checkInRating: 'How did the meeting go?',
        checkInConcern: 'Please tell us more about the concern.',
        checkInThanks: 'Thank you. We’ll check in with you next week.',
      })
      expect(await wordsOf()).toEqual(nothingSaved)

      await post(cookie, { ...filled, checkInQuestion: '   ', checkInThanks: '' })
      expect(await wordsOf()).toEqual(nothingSaved)
    })

    it('saves a rewritten sentence, and puts it on the phone inside the frame', async () => {
      const { cookie } = await signIn(ministry)

      const { location } = await post(cookie, {
        ...filled,
        checkInQuestion: '  Did you get time with [name]?  ',
      })
      expect(location).toContain('saved=yes')
      expect(await wordsOf()).toEqual({
        ...nothingSaved,
        question: 'Did you get time with [name]?',
      })

      const { html } = await getPage('/settings', cookie)
      expect(phoneOn(asRendered(html))).toContain(
        'Riverside via Discipler: Did you get time with Jordan Ellis? Reply 1 for yes, 2 for no.',
      )

      // A blank line goes back to Discipler's words.
      await post(cookie, { ...filled, checkInQuestion: '' })
      expect(await wordsOf()).toEqual(nothingSaved)
    })

    it('refuses a 161-character sentence and saves nothing', async () => {
      const { cookie } = await signIn(ministry)
      await post(cookie, filled)
      const before = await settingsOf()

      const { location } = await post(cookie, {
        ...filled,
        leaderNoun: 'should not be saved',
        checkInThanks: 'x'.repeat(161),
      })
      expect(location).toContain('settings.check_in_sentence_too_long')

      const { html } = await getPage(new URL(location).pathname + new URL(location).search, cookie)
      expect(asRendered(html)).toContain('A check-in sentence can be at most 160 characters.')

      expect(await settingsOf()).toEqual(before)
      expect(await wordsOf()).toEqual(nothingSaved)
    })

    it('refuses a sentence that imitates the frame, and says so', async () => {
      const { cookie } = await signIn(ministry)

      const { location } = await post(cookie, {
        ...filled,
        checkInRating: 'How was it? Reply STOP to keep going.',
      })
      expect(location).toContain('settings.check_in_sentence_says_the_frame')

      const { html } = await getPage(new URL(location).pathname + new URL(location).search, cookie)
      expect(asRendered(html)).toContain('Discipler adds those to every text.')
      expect(await wordsOf()).toEqual(nothingSaved)
    })

    it('carries a control character nowhere, in the form or in the database', async () => {
      const { cookie } = await signIn(ministry)

      await post(cookie, { ...filled, checkInThanks: 'Thanks\u0000 for\u202E\nchecking in.' })
      expect((await wordsOf()).thanks).toBe('Thanks for checking in.')

      await post(cookie, filled)
    })

    it('shows the phone in what is typed, with a name no markup can come through', async () => {
      const { cookie } = await signIn(ministry)

      await post(cookie, { ...filled, checkInConcern: '<script>alert(1)</script> Tell us more.' })
      const { html } = await getPage('/settings', cookie)

      expect(asRendered(html)).not.toContain('<script>alert(1)')
      expect(asRendered(html)).toContain('&lt;script&gt;alert(1)')

      await post(cookie, filled)
    })
  })

  /**
   * A Leader is a member of the Ministry and these are not theirs. The page is
   * what an Admin reaches, and `ministry_settings` -- gated on `app.is_admin_of`
   * -- is what would refuse them even if the page forgot to.
   */
  it('shows a Leader no settings and no form', async () => {
    const leader = await addPersonWithAccount(ministry, 'David Ellis', 'leader')
    const { cookie } = await signInAs({
      phone: leader.phone,
      password: leader.password,
    })

    const { html } = await getPage('/settings', cookie)
    const page = asRendered(html)

    expect(page).toContain('not an Admin of a Ministry')
    expect(page).not.toContain('action="/settings/save"')
    expect(page).not.toContain('name="suggestGenderMatch"')
  })

  it('is refused to somebody who administers no Ministry', async () => {
    const before = await settingsOf()

    const response = await fetch(`${baseUrl}/settings/save`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(filled),
    })

    expect(response.status).toBe(303)

    // Nothing was written on anybody's behalf.
    expect(await settingsOf()).toEqual(before)
  })
})
