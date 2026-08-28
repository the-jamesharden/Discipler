import { describe, expect, it } from 'vitest'
import { readIntakeForm, type IntakeFormFields } from '~/domain/intake'

const wellFormed: IntakeFormFields = {
  fullName: 'Emily Johnson',
  phone: '(555) 234-9911',
  email: 'emily@example.test',
  ageBand: '25-34',
  gender: 'female',
  goalId: '00000000-0000-4000-8000-000000000009',
  availability: ['monday:midday', 'thursday:evening'],
  smsConsent: true,
  contactSharing: 'granted',
  source: 'pastor_link',
}

const read = (overrides: Partial<IntakeFormFields> = {}) =>
  readIntakeForm({ ...wellFormed, ...overrides })

describe('Reading the Intake form', () => {
  it('reads back everything the Person selected', () => {
    const result = read()

    expect(result).toEqual({
      submission: {
        fullName: 'Emily Johnson',
        phone: '+15552349911',
        email: 'emily@example.test',
        ageBand: '25-34',
        gender: 'female',
        goalId: '00000000-0000-4000-8000-000000000009',
        availability: [
          { day: 'monday', block: 'midday' },
          { day: 'thursday', block: 'evening' },
        ],
        smsConsent: true,
        contactSharingConsent: true,
        source: 'pastor_link',
      },
    })
  })

  it('treats the email as optional', () => {
    expect(read({ email: null })).toMatchObject({ submission: { email: null } })
    expect(read({ email: '  ' })).toMatchObject({ submission: { email: null } })
  })
})

describe('What the Intake form refuses', () => {
  const refusalsOf = (overrides: Partial<IntakeFormFields>): readonly string[] => {
    const result = read(overrides)
    if (!('refusals' in result)) throw new Error('Expected the form to be refused')
    return result.refusals
  }

  it('requires at least one availability slot', () => {
    expect(refusalsOf({ availability: [] })).toEqual(['intake.availability_not_selected'])
  })

  it('refuses a slot it cannot read rather than quietly dropping it', () => {
    expect(refusalsOf({ availability: ['monday:midday', 'someday:whenever'] })).toEqual([
      'intake.availability_unreadable',
    ])
  })

  it('requires an age band, a gender, and a Discipleship Goal', () => {
    expect(refusalsOf({ ageBand: null })).toEqual(['intake.age_band_unknown'])
    expect(refusalsOf({ gender: null })).toEqual(['intake.gender_unknown'])
    expect(refusalsOf({ goalId: null })).toEqual(['intake.goal_not_selected'])
    expect(refusalsOf({ ageBand: '30-something' })).toEqual(['intake.age_band_unknown'])
  })

  it('cannot be submitted without SMS consent, because Discipler would have no way to reach them', () => {
    expect(refusalsOf({ smsConsent: false })).toEqual(['intake.sms_consent_required'])
  })

  it('requires contact sharing to be decided, and accepts "no" as a decision', () => {
    expect(refusalsOf({ contactSharing: null })).toEqual(['intake.contact_sharing_undecided'])
    expect(read({ contactSharing: 'declined' })).toMatchObject({
      submission: { contactSharingConsent: false, smsConsent: true },
    })
  })

  it('has to be told which route the Person arrived by', () => {
    expect(refusalsOf({ source: null })).toEqual(['intake.source_unknown'])
    expect(refusalsOf({ source: 'admin_attested' })).toEqual(['intake.source_unknown'])
  })

  it('refuses an email it cannot read rather than storing it', () => {
    expect(refusalsOf({ email: 'emily-at-example' })).toEqual(['intake.email_unreadable'])
  })

  it('needs a name and a number, because those two together are who a Person is', () => {
    expect(refusalsOf({ fullName: '   ' })).toEqual(['intake.name_missing'])
    expect(refusalsOf({ phone: null })).toEqual(['intake.phone_missing'])
    expect(refusalsOf({ phone: '555-12' })).toEqual(['intake.phone_unreadable'])
  })

  it('reports every problem at once, so the Person fixes the form in one pass', () => {
    expect(refusalsOf({ fullName: '', availability: [], gender: null, smsConsent: false })).toEqual([
      'intake.name_missing',
      'intake.availability_not_selected',
      'intake.gender_unknown',
      'intake.sms_consent_required',
    ])
  })
})
