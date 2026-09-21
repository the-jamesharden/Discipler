/**
 * Fills an existing local Ministry with Materials + pairs so the Materials tab
 * looks like the v11 home-screen prototype. Development preview only.
 * Does not reset the database.
 */
import { ministryId } from '../src/domain/ids'
import {
  ACCOUNT_PASSWORD,
  addMaterial,
  addPerson,
  assignMaterial,
  createMinistryWithAdmin,
  pairOneToOne,
  publishSupabaseCredentials,
  serviceRoleClient,
  type MinistryFixture,
} from '../tests/support/local-supabase'

publishSupabaseCredentials()

const PAIR_NAMES: readonly (readonly [string, string, 'male' | 'female'])[] = [
  ['Grace Lee', 'Emily Davis', 'female'],
  ['Tyler Patel', 'Bryce Odom', 'male'],
  ['Wesley Odom', 'Dominic Rivers', 'male'],
  ['James Bradley', 'Jonathan Doyle', 'male'],
  ['Zachary Tran', 'Preston Adeyemi', 'male'],
  ['Lauren Ibrahim', 'Adaeze Bailey', 'female'],
  ['Ethan Rivers', 'Simon Ferguson', 'male'],
  ['Grace Terrell', 'Abigail Hughes', 'female'],
  ['Leah Draper', 'Brianna Tran', 'female'],
  ['Marcus Harrington', 'Alex Tran', 'male'],
  ['David Chen', 'Tom Wilson', 'male'],
  ['Maria Garcia', 'Sarah Johnson', 'female'],
  ['Thomas Odom', 'Marcus Larkin', 'male'],
  ['Kendra Pham', 'Simone Whitaker', 'female'],
  ['Rylee Park', 'Esther Ellis', 'female'],
  ['Daniel Park', 'Jordan Bailey', 'male'],
  ['Camille Fitzgerald', 'Naomi Mabry', 'female'],
  ['Cole Alvarez', 'Marcus Boyd', 'male'],
  ['Sydney Yates', 'Maria Ellis', 'female'],
  ['Wesley Cho', 'Caleb Beckwith', 'male'],
  ['Adaeze Sullivan', 'Hannah Ferguson', 'female'],
  ['Jonathan Kowalski', 'Christian Bowman', 'male'],
  ['Bethany Davis', 'Faith Cho', 'female'],
  ['Zachary Bradley', 'Christian Harrington', 'male'],
  ['Julia Hutchins', 'Kayla Williams', 'female'],
  ['Alex Rivers', 'Alex Williams', 'male'],
  ['Kendra Whitaker', 'Lydia Whitfield', 'female'],
  ['Emily Hollis', 'Adaeze Doyle', 'female'],
  ['Corinne Johnson', 'Jessica Reyes', 'female'],
  ['Anna Sanders', 'Reagan Lombardi', 'female'],
]

const PROGRAMS = [
  'The Master Plan of Evangelism',
  'Wesley Discipleship',
  'Multiply',
  'Real-Life Discipleship',
  'Foundations Reading Plan',
  'Freshman Launch Track',
] as const

/** How many pairs share each program (→ folder tiles). Rest stay unassigned. */
const FOLDER_SIZES = [6, 7, 5, 4, 4, 5] as const

const loadExistingMinistry = async (): Promise<MinistryFixture | null> => {
  const admin = serviceRoleClient()
  const { data: row } = await admin.from('ministry').select('id, name').order('name').limit(1).maybeSingle()
  if (!row) return null

  const { data: member } = await admin
    .from('ministry_member')
    .select('user_id')
    .eq('ministry_id', row.id)
    .eq('tier', 'admin')
    .limit(1)
    .maybeSingle()
  if (!member) return null

  const { data: person } = await admin
    .from('person')
    .select('id, full_name, phone')
    .eq('ministry_id', row.id)
    .eq('user_id', member.user_id)
    .maybeSingle()
  if (!person?.phone) return null

  return {
    id: ministryId(row.id),
    name: row.name,
    adminName: person.full_name,
    adminPhone: person.phone,
    adminPassword: ACCOUNT_PASSWORD,
    adminUserId: member.user_id,
    adminPersonId: person.id,
    sendingNumber: person.phone,
  }
}

const main = async () => {
  const fixture = (await loadExistingMinistry()) ?? (await createMinistryWithAdmin('Materials Preview Chapel'))

  const materialIds: string[] = []
  for (const title of PROGRAMS) {
    materialIds.push(await addMaterial(fixture, title))
  }

  const formedAt = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  const pairs: string[] = []

  for (const [leaderName, participantName, gender] of PAIR_NAMES) {
    const leaderId = await addPerson(fixture, leaderName, { answers: { gender } })
    const participantId = await addPerson(fixture, participantName, { answers: { gender } })
    const relationshipId = await pairOneToOne(fixture, leaderId, participantId, {
      createdAt: formedAt,
      acceptedAt: formedAt,
    })
    pairs.push(relationshipId)
  }

  let offset = 0
  for (let i = 0; i < materialIds.length; i++) {
    const size = FOLDER_SIZES[i]!
    for (const relationshipId of pairs.slice(offset, offset + size)) {
      await assignMaterial(relationshipId, materialIds[i]!, fixture.adminUserId, formedAt)
    }
    offset += size
  }

  console.log(
    JSON.stringify(
      {
        ministry: fixture.name,
        signInPhone: fixture.adminPhone,
        signInPassword: ACCOUNT_PASSWORD,
        materials: PROGRAMS.length,
        pairs: pairs.length,
        note: 'Sign in, then open /materials',
      },
      null,
      2,
    ),
  )
}

await main()
