import { describe, expect, it } from 'vitest'
import { backFromARefusal, changesTheChurchsWork } from '~/domain/read-only'

describe('what an ended church is refused', () => {
  it.each(['/settings/save', '/roster/remove', '/materials/new', '/follow-up/note', '/intake-forms/save', '/a-route-nobody-has-thought-of'])(
    'refuses a POST to %s',
    (path) => {
      expect(changesTheChurchsWork('POST', path)).toBe(true)
    },
  )

  it.each(['PUT', 'PATCH', 'DELETE'])('refuses a %s as well', (method) => {
    expect(changesTheChurchsWork(method, '/roster/remove')).toBe(true)
  })

  it.each(['GET', 'HEAD', 'OPTIONS'])('reads with a %s', (method) => {
    expect(changesTheChurchsWork(method, '/roster/remove')).toBe(false)
  })

  it.each([
    '/account/password',
    '/auth/sign-out',
    '/cron/tick',
    '/help/contact',
    '/intake/some-token/submit',
    '/invitation/some-token/accept',
    '/login',
    '/material/some-token',
    '/r/grace',
    '/settings/billing/open',
    '/settings/billing/restart/open',
    '/setup/some-token',
    '/signup/payment/open',
    '/sms/inbound',
    '/stripe/webhook',
  ])('leaves %s open: it is not the church’s work, or it is a link already texted', (path) => {
    expect(changesTheChurchsWork('POST', path)).toBe(false)
  })

  it('does not mistake a page for what its name begins with', () => {
    expect(changesTheChurchsWork('POST', '/intake-forms')).toBe(true)
    expect(changesTheChurchsWork('POST', '/materials')).toBe(true)
    expect(changesTheChurchsWork('POST', '/settings/billingish')).toBe(true)
    expect(changesTheChurchsWork('POST', '/roster')).toBe(true)
  })
})

describe('where a refused press goes', () => {
  const HOST = 'app.example'
  const ORIGIN = `https://${HOST}`

  it('is the page it came from', () => {
    expect(backFromARefusal(`${ORIGIN}/roster/abc?removing=yes`, HOST)).toBe('/roster/abc?removing=yes')
  })

  it('is never another site', () => {
    expect(backFromARefusal('https://elsewhere.example/phish', HOST)).toBe('/overview')
  })

  it('is the Overview where nothing says', () => {
    expect(backFromARefusal(null, HOST)).toBe('/overview')
    expect(backFromARefusal('not an address', HOST)).toBe('/overview')
  })
})
