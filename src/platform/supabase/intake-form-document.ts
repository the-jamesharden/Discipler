import { GROUP_PATH, INTAKE_PATHS, isOneOf, type IntakePath } from '~/domain/intake'
import {
  formWording,
  isBuiltInQuestion,
  isOwnKind,
  isOwnQuestion,
  isOwnQuestionKey,
  presetForm,
  PRESET_VERSION,
  questionsOf,
  type BuiltInQuestion,
  type FormPage,
  type FormQuestion,
  type FormWording,
  type IntakeForm,
  type OwnChoice,
} from '~/domain/intake-form'
import { ownAnswersShown, type OwnAnswerShown } from '~/domain/own-answers'

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
 * A Ministry's own question (ticket 12) is keyed `custom:<id>` and adds its kind
 * and, for the two choice kinds, its choices, each with an id its answers point
 * at; the three other kinds carry an empty list:
 *
 *     { "key": "custom:…", …, "kind": "one_choice",
 *       "choices": [ { "id": string, "wording": string } ] }
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

const choiceIn = (value: unknown, where: string): OwnChoice => {
  const row = (value ?? {}) as Record<string, unknown>
  if (typeof row.id !== 'string' || row.id === '') {
    throw new Error(`A stored Intake form has a choice with no id at ${where}`)
  }
  return { id: row.id, wording: wordingIn(row.wording, `${where}.wording`) }
}

const questionIn = (value: unknown, where: string): FormQuestion => {
  const row = (value ?? {}) as Record<string, unknown>
  if (typeof row.required !== 'boolean') {
    throw new Error(`A stored Intake form does not say whether ${String(row.key)} is required`)
  }
  const wording = wordingIn(row.wording, `${where}.wording`)
  const hint = optionalWordingIn(row.hint, `${where}.hint`)

  if (isOwnQuestionKey(row.key)) {
    if (!isOwnKind(row.kind)) {
      throw new Error(`A stored Intake form asks ${row.key} as a kind it cannot name at ${where}`)
    }
    if (!Array.isArray(row.choices)) {
      throw new Error(`A stored Intake form's ${row.key} has no list of choices at ${where}`)
    }
    return {
      key: row.key,
      wording,
      menteeWording: null,
      hint,
      required: row.required,
      kind: row.kind,
      choices: row.choices.map((choice, at) => choiceIn(choice, `${where}, choice ${at + 1}`)),
    }
  }

  if (!isBuiltInQuestion(row.key)) {
    throw new Error(`A stored Intake form asks a question it cannot name at ${where}`)
  }
  return {
    key: row.key,
    wording,
    menteeWording: optionalWordingIn(row.menteeWording, `${where}.menteeWording`),
    hint,
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
      ...(isOwnQuestion(question)
        ? {
            kind: question.kind,
            choices: question.choices.map((choice) => ({ id: choice.id, wording: choice.wording })),
          }
        : {}),
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

/**
 * The Ministry's forms as they stand, off a page document's `intake_forms`: the
 * latest saved version of each form it has edited (`app.intake_forms_now`). A
 * form it never edited is absent and asks none of the Ministry's own questions,
 * so it has nothing to word an answer with and is not needed.
 */
export const formsNowFrom = (value: unknown): readonly IntakeForm[] =>
  (Array.isArray(value) ? (value as Record<string, unknown>[]) : []).map((row) => {
    if (!isOneOf(INTAKE_PATHS, row.form) || typeof row.version !== 'number') {
      throw new Error(`An Intake form arrived that names no form: ${JSON.stringify(row.form)}`)
    }
    return intakeFormFrom(row.form, row.version, row.definition)
  })

/**
 * Discipler's own questions each of the Ministry's two forms no longer asks
 * (Pastor feedback, ticket 13), off a page document's `intake_forms_asked`: the
 * keys of Discipler's questions on the latest version of each form it has edited
 * (`app.intake_forms_asked`), against what that form's preset asks. A form never
 * edited is absent and asks everything. What each surface that reads one of them
 * says it is doing without.
 *
 * Required, unlike the answers' words: a document that said nothing about the
 * forms would read as *nothing removed*, and a surface would go on quietly doing
 * less without saying why.
 */
export const removedFromTheForms = (value: unknown): Readonly<Record<IntakePath, readonly BuiltInQuestion[]>> => {
  if (!Array.isArray(value)) throw new Error('The page said nothing about the Ministry’s Intake forms')
  const asked = new Map<IntakePath, readonly unknown[]>()
  for (const row of value as Record<string, unknown>[]) {
    if (!isOneOf(INTAKE_PATHS, row.form) || !Array.isArray(row.asks)) {
      throw new Error(`An Intake form arrived that names no form or no questions: ${JSON.stringify(row.form)}`)
    }
    asked.set(row.form, row.asks)
  }
  const removedFrom = (name: IntakePath): readonly BuiltInQuestion[] => {
    const asks = asked.get(name)
    if (!asks) return []
    return questionsOf(presetForm(name)).flatMap((question) =>
      isBuiltInQuestion(question.key) && !asks.includes(question.key) ? [question.key] : [],
    )
  }
  return { discipleship: removedFrom('discipleship'), [GROUP_PATH]: removedFrom(GROUP_PATH) } as Record<
    IntakePath,
    readonly BuiltInQuestion[]
  >
}

/**
 * Somebody's answers to the Ministry's own questions (Pastor feedback, ticket
 * 12), off a document's `own_answers` rows, each under its question as `forms`
 * word it now.
 */
export const ownAnswersFrom = (forms: readonly IntakeForm[], value: unknown): readonly OwnAnswerShown[] =>
  ownAnswersShown(
    forms,
    (Array.isArray(value) ? (value as Record<string, unknown>[]) : []).flatMap((row) =>
      typeof row.key === 'string' ? [{ key: row.key, value: row.answer }] : [],
    ),
  )
