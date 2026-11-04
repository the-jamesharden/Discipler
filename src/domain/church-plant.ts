import { EMAIL_LINE_LONGEST, EMAIL_QUOTED_LONGEST } from './email'
import { readWording } from './wording'

/**
 * A church-plant application (Exponential launch, ticket 19): what "Set up your account"
 * asks behind "Yes, we are", and how the answers are read. The browser's button is a
 * courtesy; this is the rule.
 *
 * The launch date and the attendance are free text, because the page asks for them that
 * way ("For example, September 2025") and a person decides each application. Nothing here
 * judges the answers, so nothing here can approve one.
 */

/** The most one answer may hold: what an email carries of it, so nothing is cut there. */
export const PLANT_ANSWER_LONGEST = EMAIL_LINE_LONGEST
export const PLANT_ANYTHING_ELSE_LONGEST = EMAIL_QUOTED_LONGEST

/** The value of "Yes, we are". Anything else is No, which is what the page preselects. */
export const IS_A_PLANT = 'yes'

export interface PlantFormFields {
  readonly isPlant: string
  readonly launchDate: string
  readonly sendingChurch: string
  readonly averageAttendance: string
  readonly leadPastor: string
  readonly anythingElse: string
}

export interface PlantAnswers {
  readonly launchDate: string
  readonly sendingChurch: string
  readonly averageAttendance: string
  readonly leadPastor: string
  readonly anythingElse: string | null
}

export type PlantFormRefusal =
  | 'signup.plant_launch_date_needed'
  | 'signup.plant_sending_church_needed'
  | 'signup.plant_attendance_needed'
  | 'signup.plant_lead_pastor_needed'
  | 'signup.plant_answer_too_long'

/** "Anything else" keeps its lines, each read as wording, and is null when it holds none. */
const readLines = (raw: string): string | null => {
  const lines = raw.split(/\r\n?|\n/).map((line) => readWording(line) ?? '')
  return lines.join('\n').trim() || null
}

/**
 * The answers, or null for a church that is not applying, or why not, top to bottom as
 * the page asks. Nothing behind "No" is read, so somebody who opened the block, typed
 * and changed their mind has not applied.
 */
export const readPlantApplication = (
  fields: PlantFormFields | undefined,
): { readonly plant: PlantAnswers | null } | { readonly refusal: PlantFormRefusal } => {
  if (fields?.isPlant !== IS_A_PLANT) return { plant: null }

  const launchDate = readWording(fields.launchDate)
  if (!launchDate) return { refusal: 'signup.plant_launch_date_needed' }
  const sendingChurch = readWording(fields.sendingChurch)
  if (!sendingChurch) return { refusal: 'signup.plant_sending_church_needed' }
  const averageAttendance = readWording(fields.averageAttendance)
  if (!averageAttendance) return { refusal: 'signup.plant_attendance_needed' }
  const leadPastor = readWording(fields.leadPastor)
  if (!leadPastor) return { refusal: 'signup.plant_lead_pastor_needed' }
  const anythingElse = readLines(fields.anythingElse)

  const fits =
    [launchDate, sendingChurch, averageAttendance, leadPastor].every(
      (answer) => answer.length <= PLANT_ANSWER_LONGEST,
    ) && (anythingElse?.length ?? 0) <= PLANT_ANYTHING_ELSE_LONGEST
  if (!fits) return { refusal: 'signup.plant_answer_too_long' }

  return { plant: { launchDate, sendingChurch, averageAttendance, leadPastor, anythingElse } }
}

export type PlantDecision = 'approved' | 'declined'

/** One application, as the operator's command reads it. */
export interface PlantApplication {
  readonly id: string
  readonly churchId: string
  readonly churchName: string
  /** The clock a date in an email to this church is read on. */
  readonly timezone: string
  /** Where the decision goes: the address its Admin proved at sign-up, or null if none. */
  readonly adminEmail: string | null
  readonly answers: PlantAnswers
  readonly appliedAt: Date
  readonly decision: PlantDecision | null
  readonly decidedAt: Date | null
}
