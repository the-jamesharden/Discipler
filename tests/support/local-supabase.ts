import { execFileSync } from 'node:child_process'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ministryId, type MinistryId } from '~/domain/ids'

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

export const addPerson = async (ministry: MinistryFixture, fullName: string): Promise<string> => {
  const { data, error } = await serviceRoleClient()
    .from('person')
    .insert({ ministry_id: ministry.id, full_name: fullName })
    .select('id')
    .single()
  if (error) throw new Error(`Could not add ${fullName} to the Roster: ${error.message}`)
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
