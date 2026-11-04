import { describe, expect, it } from 'vitest'
import {
  PLANT_ANSWER_LONGEST,
  PLANT_ANYTHING_ELSE_LONGEST,
  readPlantApplication,
  type PlantFormFields,
} from '~/domain/church-plant'
import { readAccountForm } from '~/domain/sign-up-account'

/** How the church-plant questions are read (Exponential launch, ticket 19). */
const answered: PlantFormFields = {
  isPlant: 'yes',
  launchDate: 'September 2025',
  sendingChurch: 'First Baptist',
  averageAttendance: 'about 120',
  leadPastor: 'Dan Whitfield',
  anythingElse: '',
}

describe('reading the application', () => {
  it('reads nothing behind No, whatever was typed before they changed their mind', () => {
    expect(readPlantApplication({ ...answered, isPlant: 'no' })).toEqual({ plant: null })
    expect(readPlantApplication({ ...answered, isPlant: '' })).toEqual({ plant: null })
    expect(readPlantApplication(undefined)).toEqual({ plant: null })
  })

  it('keeps the four answers tidied, and no answer to the optional question as null', () => {
    expect(readPlantApplication({ ...answered, leadPastor: '  Dan   Whitfield ' })).toEqual({
      plant: {
        launchDate: 'September 2025',
        sendingChurch: 'First Baptist',
        averageAttendance: 'about 120',
        leadPastor: 'Dan Whitfield',
        anythingElse: null,
      },
    })
  })

  it.each([
    ['launchDate', 'signup.plant_launch_date_needed'],
    ['sendingChurch', 'signup.plant_sending_church_needed'],
    ['averageAttendance', 'signup.plant_attendance_needed'],
    ['leadPastor', 'signup.plant_lead_pastor_needed'],
  ])('refuses Yes with %s empty or only spaces', (field, refusal) => {
    expect(readPlantApplication({ ...answered, [field]: '' })).toEqual({ refusal })
    expect(readPlantApplication({ ...answered, [field]: '  \t ' })).toEqual({ refusal })
  })

  it('keeps the lines of "Anything else"', () => {
    const read = readPlantApplication({ ...answered, anythingElse: '  We meet in a school.\r\n\r\nFirst service in May. ' })
    expect(read).toMatchObject({ plant: { anythingElse: 'We meet in a school.\n\nFirst service in May.' } })
  })

  it('refuses more than an email can carry, and takes exactly that much', () => {
    const longest = 'x'.repeat(PLANT_ANSWER_LONGEST)
    expect(readPlantApplication({ ...answered, sendingChurch: longest })).toMatchObject({ plant: { sendingChurch: longest } })
    expect(readPlantApplication({ ...answered, sendingChurch: `${longest}x` })).toEqual({
      refusal: 'signup.plant_answer_too_long',
    })
    expect(readPlantApplication({ ...answered, anythingElse: 'x'.repeat(PLANT_ANYTHING_ELSE_LONGEST + 1) })).toEqual({
      refusal: 'signup.plant_answer_too_long',
    })
  })
})

describe('as part of the page', () => {
  const page = {
    churchName: 'Grace Church',
    fullName: 'Dan Whitfield',
    heardFrom: '',
    password: 'grace shepherds 1',
    timezone: 'America/Chicago',
    cycle: 'month',
    agreedToTerms: true,
  }

  it('leaves a form that never mentions it as a church that did not apply', () => {
    expect(readAccountForm(page)).toMatchObject({ form: { plant: null } })
  })

  it('carries the answers with the form', () => {
    expect(readAccountForm({ ...page, plant: answered })).toMatchObject({
      form: { plant: { sendingChurch: 'First Baptist' } },
    })
  })

  it('is read in the order it is asked, after the timezone and before how to pay', () => {
    const noLaunchDate = { ...answered, launchDate: '' }
    expect(readAccountForm({ ...page, timezone: 'Not/AZone', plant: noLaunchDate })).toEqual({ refusal: 'signup.bad_timezone' })
    expect(readAccountForm({ ...page, cycle: 'weekly', plant: noLaunchDate })).toEqual({
      refusal: 'signup.plant_launch_date_needed',
    })
  })
})
