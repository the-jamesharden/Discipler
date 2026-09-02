/**
 * A Ministry Setup Link, minted by whoever runs Discipler.
 *
 * There is no sign-up surface and there is not meant to be one: a Ministry comes
 * into existence when an operator says so, and this is how they say so. It prints
 * a link. The operator sends that link to the church's first Admin however they
 * like, the Admin opens it and types their own name and password, and that one
 * submit opens the Ministry -- so no password is ever typed on a terminal by
 * somebody it does not belong to.
 *
 * It reads the same environment the running app reads and nothing else -- the
 * command connection string, and the app's public URL for the link to point at --
 * so it is pointed at a deployment by exporting those for the one command, never
 * by editing a file.
 *
 *   DATABASE_URL=... NEXT_PUBLIC_APP_URL=https://... \
 *     npx vite-node -c vitest.config.ts scripts/setup-link.ts \
 *       "Anthem Church" "+15551234567" "+15557654321"
 *
 * The second argument is the number the Ministry sends from; the third is the
 * phone its Admin will sign in with. Minting again for the same Admin phone
 * replaces the link that is out there, which is the only way one is taken back.
 */

const [ministryName, sendingNumber, adminPhone] = process.argv.slice(2)

if (!ministryName || !sendingNumber || !adminPhone) {
  console.error('Usage: setup-link.ts <ministry name> <sending number> <admin phone>')
  process.exit(2)
}

// Loaded only now, so a mistyped invocation is refused before the platform
// modules and their credentials are touched at all.
const [{ createSupabaseMinistrySetup }, { appBaseUrl, commandDatabaseUrl }] = await Promise.all([
  import('../src/platform/supabase/ministry-setup'),
  import('../src/platform/supabase/credentials'),
])

const setup = createSupabaseMinistrySetup(commandDatabaseUrl())

try {
  const link = await setup.issue({ ministryName, sendingNumber, adminPhone })

  console.log(
    JSON.stringify(
      {
        ministry: link.ministryName,
        sendsFrom: link.sendingNumber,
        adminSignsInWith: link.adminPhone,
        link: `${appBaseUrl()}/setup/${link.token}`,
        expiresAt: link.expiresAt.toISOString(),
      },
      null,
      2,
    ),
  )
} finally {
  await setup.close()
}
