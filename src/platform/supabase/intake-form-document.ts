import type { IntakePath } from '~/domain/intake'
import {
  formWording,
  isBuiltInQuestion,
  presetForm,
  PRESET_VERSION,
  type FormPage,
  type FormQuestion,
  type FormWording,
  type IntakeForm,
} from '~/domain/intake-form'

/**
 * One version of an Intake form as `intake_form_version.definition` holds it,
 * and back (Pastor feedback, ticket 11). One document per version rather than a
 * row per question: a version is never changed once saved, it is always read
 * whole, and what somebody part-way through the wizard is served is exactly one
 * of these.
 *
 * The shape, for the tickets that build on it:
 *
 *     { "intro": string | null,
 *       "thankYou": string | null,
 *       "pages": [ { "id": string, "name": string,
 *                    "questions": [ { "key": string, "wording": string,
 *                                     "menteeWording": string | null,
 *                                     "hint": string | null,
 *                                     "required": boolean } ] } ] }
 *
 * Read strictly: the document is Discipler's own, written by `asDefinition`, and
 * one that does not read is the reader and the writer having drifted apart --
 * served as a guess it would put a question in front of a congregant that nobody
 * wrote.
 */

const wordingIn = (value: unknown, where: string): FormWording => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`A stored Intake form has no wording at ${where}`)
  }
  return formWording(value)
}

const optionalWordingIn = (value: unknown, where: string): FormWording | null =>
  value === null || value === undefined ? null : wordingIn(value, where)

const questionIn = (value: unknown, where: string): FormQuestion => {
  const row = (value ?? {}) as Record<string, unknown>
  if (!isBuiltInQuestion(row.key)) {
    throw new Error(`A stored Intake form asks a question it cannot name at ${where}`)
  }
  if (typeof row.required !== 'boolean') {
    throw new Error(`A stored Intake form does not say whether ${row.key} is required`)
  }
  return {
    key: row.key,
    wording: wordingIn(row.wording, `${where}.wording`),
    menteeWording: optionalWordingIn(row.menteeWording, `${where}.menteeWording`),
    hint: optionalWordingIn(row.hint, `${where}.hint`),
    required: row.required,
  }
}

const pageIn = (value: unknown, index: number): FormPage => {
  const row = (value ?? {}) as Record<string, unknown>
  if (typeof row.id !== 'string' || row.id === '') {
    throw new Error(`A stored Intake form's page ${index + 1} has no id`)
  }
  if (!Array.isArray(row.questions)) {
    throw new Error(`A stored Intake form's page ${row.id} has no questions`)
  }
  return {
    id: row.id,
    name: wordingIn(row.name, `page ${row.id}`),
    questions: row.questions.map((question, at) => questionIn(question, `page ${row.id}, ${at + 1}`)),
  }
}

/** A stored version, read. */
export const intakeFormFrom = (name: IntakePath, version: number, definition: unknown): IntakeForm => {
  const doc = (definition ?? {}) as Record<string, unknown>
  if (!Array.isArray(doc.pages) || doc.pages.length === 0) {
    throw new Error(`Version ${version} of a stored ${name} Intake form has no pages`)
  }
  return {
    name,
    version,
    intro: optionalWordingIn(doc.intro, 'intro'),
    thankYou: optionalWordingIn(doc.thankYou, 'thankYou'),
    pages: doc.pages.map(pageIn),
  }
}

/** A version, as it is stored. The name and number are columns beside it. */
export const asDefinition = (form: IntakeForm): Record<string, unknown> => ({
  intro: form.intro,
  thankYou: form.thankYou,
  pages: form.pages.map((each) => ({
    id: each.id,
    name: each.name,
    questions: each.questions.map((question) => ({
      key: question.key,
      wording: question.wording,
      menteeWording: question.menteeWording,
      hint: question.hint,
      required: question.required,
    })),
  })),
})

/**
 * The form a row stands for, or the preset where there is no row: a Ministry
 * that never edited has none, and is served today's form.
 */
export const formOrPreset = (
  name: IntakePath,
  row: { readonly version: number; readonly definition: unknown } | undefined,
): IntakeForm =>
  row && Number(row.version) !== PRESET_VERSION
    ? intakeFormFrom(name, Number(row.version), row.definition)
    : presetForm(name)
