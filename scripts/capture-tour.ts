/**
 * Regenerates the tour's pages (Exponential launch, ticket 27), so a changed screen is
 * recaptured rather than redrawn: `app/overview/tour/pages.generated.ts`, and the modal's
 * crop of Overview at `public/tour/overview.png`.
 *
 * It makes an "Example Ministry" on the local stack through the product's own commands, on
 * a test clock that runs from five weeks ago to now, signs in as its Admin, and fetches
 * the real pages from a running server, as a person's browser would. Only what the server
 * drew is kept. So the tour is real screens, none of it is anybody's church, and it needs
 * no database to serve.
 *
 * With this checkout built and served, and the shared environment's lock held
 * (`docs/agents/test-environment.md`):
 *
 *   APP_URL=http://127.0.0.1:<port> npm run tour:capture
 *
 * Local only: it refuses a production address, and every phone on it is one of the test
 * numbers. It adds another Example Ministry each time it is run, which a reset removes.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import pg from 'pg'
import { createTestClock } from '../src/domain/clock'
import { DISCIPLERS_CHECK_IN_WORDS } from '../src/domain/check-in-words'
import { personId, type IdSource, type PersonId } from '../src/domain/ids'
import { shortName } from '../src/domain/short-name'
import { checkInThankYou, meetingQuestion, ministryGroupsJoinQrLink, ministryJoinQrLink, satisfactionQuestion } from '../src/domain/outbound-copy'
import { reachesProductionSupabase } from '../src/platform/deployment'
import { renderQrSquare } from '../src/platform/qr/qr-code'
import { createPostgresEffectStore } from '../src/platform/supabase/effect-store'
import { createCommandService } from '../src/service/command-service'
import { baseUrl, getPage, signIn } from '../tests/support/app'
import {
  aTestPhoneNumber,
  addPerson,
  completeIntake,
  createMinistryWithAdmin,
  createRelationship,
  addMembership,
  localSupabase,
  pairOneToOne,
  pauseRelationship,
  publishSupabaseCredentials,
  type MinistryFixture,
} from '../tests/support/local-supabase'
import { CHROME_PATH_DEFAULT, EXAMPLE_LINK_HOST, EXAMPLE_SHORT_NAME, cleanCapture, tourPageOf, withQrSquares } from './capture-tour-clean'

publishSupabaseCredentials()

for (const name of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL']) {
  if (reachesProductionSupabase(process.env[name] ?? '')) {
    console.error(`Refused: ${name} points at production. The tour is captured from the local stack.`)
    process.exit(2)
  }
}

const OUT = new URL('../', import.meta.url)
const HOUR = 3_600_000
const DAY = 24 * HOUR
const WEEK = 7 * DAY

/** The last Monday at 9am UTC to have passed: the church's check-in, in the fixture's zone. */
const lastCheckIn = (now: Date): Date => {
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 9))
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7))
  if (monday > now) monday.setUTCDate(monday.getUTCDate() - 7)
  return monday
}

const now = new Date()
const thisWeek = lastCheckIn(now)
const weekAt = (weeksAgo: number) => new Date(thisWeek.getTime() - weeksAgo * WEEK)
const FORMED = weekAt(5)
const WEEKS = 4

const ministry: MinistryFixture = await createMinistryWithAdmin('Example Ministry', 'Alex Carter')
const store = createPostgresEffectStore(localSupabase().databaseUrl)
const ids: IdSource = { next: () => crypto.randomUUID() }
const clock = createTestClock(FORMED)
const service = createCommandService({ clock, ids, store, appBaseUrl: baseUrl })
const texted = (person: PersonId, body: string) =>
  service.execute({ type: 'sms.inbound', ministryId: ministry.id, personId: person, body })

const someone = async (fullName: string, gender: 'female' | 'male'): Promise<PersonId> =>
  personId(await addPerson(ministry, fullName, { phone: aTestPhoneNumber(), answers: { gender } }))

const pair = async (leader: PersonId, participant: PersonId, joinedAt: Date = FORMED) =>
  pairOneToOne(ministry, leader, participant, { createdAt: joinedAt, joinedAt, acceptedAt: joinedAt })

/** What answering Mentor or Mentee on the Intake form records, so the Pair pop-up opens on it. */
const declares = async (person: PersonId, side: 'mentor' | 'mentee') => {
  const db = new pg.Client({ connectionString: localSupabase().databaseUrl })
  await db.connect()
  await db.query(
    `insert into consent_record
       (ministry_id, person_id, consent, granted, version, source, decided_at, intake_path, declared_side)
     values ($1, $2, 'sms', true, '2026-09-v1', 'pastor_link', now(), 'discipleship', $3)`,
    [ministry.id, person, side],
  )
  await db.end()
}

// The Admin's own row on the Roster, which would otherwise read Awaiting Intake.
await completeIntake(ministry, ministry.adminPersonId, ['sms', 'contact_sharing'], 'pastor_link', { gender: 'male' })

// Who the tour is about. Grace and Emily are the two it pairs, so they start unpaired, and
// Mark is the one whose answer it watches land, so he has not answered this week.
const grace = await someone('Grace Lee', 'female')
const emily = await someone('Emily Davis', 'female')
await declares(grace, 'mentor')
await declares(emily, 'mentee')
await someone('Naomi Ross', 'female')
await someone('Peter Shaw', 'male')

const lauren = await someone('Lauren Price', 'female')
const james = await someone('James Porter', 'male')
const rachel = await someone('Rachel Adams', 'female')
const sarah = await someone('Sarah Mitchell', 'female')
const mark = await someone('Mark Wilson', 'male')
const david = await someone('David Kim', 'male')
const will = await someone('Will Hayes', 'male')
const tom = await someone('Tom Baker', 'male')

await pair(lauren, await someone('Ava Nguyen', 'female'))
await pair(sarah, await someone('Hannah Brooks', 'female'))
await pair(david, await someone('Sam Ortiz', 'male'))
const paused = await pair(tom, await someone('Luke Grant', 'male'))

// The rest joined one a week, so the growth chart climbs as a church at work's would.
const eli = await someone('Eli Ramos', 'male')
const chloe = await someone('Chloe Park', 'female')
const jordan = await someone('Jordan Ellis', 'male')
const owen = await someone('Owen Price', 'male')
const joining: ReadonlyMap<number, readonly [PersonId, PersonId]> = new Map([
  [4, [james, eli]],
  [3, [rachel, chloe]],
  [2, [mark, jordan]],
  [1, [will, owen]],
])
const paired = new Set<PersonId>([lauren, sarah, david, tom])

// Asked ten days ago and not answered yet: past the wait, so it is on Follow-Up.
const ben = await someone('Ben Carter', 'male')
const noah = await someone('Noah Fields', 'male')
const waiting = await createRelationship(ministry, 'one_to_one', {
  createdAt: new Date(now.getTime() - 10 * DAY),
  acceptedAt: null,
})
await addMembership({
  ministry,
  relationshipId: waiting,
  kind: 'one_to_one',
  personId: ben,
  role: 'leader',
  startedAt: new Date(now.getTime() - 10 * DAY),
})
await addMembership({
  ministry,
  relationshipId: waiting,
  kind: 'one_to_one',
  personId: noah,
  role: 'participant',
  startedAt: new Date(now.getTime() - 10 * DAY),
})

await pauseRelationship(ministry, paused, 8, weekAt(1))

/** One week's answers. Each is what that Leader texts back, one reply at a time. */
const answers = (weeksAgo: number): readonly (readonly [PersonId, readonly string[]])[] => [
  [lauren, ['1', 'A']],
  [james, ['1', 'B']],
  [rachel, weeksAgo === 0 ? ['1', 'A'] : ['1', 'B']],
  // The concern is this week's, and so is on Follow-Up.
  [sarah, weeksAgo === 0 ? ['1', 'D', 'She has had a hard month and asked for prayer.'] : ['1', 'B']],
  // This week's is the one the tour plays.
  [mark, weeksAgo === 0 ? [] : ['1', 'A']],
  // Three weeks of saying they did not meet, which is Stalled.
  [david, weeksAgo < 3 ? ['2'] : ['1', 'B']],
  [will, weeksAgo === 1 ? ['2'] : ['1', 'B']],
]

for (let weeksAgo = WEEKS; weeksAgo >= 0; weeksAgo--) {
  const joiner = joining.get(weeksAgo)
  if (joiner) {
    await pair(joiner[0], joiner[1], new Date(weekAt(weeksAgo).getTime() - DAY))
    paired.add(joiner[0])
  }
  clock.advanceTo(weekAt(weeksAgo))
  await service.execute({ type: 'scheduled.tick', ministryId: ministry.id })
  clock.advanceBy(HOUR)
  for (const [leader, replies] of answers(weeksAgo)) {
    if (!paired.has(leader)) continue
    for (const reply of replies) await texted(leader, reply)
  }
}

// Its Admin has been through onboarding, so the pages are not drawn behind the modal.
await service.execute({
  type: 'setup.mark_seen',
  ministryId: ministry.id,
  seenBy: ministry.adminUserId,
  steps: [],
  badge: false,
  onboarding: true,
})
await store.close()

// ---- The pages, as the server draws them ----

const { cookie } = await signIn(ministry)
const page = async (path: string): Promise<string> => {
  const { response, html } = await getPage(path, cookie)
  if (response.status !== 200) throw new Error(`${path} answered ${response.status}`)
  return html
}

const overview = await page('/overview')
const roster = await page('/roster')
const pairing = await page(`/roster?pair=${grace}`)
const checkIns = await page('/check-ins')
const followUp = await page('/follow-up')
const intake = await page('/intake-forms')

const church = {
  ministryName: 'Example Ministry',
  subject: 'Jordan Ellis',
  words: DISCIPLERS_CHECK_IN_WORDS,
}

// The tiles' squares scan to the live address, like the words beside them.
const squares = await Promise.all(
  [ministryJoinQrLink, ministryGroupsJoinQrLink].map((link) =>
    renderQrSquare(link(EXAMPLE_LINK_HOST, shortName(EXAMPLE_SHORT_NAME))),
  ),
)

const pages = tourPageOf({
  overview: cleanCapture(overview, ministry.shortName),
  roster: cleanCapture(roster, ministry.shortName),
  pairing: cleanCapture(pairing, ministry.shortName),
  checkIns: cleanCapture(checkIns, ministry.shortName),
  followUp: cleanCapture(followUp, ministry.shortName),
  intake: withQrSquares(cleanCapture(intake, ministry.shortName), squares),
})
const phone = [
  meetingQuestion({ ...church, discloseOptOut: false }),
  '1',
  satisfactionQuestion({ ...church, wording: 'a_to_d' }),
  'A',
  checkInThankYou(church),
]

writeFileSync(
  new URL('app/overview/tour/pages.generated.ts', OUT),
  `// Written by scripts/capture-tour.ts. Run it again rather than editing this.\n` +
    `export const TOUR_PAGES = ${JSON.stringify(pages)}\n\n` +
    `/** Mark Wilson's phone in the tour, from the composers that send these texts. */\n` +
    `export const TOUR_PHONE: readonly string[] = ${JSON.stringify(phone)}\n`,
)

// ---- The modal's crop of Overview ----

const chrome = process.env.CHROME_PATH ?? CHROME_PATH_DEFAULT
const scratch = mkdtempSync(join(tmpdir(), 'tour-crop-'))
const cropAt = join(scratch, 'crop.html')
const stylesheet = await (await fetch(`${baseUrl}/discipler.css`)).text()
writeFileSync(
  cropAt,
  `<!doctype html><meta charset="utf-8"><style>${stylesheet}</style><body style="margin:0;background:var(--bg)">` +
    `<div class="container" style="max-width:1100px">${pages.shell}${pages.overview}</div>`,
)
await new Promise<void>((done, failed) => {
  const shooting = spawn(
    chrome,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      `--user-data-dir=${join(scratch, 'profile')}`,
      '--force-device-scale-factor=0.6',
      '--window-size=1100,577',
      '--timeout=4000',
      `--screenshot=${new URL('public/tour/overview.png', OUT).pathname}`,
      pathToFileURL(cropAt).href,
    ],
    { stdio: 'ignore' },
  )
  // Headless Chrome often writes the file and then never exits.
  const stop = setTimeout(() => shooting.kill(), 20_000)
  shooting.on('exit', () => {
    clearTimeout(stop)
    done()
  })
  shooting.on('error', failed)
})
rmSync(scratch, { recursive: true, force: true })

console.log('Captured. Look at the tour before committing it.')
process.exit(0)
