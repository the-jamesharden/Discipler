/**
 * Every page function answers on a deployment, checked by whoever just pushed.
 *
 * A page function names its callees at runtime, so `supabase db push` succeeds
 * against a migration that broke one, and the page fails at the first click
 * (`docs/adr/0023-a-page-is-one-read.md`). This is the same loop the test suite
 * runs after every `db reset` (`src/platform/supabase/every-page-function-answers.ts`),
 * pointed at a deployment: it signs in as the Admin named in the environment,
 * executes every page function once as them inside a transaction it rolls back,
 * asserts each answers `admin`, asserts none is executable by `anon`, then makes
 * one call through the API to prove its schema cache has seen them.
 *
 * Run it after `supabase db push` and before the merge, so a failure is fixed or
 * reverted while nothing new has shipped. After the merge it is a faster pager,
 * not a gate.
 *
 *   DATABASE_URL=... NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *   SMOKE_ADMIN_PHONE=+1... SMOKE_ADMIN_PASSWORD=... \
 *     npm run smoke:pages
 *
 * The Admin is one of the test Ministry's, never a church's. The session it
 * opens is ended when the script is done, whether it passed or not.
 */

const phone = process.env.SMOKE_ADMIN_PHONE
const password = process.env.SMOKE_ADMIN_PASSWORD

if (!phone || !password) {
  console.error('SMOKE_ADMIN_PHONE and SMOKE_ADMIN_PASSWORD name the test Ministry Admin to sign in as')
  process.exit(2)
}

// Loaded only now, so a bare invocation is refused before any credential is read.
const [{ createClient }, { smokeThePages }, { commandDatabaseUrl, supabaseCredentials }] =
  await Promise.all([
    import('@supabase/supabase-js'),
    import('../src/platform/supabase/every-page-function-answers'),
    import('../src/platform/supabase/credentials'),
  ])

const { url, anonKey } = supabaseCredentials()
const client = createClient(url, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { error } = await client.auth.signInWithPassword({ phone, password })
if (error) {
  console.error(`Could not sign in as ${phone}: ${error.message}`)
  process.exit(1)
}

try {
  const { checked, ministryName } = await smokeThePages(commandDatabaseUrl(), client)
  console.log(
    `${checked.length} page functions answered as an Admin of ${ministryName}; the API sees them.`,
  )
  console.log(checked.join('\n'))
} catch (failure) {
  console.error(`The pages do not answer: ${(failure as Error).message}`)
  process.exitCode = 1
} finally {
  await client.auth.signOut({ scope: 'local' })
}

export {}
