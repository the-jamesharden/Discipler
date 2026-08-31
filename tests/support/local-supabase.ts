import { execFileSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ministryId, type MinistryId } from '~/domain/ids'
import type { AgeBand, AvailabilitySlot, Gender } from '~/domain/intake'

export interface LocalSupabase {
  readonly apiUrl: string
  readonly anonKey: string
  readonly serviceRoleKey: string
  readonly databaseUrl: string
}

let cached: LocalSupabase | undefined

export const localSupabase = (): LocalSupabase => {
  if (cached) return cached

  let raw: string
  try {
    raw = execFileSync('supabase', ['status', '-o', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    throw new Error(
      'The local Supabase stack is not running. Start it with `npm run db:start`.\n' +
        String(error),
    )
  }

  const status = JSON.parse(raw) as Record<string, string>
  cached = {
    apiUrl: status.API_URL!,
    anonKey: status.ANON_KEY!,
    serviceRoleKey: status.SERVICE_ROLE_KEY!,
    databaseUrl: status.DB_URL!,
  }
  return cached
}

/** Bypasses row-level security. For seeding fixtures only -- never for assertions. */
export const serviceRoleClient = (): SupabaseClient => {
  const { apiUrl, serviceRoleKey } = localSupabase()
  return createClient(apiUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export interface MinistryFixture {
  readonly id: MinistryId
  readonly name: string
  readonly adminEmail: string
  readonly adminPassword: string
  readonly adminUserId: string
}

let uniqueSuffix = 0
const unique = () => `${Date.now()}-${uniqueSuffix++}`

export const createMinistryWithAdmin = async (name: string): Promise<MinistryFixture> => {
  const admin = serviceRoleClient()

  const { data: ministry, error: ministryError } = await admin
    .from('ministry')
    .insert({ name })
    .select('id')
    .single()
  if (ministryError) throw new Error(`Could not create Ministry: ${ministryError.message}`)

  const adminEmail = `admin-${unique()}@example.test`
  const adminPassword = 'correct-horse-battery-staple'

  const { data: user, error: userError } = await admin.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
  })
  if (userError) throw new Error(`Could not create Admin user: ${userError.message}`)

  const { error: memberError } = await admin
    .from('ministry_member')
    .insert({ ministry_id: ministry.id, user_id: user.user.id, tier: 'admin' })
  if (memberError) throw new Error(`Could not enrol Admin: ${memberError.message}`)

  return {
    id: ministryId(ministry.id),
    name,
    adminEmail,
    adminPassword,
    adminUserId: user.user.id,
  }
}

export type ConsentKind = 'sms' | 'contact_sharing'

/**
 * What the form captured, for the tests that care. Everything has a default,
 * because most tests want a Person who can be paired and only a few are about the
 * answers themselves.
 */
export interface IntakeAnswers {
  readonly ageBand?: AgeBand
  readonly gender?: Gender
  readonly goalId?: string | null
  readonly availability?: readonly AvailabilitySlot[]
}

/** The two ways a Person reaches the Intake form. There is no third. */
export type ConsentSource = 'pastor_link' | 'qr_code'

/**
 * The two facts Intake produces: a submission, and the consents that came with it.
 * A Person holding neither is on the Roster and nothing more -- they cannot be
 * paired, they cannot lead, and they receive nothing, which the database enforces.
 */
export const completeIntake = async (
  ministry: MinistryFixture,
  personId: string,
  consents: readonly ConsentKind[] = ['sms', 'contact_sharing'],
  source: ConsentSource = 'pastor_link',
  answers: IntakeAnswers = {},
): Promise<void> => {
  const admin = serviceRoleClient()
  const submittedAt = new Date().toISOString()

  // The Ministry's own list. A fixture that invented a goal id would be describing
  // a Ministry that cannot exist, since the option belongs to the congregation.
  const { data: goal } = await admin
    .from('discipleship_goal')
    .select('id')
    .eq('ministry_id', ministry.id)
    .order('position')
    .limit(1)
    .maybeSingle()

  const { data: submission, error } = await admin
    .from('intake_submission')
    .insert({
      ministry_id: ministry.id,
      person_id: personId,
      submitted_at: submittedAt,
      age_band: answers.ageBand ?? '25-34',
      gender: answers.gender ?? 'female',
      discipleship_goal_id: answers.goalId ?? goal?.id ?? null,
    })
    .select('id')
    .single()
  if (error) throw new Error(`Could not record Intake: ${error.message}`)

  const availability = answers.availability ?? [{ day: 'monday', block: 'midday' }]
  if (availability.length > 0) {
    const { error: slotError } = await admin.from('intake_availability').insert(
      availability.map((slot) => ({
        ministry_id: ministry.id,
        intake_submission_id: submission.id,
        day: slot.day,
        block: slot.block,
      })),
    )
    if (slotError) throw new Error(`Could not record availability: ${slotError.message}`)
  }

  if (consents.length === 0) return

  const { error: consentError } = await admin.from('consent_record').insert(
    consents.map((consent) => ({
      ministry_id: ministry.id,
      person_id: personId,
      consent,
      granted: true,
      version: '2026-09-v1',
      source,
      decided_at: submittedAt,
    })),
  )
  if (consentError) throw new Error(`Could not record consent: ${consentError.message}`)
}

/**
 * A later decision on one consent. Separate from `completeIntake` because that helper
 * models a first submission, where every consent listed was granted; this models a
 * Person changing their mind, which is a new record and never an edit to the old one.
 */
export const recordConsentDecision = async (
  ministry: MinistryFixture,
  personId: string,
  consent: ConsentKind,
  granted: boolean,
  decidedAt: Date = new Date(),
): Promise<void> => {
  const { error } = await serviceRoleClient().from('consent_record').insert({
    ministry_id: ministry.id,
    person_id: personId,
    consent,
    granted,
    version: '2026-09-v1',
    source: 'pastor_link',
    decided_at: decidedAt.toISOString(),
  })
  if (error) throw new Error(`Could not record the consent decision: ${error.message}`)
}

export const optOut = async (ministry: MinistryFixture, personId: string): Promise<void> => {
  const { error } = await serviceRoleClient()
    .from('person_opt_out')
    .insert({
      ministry_id: ministry.id,
      person_id: personId,
      started_at: new Date().toISOString(),
    })
  if (error) throw new Error(`Could not record the opt-out: ${error.message}`)
}

export interface PersonOptions {
  /**
   * Defaults to true. Most tests want somebody who can be paired, and a fixture
   * that leaves Intake out by accident fails at the pairing rather than saying why.
   */
  readonly intake?: boolean
  readonly phone?: string
  /**
   * What this Person answered on the form. Only the tests about gender and age band
   * pass it; everyone else takes the defaults `completeIntake` supplies, which is
   * why adding a gender constraint does not rewrite every other fixture.
   */
  readonly answers?: IntakeAnswers
}

export const addPerson = async (
  ministry: MinistryFixture,
  fullName: string,
  options: PersonOptions = {},
): Promise<string> => {
  const { data, error } = await serviceRoleClient()
    .from('person')
    .insert({ ministry_id: ministry.id, full_name: fullName, phone: options.phone ?? null })
    .select('id')
    .single()
  if (error) throw new Error(`Could not add ${fullName} to the Roster: ${error.message}`)

  if (options.intake !== false) {
    await completeIntake(ministry, data.id, ['sms', 'contact_sharing'], 'pastor_link', options.answers ?? {})
  }

  return data.id
}

/** A client carrying a real signed-in session, so reads are policed by RLS. */
export const signInAs = async (ministry: MinistryFixture): Promise<SupabaseClient> => {
  const { apiUrl, anonKey } = localSupabase()
  const client = createClient(apiUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await client.auth.signInWithPassword({
    email: ministry.adminEmail,
    password: ministry.adminPassword,
  })
  if (error) throw new Error(`Could not sign in as ${ministry.adminEmail}: ${error.message}`)

  return client
}

export interface AccountFixture {
  readonly personId: string
  readonly userId: string
  readonly email: string
  readonly password: string
  readonly fullName: string
}

const ACCOUNT_PASSWORD = 'correct-horse-battery-staple'

/**
 * A human with a Person row and a login. `tier` is an access level and says nothing
 * about who leads a relationship -- an Admin who leads holds one row and it says
 * `admin`, because unique (ministry_id, user_id) permits no second one.
 */
export const addPersonWithAccount = async (
  ministry: MinistryFixture,
  fullName: string,
  tier: 'admin' | 'leader',
  options: PersonOptions = {},
): Promise<AccountFixture> => {
  const admin = serviceRoleClient()
  const email = `person-${unique()}@example.test`

  const { data: user, error: userError } = await admin.auth.admin.createUser({
    email,
    password: ACCOUNT_PASSWORD,
    email_confirm: true,
  })
  if (userError) throw new Error(`Could not create an account for ${fullName}: ${userError.message}`)

  const { error: memberError } = await admin
    .from('ministry_member')
    .insert({ ministry_id: ministry.id, user_id: user.user.id, tier })
  if (memberError) throw new Error(`Could not enrol ${fullName}: ${memberError.message}`)

  const { data: person, error: personError } = await admin
    .from('person')
    .insert({ ministry_id: ministry.id, full_name: fullName, user_id: user.user.id })
    .select('id')
    .single()
  if (personError) throw new Error(`Could not add ${fullName} to the Roster: ${personError.message}`)

  if (options.intake !== false) await completeIntake(ministry, person.id)

  return { personId: person.id, userId: user.user.id, email, password: ACCOUNT_PASSWORD, fullName }
}

/** Gives the Ministry's existing Admin a Person row, so they can lead and be discipled. */
export const addPersonForAdmin = async (
  ministry: MinistryFixture,
  fullName: string,
  options: PersonOptions = {},
): Promise<AccountFixture> => {
  const { data, error } = await serviceRoleClient()
    .from('person')
    .insert({ ministry_id: ministry.id, full_name: fullName, user_id: ministry.adminUserId })
    .select('id')
    .single()
  if (error) throw new Error(`Could not add ${fullName} to the Roster: ${error.message}`)

  if (options.intake !== false) {
    await completeIntake(ministry, data.id, ['sms', 'contact_sharing'], 'pastor_link', options.answers ?? {})
  }

  return {
    personId: data.id,
    userId: ministry.adminUserId,
    email: ministry.adminEmail,
    password: ministry.adminPassword,
    fullName,
  }
}

export interface RelationshipOptions {
  /**
   * When the relationship was formed. It is the order a Leader is asked about
   * their relationships in, so a check-in test has to be able to say.
   */
  createdAt?: Date
  /** Null leaves it Awaiting Leader Acceptance, which sends no check-ins. */
  acceptedAt?: Date | null
}

export const createRelationship = async (
  ministry: MinistryFixture,
  kind: 'one_to_one' | 'group',
  options: RelationshipOptions = {},
): Promise<string> => {
  const acceptedAt = options.acceptedAt === undefined ? new Date() : options.acceptedAt
  const { data, error } = await serviceRoleClient()
    .from('relationship')
    .insert({
      ministry_id: ministry.id,
      kind,
      accepted_at: acceptedAt?.toISOString() ?? null,
      ...(options.createdAt ? { created_at: options.createdAt.toISOString() } : {}),
    })
    .select('id')
    .single()
  if (error) throw new Error(`Could not create a ${kind} relationship: ${error.message}`)

  // Accepting a relationship opens its Material history, so a fixture that lands an
  // accepted relationship straight into the table has to open one too -- otherwise
  // every suite seeded this way holds relationships the real acceptance path could
  // never produce, and the first assignment against one is refused for a reason
  // nothing in production can reach.
  if (acceptedAt) await openMaterialHistory(ministry, data.id, acceptedAt)

  return data.id
}

/**
 * The period a relationship opens with: a real period, with no Material in it,
 * running from acceptance. In production `relationship.accept` writes this; here it
 * is written directly, because these fixtures seed accepted relationships without
 * going through the acceptance they came from -- exactly as they seed the
 * relationship and its memberships directly.
 *
 * The shape is not restated here in the sense that would matter. What makes a set of
 * periods legal is the constraint trigger on `material_assignment`, and it judges
 * this row like every other -- so a fixture that wrote the wrong thing would fail at
 * commit rather than quietly seeding a history the product could never produce.
 */
export const openMaterialHistory = async (
  ministry: MinistryFixture,
  relationshipId: string,
  acceptedAt: Date,
): Promise<void> => {
  const { error } = await serviceRoleClient()
    .from('material_assignment')
    .insert({
      ministry_id: ministry.id,
      relationship_id: relationshipId,
      material_id: null,
      started_at: acceptedAt.toISOString(),
    })
  if (error) throw new Error(`Could not open the Material history: ${error.message}`)
}

export interface MaterialOptions {
  /** Typed content. One of this and a PDF has to be present; both may be. */
  body?: string | null
  pdfPath?: string | null
  pdfFilename?: string | null
}

/** One Material on a Ministry's own list. */
export const addMaterial = async (
  ministry: MinistryFixture,
  title: string,
  options: MaterialOptions = {},
): Promise<string> => {
  const body =
    options.body === undefined && options.pdfPath === undefined
      ? `The text of ${title}.`
      : (options.body ?? null)

  const { data, error } = await serviceRoleClient()
    .from('material')
    .insert({
      ministry_id: ministry.id,
      title,
      body,
      pdf_path: options.pdfPath ?? null,
      pdf_filename: options.pdfFilename ?? null,
    })
    .select('id')
    .single()
  if (error) throw new Error(`Could not add the Material ${title}: ${error.message}`)
  return data.id
}

export const addMembership = async (args: {
  ministry: MinistryFixture
  relationshipId: string
  kind: 'one_to_one' | 'group'
  personId: string
  role: 'leader' | 'participant'
  startedAt?: Date
  endedAt?: Date
}): Promise<string> => {
  const { data, error } = await serviceRoleClient()
    .from('relationship_member')
    .insert({
      ministry_id: args.ministry.id,
      relationship_id: args.relationshipId,
      kind: args.kind,
      person_id: args.personId,
      role: args.role,
      started_at: (args.startedAt ?? new Date()).toISOString(),
      ended_at: args.endedAt?.toISOString() ?? null,
    })
    .select('id')
    .single()
  if (error) throw new Error(`Could not add the ${args.role} membership: ${error.message}`)
  return data.id
}

/**
 * A leader and one participant in a fresh one-to-one, which is the setup almost
 * every relationship test opens with. Written once so that a rule about who may be
 * a member -- readiness, the caps -- changes in one place rather than in each suite
 * that happened to spell the two inserts out.
 */
export const pairOneToOne = async (
  ministry: MinistryFixture,
  leaderId: string,
  participantId: string,
  options: { startedAt?: Date; endedAt?: Date } & RelationshipOptions = {},
): Promise<string> => {
  const relationshipId = await createRelationship(ministry, 'one_to_one', options)

  await addMembership({ ministry, relationshipId, kind: 'one_to_one', personId: leaderId, role: 'leader' })
  await addMembership({
    ministry,
    relationshipId,
    kind: 'one_to_one',
    personId: participantId,
    role: 'participant',
    ...(options.startedAt ? { startedAt: options.startedAt } : {}),
    ...(options.endedAt ? { endedAt: options.endedAt } : {}),
  })

  return relationshipId
}

/** A client carrying a real signed-in session for any account, not just the Admin. */
export const signInWith = async (account: AccountFixture): Promise<SupabaseClient> => {
  const { apiUrl, anonKey } = localSupabase()
  const client = createClient(apiUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  })
  if (error) throw new Error(`Could not sign in as ${account.email}: ${error.message}`)

  return client
}
