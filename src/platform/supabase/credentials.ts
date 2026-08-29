export interface SupabaseCredentials {
  readonly url: string
  readonly anonKey: string
}

const required = (name: string): string => {
  const value = process.env[name]
  if (!value) {
    throw new Error(
      `${name} is not set. Run \`npm run db:start\` and copy the keys it prints into .env.local.`,
    )
  }
  return value
}

export const supabaseCredentials = (): SupabaseCredentials => ({
  url: required('NEXT_PUBLIC_SUPABASE_URL'),
  anonKey: required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
})

export const commandDatabaseUrl = (): string => required('DATABASE_URL')

/**
 * Where the links Discipler texts point. It has to be absolute and it has to be
 * right: an Invitation Link is read off a phone with no browser history behind it,
 * so there is no relative path that could work and no wrong host that fails safe.
 */
export const appBaseUrl = (): string => required('NEXT_PUBLIC_APP_URL')
