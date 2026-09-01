import { createInterface } from 'node:readline'
import { Writable } from 'node:stream'
import { provisionMinistry } from '../src/platform/supabase/provisioning'

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
 * operator and appears in no shell history and no process list. `DISCIPLER_ADMIN_PASSWORD`
 * in the environment is honoured instead where a prompt is impossible.
 */

const [ministryName, sendingNumber, adminName, adminPhone] = process.argv.slice(2)

if (!ministryName || !sendingNumber || !adminName || !adminPhone) {
  console.error(
    'Usage: provision-ministry.ts <ministry name> <sending number> <admin full name> <admin phone>',
  )
  process.exit(2)
}

const askQuietly = (question: string): Promise<string> =>
  new Promise((resolve) => {
    // Everything readline would echo goes nowhere; the question itself is written
    // straight to the terminal so it still shows.
    const muted = new Writable({ write: (_chunk, _encoding, done) => done() })
    const prompt = createInterface({ input: process.stdin, output: muted, terminal: true })
    process.stderr.write(question)
    prompt.question('', (answer) => {
      prompt.close()
      process.stderr.write('\n')
      resolve(answer)
    })
  })

const password =
  process.env.DISCIPLER_ADMIN_PASSWORD ?? (await askQuietly(`Password for ${adminName}: `))

if (!password) {
  console.error('No password given; nothing was created.')
  process.exit(2)
}

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
