/**
 * Makes a new local Ministry with Materials and one-to-ones so the Materials tab
 * shows every kind of tile it draws. Development preview only. Does not reset
 * the database, and makes a Ministry of its own each run, so it can be run
 * again and the sign-in it prints is always the one that works.
 */
import {
  addMaterial,
  addPerson,
  assignMaterial,
  createMinistryWithAdmin,
  pairOneToOne,
  publishSupabaseCredentials,
} from '../tests/support/local-supabase'

publishSupabaseCredentials()

const ONE_TO_ONES: readonly (readonly [string, string, 'male' | 'female'])[] = [
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

const TITLES = [
  'The Master Plan of Evangelism',
  'Wesley Discipleship',
  'Multiply',
  'Real-Life Discipleship',
  'Foundations Reading Plan',
  'Freshman Launch Track',
] as const

/**
 * How many relationships are on each Material: four folders, one relationship on
 * a Material of its own, and one Material nobody is on. The rest are on nothing,
 * so every kind of tile is on the page.
 */
const FOLDER_SIZES = [6, 7, 5, 4, 1, 0] as const

const main = async () => {
  const fixture = await createMinistryWithAdmin('Materials Preview Chapel')

  const materialIds: string[] = []
  for (const title of TITLES) {
    materialIds.push(await addMaterial(fixture, title))
  }

  const formedAt = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
  const relationships: string[] = []

  for (const [leaderName, participantName, gender] of ONE_TO_ONES) {
    const leaderId = await addPerson(fixture, leaderName, { answers: { gender } })
    const participantId = await addPerson(fixture, participantName, { answers: { gender } })
    const relationshipId = await pairOneToOne(fixture, leaderId, participantId, {
      createdAt: formedAt,
      acceptedAt: formedAt,
    })
    relationships.push(relationshipId)
  }

  let offset = 0
  for (let i = 0; i < materialIds.length; i++) {
    const size = FOLDER_SIZES[i]!
    for (const relationshipId of relationships.slice(offset, offset + size)) {
      await assignMaterial(relationshipId, materialIds[i]!, fixture.adminUserId, formedAt)
    }
    offset += size
  }

  console.log(
    JSON.stringify(
      {
        ministry: fixture.name,
        signInPhone: fixture.adminPhone,
        signInPassword: fixture.adminPassword,
        materials: TITLES.length,
        relationships: relationships.length,
        note: 'Sign in, then open /materials',
      },
      null,
      2,
    ),
  )
}

await main()
