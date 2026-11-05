import { describe, expect, it } from 'vitest'
import { ABOUT_A_PERSON, ASK, questionsLeftLine, sourceLabel } from '../../app/help/ask/copy'
import { askDisciplerInstructions } from '../../app/help/ask/instructions'
import { guideReply } from '../../app/help/ask/reply'
import { HELP_PAGES } from '../../app/help/library'

/** A reply from the guide as the chat draws it (Exponential launch, ticket 31). */
describe('a reply', () => {
  it('renders the Markdown it is told to write', () => {
    const { html } = guideReply('Two ways:\n\n- **Share** your link.\n- Add them yourself.\n\nSource: /help/roster-and-intake')
    expect(html).toContain('<strong>Share</strong>')
    expect(html).toContain('<li>')
  })

  it('renders no image, however it is written', () => {
    const { html } = guideReply(
      [
        '![a tracker](https://example.org/pixel.png)',
        '[![in a link](https://example.org/a.png)](/help/settings)',
        '![by reference][pic]',
        '',
        '[pic]: https://example.org/b.png',
      ].join('\n'),
    )
    expect(html).not.toContain('<img')
    expect(html).not.toContain('example.org')
  })

  it.each([
    ['[click here](https://example.org/steal)', 'click here'],
    ['[here](http://example.org)', 'here'],
    ['[here](//example.org/help/settings)', 'here'],
    ['[here](/login)', 'here'],
    ['[here](/help/../login)', 'here'],
    ['[here](/help/no-such-page)', 'here'],
    ['[here](javascript:alert(1))', 'here'],
    ['[here](https://app.trydiscipler.com/help/settings)', 'here'],
    ['[here](mailto:someone@example.org)', 'here'],
  ])('keeps the words of a link that goes elsewhere and not the link: %s', (markdown, words) => {
    const { html } = guideReply(markdown)
    expect(html).not.toContain('<a')
    expect(html).toContain(words)
  })

  it('takes away an address written as a link, words and all', () => {
    const { html } = guideReply('See <https://example.org/steal> for more.')
    expect(html).not.toContain('<a')
    expect(html).not.toContain('example.org')
    expect(html).toContain('for more.')
  })

  it.each(['/help', '/help/settings', '/help/settings#your-check-in'])('keeps a link to a help page: %s', (href) => {
    const { html } = guideReply(`[Settings](${href})`)
    expect(html).toContain(`<a href="${href}" target="_blank" rel="noopener">Settings</a>`)
  })

  it('takes away an address written out in the words, and leaves an email address alone', () => {
    const { html } = guideReply('See https://evil.example/plain or www.evil.example for more. Write to support@trydiscipler.com.')
    expect(html).not.toContain('https://evil.example')
    expect(html).not.toContain('<a ')
    expect(html).toContain('support@trydiscipler.com')
  })

  it('draws raw HTML as words and never as a tag', () => {
    const { html } = guideReply('<img src=x onerror=alert(1)>\n\n<script>alert(1)</script>\n\nA <b>word</b>.')
    expect(html).not.toMatch(/<(img|script|b)\b/)
    expect(html).toContain('&lt;script&gt;')
  })

  it('carries nothing on a link but its address', () => {
    const { html } = guideReply('[Settings](/help/settings "a title")')
    expect(html).not.toContain('title=')
  })

  describe('ends with the page it came from', () => {
    it('by the page’s own title', () => {
      expect(guideReply('Open it.\n\nSource: /help/settings').source).toEqual({
        label: `Help center: ${HELP_PAGES.find((page) => page.slug === 'settings')!.title}`,
        href: '/help/settings',
      })
    })

    it('and not in the words', () => {
      expect(guideReply('Open it.\n\nSource: /help/settings').html).not.toContain('Source')
    })

    it.each(['Open it.', 'Open it.\n\nSource: /help/no-such-page', 'Open it.\n\nSource: /help'])(
      'or the Help center, where it named none that exists: %j',
      (answer) => {
        expect(guideReply(answer).source).toEqual({ label: 'Help center', href: '/help' })
      },
    )
  })
})

describe('the words on screen', () => {
  it('are the ones approved in mock-up 4', () => {
    expect(ABOUT_A_PERSON).toBe(
      "I can't see anyone in your church, so I can't answer about a particular person or relationship. Their row on Check-Ins shows every answer they have sent.",
    )
    expect(ASK.limitLine).toBe("That's 30 questions today, the most for one day. You can ask again tomorrow.")
    expect(`${ASK.limitBeforeLink}${ASK.helpCenter}${ASK.limitAfterLink}`).toBe(
      'The Help center has every answer I give, any time.',
    )
    expect(ASK.failed).toBe("Sorry, I couldn't answer just now. Please try again in a minute.")
    expect(ASK.warning).toBe("Please don't paste names, phone numbers or prayer requests.")
    expect(ASK.limitBox).toBe('You can ask again tomorrow')
    expect(ASK.placeholder).toBe('Ask about Discipler…')
  })

  it('say how many are left from five down, and not at none', () => {
    expect(questionsLeftLine(null)).toBeNull()
    expect(questionsLeftLine(6)).toBeNull()
    expect(questionsLeftLine(5)).toBe('5 questions left today')
    expect(questionsLeftLine(1)).toBe('1 question left today')
    expect(questionsLeftLine(0)).toBeNull()
  })

  it('label the page or the whole Help center', () => {
    expect(sourceLabel('Settings')).toBe('Help center: Settings')
    expect(sourceLabel(null)).toBe('Help center')
  })
})

describe('what the model is told', () => {
  const instructions = askDisciplerInstructions()

  it('holds every help page, with the address to end an answer on', () => {
    for (const page of HELP_PAGES) {
      expect(instructions).toContain(`# ${page.title}\nAddress: ${page.href}`)
    }
  })

  it('quotes the words about a person exactly', () => {
    expect(instructions).toContain(ABOUT_A_PERSON)
  })

  it('is the same text each time, so its prefix can be cached', () => {
    expect(askDisciplerInstructions()).toBe(instructions)
  })
})
