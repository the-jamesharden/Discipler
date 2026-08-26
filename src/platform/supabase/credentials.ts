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
