
/**
 * A real Ministry and its first Admin, made by whoever runs Discipler.
 *
 * There is no sign-up surface and there is not meant to be one: a Ministry comes
 * into existence when an operator says so, and this is how they say so. It is the
 * production counterpart of `seed-demo.ts`, which mints fake numbers for a local
 * stack; this one takes the real ones and refuses to invent anything.
 *
 * It reads the same environment the running app reads and nothing else -- the
 * Supabase URL, the service role key and the command connection string -- so it is
 * pointed at a database by exporting those three for the one command, never by
 * editing a file.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... DATABASE_URL=... \
 *     npx vite-node -c vitest.config.ts scripts/provision-ministry.ts \
 *       "Anthem Church" "+15551234567" "Pat Rivera" "+15557654321"
 *
 * The password is asked for on the terminal with echo off, so it is typed by the
 * operator and appears in no shell history and no process list. Where there is no
 * terminal, `DISCIPLER_ADMIN_PASSWORD` in the environment is the only way to give it.
 */

const [ministryName, sendingNumber, adminName, adminPhone] = process.argv.slice(2)

if (!ministryName || !sendingNumber || !adminName || !adminPhone) {
  console.error(
    'Usage: provision-ministry.ts <ministry name> <sending number> <admin full name> <admin phone>',
  )
  process.exit(2)
}

/**
 * A line from the terminal with echo off: raw mode, so nothing is printed as it is
 * typed, and Ctrl+C still ends the process.
 *
 * A terminal only. When stdin is a pipe, the process under `vite-node` was observed
 * to end as soon as the pipe closed, before an asynchronous provisioning could
 * finish: the password was read and the work was cut off half done, with exit 0
 * and nothing printed. Rather than depend on why, a pipe is refused outright, and
 * anything driving this without a terminal sets `DISCIPLER_ADMIN_PASSWORD`.
 */
const askQuietly = (question: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const { stdin } = process

    if (!stdin.isTTY) {
      return reject(
        new Error(
          'No terminal to ask for the password on. Set DISCIPLER_ADMIN_PASSWORD when running '
            + 'this without one.',
        ),
      )
    }

    process.stderr.write(question)

    let typed = ''
    const finish = (outcome: () => void) => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.removeListener('data', onKey)
      process.stderr.write('\n')
      outcome()
    }
    // A chunk is one keystroke when somebody types and a whole line when they
    // paste, so the return is looked for inside the chunk rather than as the chunk.
    const onKey = (chunk: string) => {
      for (const key of chunk) {
        if (key === '\u0003') {
          return finish(() => reject(new Error('Interrupted; nothing was created.')))
        }
        if (key === '\r' || key === '\n') return finish(() => resolve(typed))
        if (key === '\u007f' || key === '\b') {
          typed = typed.slice(0, -1)
          continue
        }
        typed += key
      }
    }
    stdin.setRawMode(true)
    stdin.setEncoding('utf8')
    stdin.resume()
    stdin.on('data', onKey)
  })

const password =
  process.env.DISCIPLER_ADMIN_PASSWORD ?? (await askQuietly(`Password for ${adminName}: `))

if (!password) {
  console.error('No password given; nothing was created.')
  process.exit(2)
}

// Loaded only now, after the password has been read, so a mistyped invocation is
// refused before the platform modules and their credentials are touched at all.
const { provisionMinistry } = await import('../src/platform/supabase/provisioning')

const provisioned = await provisionMinistry({
  name: ministryName,
  sendingNumber,
  admin: { fullName: adminName, phone: adminPhone, password },
})

// Identifiers only. The password is the operator's, typed once, and printing it
// back would put it in a terminal scrollback that outlives this window.
console.log(
  JSON.stringify(
    {
      ministry: ministryName,
      ministryId: provisioned.ministryId,
      sendsFrom: provisioned.sendingNumber,
      admin: adminName,
      signsInWith: provisioned.adminPhone,
      adminPersonId: provisioned.adminPersonId,
    },
    null,
    2,
  ),
)
