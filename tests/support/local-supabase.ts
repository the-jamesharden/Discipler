import { execFileSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import pg from 'pg'
import { ministryId, type MinistryId } from '~/domain/ids'
import type { AgeBand, AvailabilitySlot, Gender } from '~/domain/intake'
import { provisionMinistry } from '~/platform/supabase/provisioning'

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

/**
 * Puts the local stack's keys where the product's own adapters look for them.
 *
 * They read the environment the way the running app does, and the test runner is
 * not the app -- so a fixture that drives a real adapter has to furnish the
 * environment first. Discovered rather than chosen, for the reason `localSupabase`
 * gives: keys a test picked for itself would prove an adapter agrees with the test
 * and nothing else. `??=` so an environment that already says -- CI, or a developer
 * pointing the suite somewhere -- is not overwritten.
 *
 * Called out loud rather than done quietly inside `localSupabase`, because a getter
 * that reshapes the process is a getter nobody expects. `createMinistryWithAdmin`
 * calls it, which is how every suite that reaches a product adapter gets it: they
 * all ask for a Ministry first.
 */
export const publishSupabaseCredentials = (): void => {
  const { apiUrl, anonKey, serviceRoleKey, databaseUrl } = localSupabase()
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= apiUrl
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= anonKey
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= serviceRoleKey
  // The connection, not only the API keys: provisioning writes its three rows in a
  // transaction, which no HTTP client can hold open.
  process.env.DATABASE_URL ??= databaseUrl
}

/** Bypasses row-level security. For seeding fixtures only -- never for assertions. */
export const serviceRoleClient = (): SupabaseClient => {
  const { apiUrl, serviceRoleKey } = localSupabase()
  return createClient(apiUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/**
 * As much of a Ministry as most seeding needs: which one. Narrower than the
 * fixture on purpose, so the helpers that only put a row somewhere can be reached
 * by a caller holding nothing but a provisioned id -- `scripts/seed-demo.ts` runs
 * the real provisioning and then adds a Person, and should not have to build a
 * whole fixture to do the second half.
 */
export interface MinistryRef {
  readonly id: MinistryId
}

export interface MinistryFixture extends MinistryRef {
  readonly name: string
  /** The Admin's own name, which is also their row on their Ministry's Roster. */
  readonly adminName: string
  /**
   * The credential. A phone number and a password, for every user including
   * Admins -- see docs/adr/0008-the-phone-number-is-the-sign-in-credential.md.
   * There is no email here because provisioning creates none.
   */
  readonly adminPhone: string
  readonly adminPassword: string
  readonly adminUserId: string
  /**
   * The Admin is a Person in their own Ministry, like everybody else, and this is
   * that row. It is what makes the dual-role case reachable: an Admin who is later
   * invited to lead is found here by Acceptance rather than given a second account.
   * See `docs/adr/0009-one-account-per-human.md`.
   */
  readonly adminPersonId: string
  /** The number this Ministry sends as. Unique per fixture, so a test asserting
   *  on the sender is asserting on *this* Ministry's identity and not on a
   *  constant every Ministry would satisfy. */
  readonly sendingNumber: string
}

/**
 * A number no two fixtures share, within a run or across them. E.164 with a US
 * country code, because that is what `asPhoneNumber` produces from a ten-digit
 * spreadsheet column and the sign-in form reads a typed number through the same
 * function.
 *
 * The block is picked at random once per process and walked from there. It used to
 * be `Date.now() % 10_000_000`, which wraps every few hours -- and `auth.users`
 * holds a number for the life of the local stack, so two runs either side of a wrap
 * collided and the second was refused for a number nobody could see. Random start,
 * sequential after, makes that unlikely rather than periodic. It is not a guarantee;
 * the guarantee is `npm run db:reset`.
 */
let nextNumber = Math.floor(Math.random() * 10_000_000)
export const aTestPhoneNumber = () => `+1555${String(nextNumber++ % 10_000_000).padStart(7, '0')}`

/**
 * A Ministry and its Admin, through the product's own provisioning path rather
 * than beside it. The Admin gets a phone identity with no email and a Person row
 * linked to it, because that is what provisioning does -- so every suite built on
 * this fixture is asserting against a state the product can actually reach.
 */
export const createMinistryWithAdmin = async (
  name: string,
  // Named only where a test says something about the Admin as a human -- the
  // dual-role suites, which need to read his name on a page. Everywhere else the
  // Admin is furniture and a derived name says so.
  adminName: string = `Admin of ${name}`,
): Promise<MinistryFixture> => {
  // Before provisioning, so the keys the adapter needs are in the environment by
  // the time it looks for them.
  publishSupabaseCredentials()

  const adminPassword = 'correct-horse-battery-staple'
  const sendingNumber = aTestPhoneNumber()

  const provisioned = await provisionMinistry({
    name,
    sendingNumber,
    admin: { fullName: adminName, phone: aTestPhoneNumber(), password: adminPassword },
  })

  return {
    id: ministryId(provisioned.ministryId),
    name,
    adminName,
    // As provisioning stored it, not as the fixture typed it. They agree today
    // because the fixture types E.164, and a fixture that reported its own input
    // would keep agreeing after they stopped agreeing.
    adminPhone: provisioned.adminPhone,
    adminPassword,
    adminUserId: provisioned.adminUserId,
    adminPersonId: provisioned.adminPersonId,
    sendingNumber,
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
  ministry: MinistryRef,
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
  ministry: MinistryRef,
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

/**
 * A client carrying a real signed-in session, so reads are policed by RLS.
 *
 * By phone number, which is the only credential the product has -- a fixture
 * signing in by email would be proving authorisation against a door
 * `app/auth/sign-in` does not open.
 */
export const signInAs = async (ministry: MinistryFixture): Promise<SupabaseClient> =>
  signedInWith(ministry.adminPhone, ministry.adminPassword)

const signedInWith = async (phone: string, password: string): Promise<SupabaseClient> => {
  const { apiUrl, anonKey } = localSupabase()
  const client = createClient(apiUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { error } = await client.auth.signInWithPassword({ phone, password })
  if (error) throw new Error(`Could not sign in as ${phone}: ${error.message}`)

  return client
}

export interface AccountFixture {
  readonly personId: string
  readonly userId: string
  /** What they sign in with, and the number on their Person record: one fact. */
  readonly phone: string
  readonly password: string
  readonly fullName: string
}

/**
 * The Admin as a Person: the dual-role human, reached the way the product makes
 * them rather than hand-linked through the service role. Every suite that needs one
 * asks for it here, so the shape of "an Admin who also leads" is written once.
 *
 * Intake is deliberately not part of it. It is the Person's own act and carries
 * their consent, so a suite that needs the Admin pairable completes it itself --
 * exactly as it would for anybody else.
 */
export const adminAsPerson = (ministry: MinistryFixture): AccountFixture => ({
  personId: ministry.adminPersonId,
  userId: ministry.adminUserId,
  phone: ministry.adminPhone,
  password: ministry.adminPassword,
  fullName: ministry.adminName,
})

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
  const phone = options.phone ?? aTestPhoneNumber()

  // A phone identity and no email, which is what Acceptance mints. The fixture
  // stands in for a Leader who has already accepted, so an account shaped any other
  // way would be a state the product cannot produce.
  const { data: user, error: userError } = await admin.auth.admin.createUser({
    phone,
    password: ACCOUNT_PASSWORD,
    phone_confirm: true,
  })
  if (userError) throw new Error(`Could not create an account for ${fullName}: ${userError.message}`)

  const { error: memberError } = await admin
    .from('ministry_member')
    .insert({ ministry_id: ministry.id, user_id: user.user.id, tier })
  if (memberError) throw new Error(`Could not enrol ${fullName}: ${memberError.message}`)

  // The same number on both. Acceptance mints the account from the number on the
  // Person record and never from one somebody typed, so a fixture where the two
  // differ is a state the product cannot produce.
  const { data: person, error: personError } = await admin
    .from('person')
    .insert({ ministry_id: ministry.id, full_name: fullName, phone, user_id: user.user.id })
    .select('id')
    .single()
  if (personError) throw new Error(`Could not add ${fullName} to the Roster: ${personError.message}`)

  // `options.answers` reaches Intake here exactly as it does in `addPerson`. It was
  // dropped on the floor until ticket 15 needed a Leader with availability of their
  // own, and a fixture that silently ignores what it was handed is worse than one
  // that does not take it: every caller reads as though it worked.
  if (options.intake !== false) {
    await completeIntake(
      ministry,
      person.id,
      ['sms', 'contact_sharing'],
      'pastor_link',
      options.answers ?? {},
    )
  }

  return {
    personId: person.id,
    userId: user.user.id,
    phone,
    password: ACCOUNT_PASSWORD,
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

/**
 * One Material period, opened through the one function that opens one. A pair of
 * hand-written rows would pass the deferred constraint trigger just as well and
 * would say nothing about whether the write path keeps the invariant -- so a
 * fixture that wanted a relationship working through something goes the way the
 * command goes.
 */
export const assignMaterial = async (
  relationshipId: string,
  materialId: string,
  assignedBy: string,
  at: Date = new Date(),
): Promise<void> => {
  const client = new pg.Client({ connectionString: localSupabase().databaseUrl })
  await client.connect()
  try {
    const { rows } = await client.query<{ assign_material: string | null }>(
      `select app.assign_material($1::uuid, $2::uuid, $3::timestamptz, $4::uuid)`,
      [relationshipId, materialId, at.toISOString(), assignedBy],
    )
    const refusal = rows[0]?.assign_material
    if (refusal) throw new Error(`Could not assign the Material: ${refusal}`)
  } finally {
    await client.end()
  }
}

/**
 * A Pause standing on a relationship, written as `relationship.pause` writes one:
 * an event, because a Pause is two of them and what stands is the later.
 */
export const pauseRelationship = async (
  ministry: MinistryFixture,
  relationshipId: string,
  periodWeeks: 1 | 2 | 4 | 8 | 12 = 2,
  pausedAt: Date = new Date(),
): Promise<void> => {
  const { error } = await serviceRoleClient()
    .from('ministry_event')
    .insert({
      ministry_id: ministry.id,
      occurred_at: pausedAt.toISOString(),
      type: 'relationship.paused',
      subject_type: 'relationship',
      subject_id: relationshipId,
      payload: { periodWeeks },
    })
  if (error) throw new Error(`Could not pause the relationship: ${error.message}`)
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
export const signInWith = async (account: AccountFixture): Promise<SupabaseClient> =>
  signedInWith(account.phone, account.password)
