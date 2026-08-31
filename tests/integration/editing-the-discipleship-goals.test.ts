import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { GoalRefused } from '~/domain/errors'
import type { IdSource } from '~/domain/ids'
import { discipleshipGoalId } from '~/domain/intake'
import { createPostgresEffectStore } from '~/platform/supabase/effect-store'
import { createCommandService } from '~/service/command-service'
import {
  addPerson,
  createMinistryWithAdmin,
  completeIntake,
  localSupabase,
  signInAs,
  type MinistryFixture,
} from '../support/local-supabase'

/**
 * The list of Discipleship Goals is the Ministry's own. Ticket 03 seeded it; this
 * is an Admin changing it, against the real database, where the two facts that
 * matter are facts about rows.
 *
 * Renaming keeps the row, so it keeps every answer pointing at it. Removing
 * deletes the row, and `on delete set null` blanks those answers -- which is the
 * loss the Admin has to be warned about, and which nothing recovers. The one
 * removal that is refused outright is the last option, because a Ministry with no
 * options cannot serve the Intake form its own link opens.
 */

describe('a Ministry’s Discipleship Goal options', () => {
  let ministry: MinistryFixture
  let store: ReturnType<typeof createPostgresEffectStore>
  let pool: pg.Pool

  const at = new Date('2026-09-14T10:00:00Z')
  const ids: IdSource = { next: () => crypto.randomUUID() }
  const service = () =>
    createCommandService({
      clock: createTestClock(at),
      ids,
      store,
      appBaseUrl: 'https://discipler.test',
    })

  beforeAll(async () => {
    ministry = await createMinistryWithAdmin('Riverside Chapel')
    store = createPostgresEffectStore(localSupabase().databaseUrl)
    pool = new pg.Pool({ connectionString: localSupabase().databaseUrl })
  })

  afterAll(async () => {
    await store.close()
    await pool.end()
  })

  let numbered = 0
  const aNumber = () =>
    `+1${String((Date.now() % 1_000_000) * 1_000 + ++numbered).padStart(10, '0')}`

  /** The list as the Intake form reads it: wording, in the Ministry's own order. */
  const theList = async (of: MinistryFixture = ministry) => {
    const { rows } = await pool.query<{ label: string }>(
      `select label from discipleship_goal where ministry_id = $1 order by position`,
      [of.id],
    )
    return rows.map((row) => row.label)
  }

  const optionCalled = async (label: string, of: MinistryFixture = ministry) => {
    const { rows } = await pool.query<{ id: string }>(
      `select id from discipleship_goal where ministry_id = $1 and label = $2`,
      [of.id, label],
    )
    const id = rows[0]?.id
    if (!id) throw new Error(`This Ministry offers no option called ${label}`)
    return discipleshipGoalId(id)
  }

  const goalChosenBy = async (person: string) => {
    const { rows } = await pool.query<{ discipleship_goal_id: string | null }>(
      `select discipleship_goal_id from intake_submission
        where person_id = $1
        order by submitted_at desc, created_at desc, id desc
        limit 1`,
      [person],
    )
    return rows[0]?.discipleship_goal_id ?? null
  }

  it('starts with the seeded list, which an Admin can then add to', async () => {
    const before = await theList()
    expect(before).toContain('Growing in the basics of faith')

    await service().execute({
      type: 'goal.add',
      ministryId: ministry.id,
      label: 'Grief and loss',
    })

    // Last, where the Ministry can then move it. Their ordering is pastoral and
    // nothing alphabetises it on their behalf.
    expect(await theList()).toEqual([...before, 'Grief and loss'])
  })

  it('keeps every answer when an option is reworded, because it is the same option', async () => {
    const goal = await optionCalled('Career and calling')
    const person = await addPerson(ministry, 'Marcus Webb', {
      phone: aNumber(),
      answers: { goalId: goal },
    })

    await service().execute({
      type: 'goal.rename',
      ministryId: ministry.id,
      goalId: goal,
      label: 'Work and vocation',
    })

    // The same id, under new wording. A remove-and-add would have blanked him.
    expect(await goalChosenBy(person)).toBe(goal)
    expect(await theList()).toContain('Work and vocation')
    expect(await theList()).not.toContain('Career and calling')
  })

  it('renumbers the whole list when one option moves', async () => {
    const before = await theList()
    const last = await optionCalled(before[before.length - 1]!)

    await service().execute({
      type: 'goal.move',
      ministryId: ministry.id,
      goalId: last,
      direction: 'up',
    })

    const after = await theList()
    expect(after[after.length - 2]).toBe(before[before.length - 1])
    expect(after[after.length - 1]).toBe(before[before.length - 2])

    // Contiguous from one, whatever the positions had drifted to. The unique index
    // on (ministry_id, position) is deferrable, which is what lets a swap happen in
    // one statement rather than through a position nobody wanted.
    const { rows } = await pool.query<{ position: number }>(
      `select position from discipleship_goal where ministry_id = $1 order by position`,
      [ministry.id],
    )
    expect(rows.map((row) => row.position)).toEqual(rows.map((_, index) => index + 1))
  })

  it('loses the answers that pointed at a removed option, and keeps everything else', async () => {
    const goal = await optionCalled('Healing and recovery')
    const person = await addPerson(ministry, 'Nadia Farouk', {
      phone: aNumber(),
      answers: { goalId: goal, availability: [{ day: 'tuesday', block: 'evening' }] },
    })

    await service().execute({
      type: 'goal.remove',
      ministryId: ministry.id,
      goalId: goal,
    })

    // Her stated goal is gone and nothing recovers it.
    expect(await goalChosenBy(person)).toBeNull()

    // Her Intake and her availability are not. She stays pairable, ranked on
    // availability alone until she answers again.
    const { rows: slots } = await pool.query<{ count: string }>(
      `select count(*) from intake_availability a
         join intake_submission i on i.id = a.intake_submission_id
        where i.person_id = $1`,
      [person],
    )
    expect(Number(slots[0]!.count)).toBe(1)

    const { rows: status } = await pool.query<{ status: string }>(
      `select participation_status(p) as status from person p where p.id = $1`,
      [person],
    )
    expect(status[0]?.status).toBe('ready_to_pair')
  })

  it('writes what the removal cost into history, which is the only record left', async () => {
    const goal = await optionCalled('Leadership and serving')
    await addPerson(ministry, 'Omar Haddad', {
      phone: aNumber(),
      answers: { goalId: goal },
    })
    await addPerson(ministry, 'Priya Raman', {
      phone: aNumber(),
      answers: { goalId: goal },
    })

    await service().execute({ type: 'goal.remove', ministryId: ministry.id, goalId: goal })

    const { rows } = await pool.query<{
      payload: { label: string; answersLost: number }
    }>(
      `select payload from ministry_event
        where subject_id = $1 and type = 'discipleship_goal.removed'`,
      [goal],
    )
    expect(rows[0]?.payload).toEqual({ label: 'Leadership and serving', answersLost: 2 })
  })

  it('counts the people who chose an option, not the submissions that named it', async () => {
    const goal = await optionCalled('Grief and loss')
    const person = await addPerson(ministry, 'Ruth Adeyemi', {
      phone: aNumber(),
      answers: { goalId: goal },
    })
    // She corrected her answers and chose the same option again. Intake is
    // append-only, so that is two rows and one person.
    await completeIntake(ministry, person, ['sms'], 'pastor_link', { goalId: goal })

    // A second Person who chose it once, then changed their mind. Their older
    // submission still names it and their current answer does not, so they are not
    // among the people a removal would cost.
    const moved = await addPerson(ministry, 'Sam Doyle', {
      phone: aNumber(),
      answers: { goalId: goal },
    })
    await completeIntake(ministry, moved, ['sms'], 'pastor_link', {
      goalId: await optionCalled('Marriage and family'),
    })

    await service().execute({ type: 'goal.remove', ministryId: ministry.id, goalId: goal })

    const { rows } = await pool.query<{ payload: { answersLost: number } }>(
      `select payload from ministry_event
        where subject_id = $1 and type = 'discipleship_goal.removed'`,
      [goal],
    )
    expect(rows[0]?.payload.answersLost).toBe(1)
  })

  it('refuses to leave a Ministry with no options at all', async () => {
    const alone = await createMinistryWithAdmin('Northgate Fellowship')
    const options = await theList(alone)
    const last = options[options.length - 1]!

    // Down to one, which is permitted: the form still has something to offer.
    for (const label of options.slice(0, -1)) {
      await service().execute({
        type: 'goal.remove',
        ministryId: alone.id,
        goalId: await optionCalled(label, alone),
      })
    }
    expect(await theList(alone)).toEqual([last])

    await expect(
      service().execute({
        type: 'goal.remove',
        ministryId: alone.id,
        goalId: await optionCalled(last, alone),
      }),
    ).rejects.toThrow(new GoalRefused('goal.last_one'))

    expect(await theList(alone)).toEqual([last])
  })

  it('refuses the same thing written by SQL, because a pilot’s settings are', async () => {
    const alone = await createMinistryWithAdmin('Eastside Church')
    const options = await theList(alone)

    // The floor is the database's, not a screen's. Every option but one goes in a
    // single statement, which is permitted; the statement that would take them all
    // is refused.
    await pool.query(
      `delete from discipleship_goal where ministry_id = $1 and label <> $2`,
      [alone.id, options[0]!],
    )
    await expect(
      pool.query(`delete from discipleship_goal where ministry_id = $1`, [alone.id]),
    ).rejects.toThrow(/cannot be left with no Discipleship Goal/)

    expect(await theList(alone)).toEqual([options[0]!])
  })

  it('lets a Ministry be deleted with its options, which is not an edit', async () => {
    const closing = await createMinistryWithAdmin('Southbank Chapel')

    // The cascade takes the list with the form nobody will open again. A floor that
    // could not tell that from an edit would make a Ministry undeletable.
    await expect(
      pool.query(`delete from ministry where id = $1`, [closing.id]),
    ).resolves.toBeDefined()

    expect(await theList(closing)).toEqual([])
  })

  it('never lets one Ministry’s edit reach another’s list', async () => {
    const other = await createMinistryWithAdmin('Westhill Church')
    const theirs = await theList(other)
    const ours = await optionCalled('Marriage and family')

    // The connection declares which Ministry it acts for, and the policy refuses to
    // show it any other's rows -- so an option named across the boundary is not
    // *someone else's option*, it is no option at all.
    await expect(
      service().execute({
        type: 'goal.rename',
        ministryId: other.id,
        goalId: ours,
        label: 'Anything at all',
      }),
    ).rejects.toThrow(new GoalRefused('goal.not_found'))

    expect(await theList(other)).toEqual(theirs)
  })

  it('refuses wording this Ministry already offers, however it is capitalised', async () => {
    await expect(
      service().execute({
        type: 'goal.add',
        ministryId: ministry.id,
        label: 'marriage AND family',
      }),
    ).rejects.toThrow(new GoalRefused('goal.already_offered'))
  })

  it('lets two Ministries offer the same wording, because goals are never shared', async () => {
    const other = await createMinistryWithAdmin('Hillcrest Chapel')

    await service().execute({
      type: 'goal.add',
      ministryId: other.id,
      label: 'Grief and loss',
    })
    await service().execute({
      type: 'goal.add',
      ministryId: ministry.id,
      label: 'Grief and loss',
    })

    expect(await theList(other)).toContain('Grief and loss')
    expect(await theList()).toContain('Grief and loss')
  })

  it('tells the loser of a race the same thing the screen would have', async () => {
    // The boundary decides against the list it read, so two Admins acting in the
    // same second can both be told there is room for what they are doing. The
    // database is the one that finds out otherwise -- and what it raises has to
    // reach the second Admin as the sentence the first one saw, not as a 500.
    const racing = await createMinistryWithAdmin('Parkside Church')
    const offered = (await theList(racing))[0]!

    await expect(
      store.transact(racing.id, (unit) =>
        unit.addDiscipleshipGoal({
          id: discipleshipGoalId(crypto.randomUUID()),
          ministryId: racing.id,
          label: offered,
          position: 99,
          createdAt: at,
        }),
      ),
    ).rejects.toThrow(new GoalRefused('goal.already_offered'))

    // The same for the removal the boundary let through against a list of two that
    // somebody else has since cut to one.
    await pool.query(
      `delete from discipleship_goal where ministry_id = $1 and label <> $2`,
      [racing.id, offered],
    )

    const survivor = await optionCalled(offered, racing)

    await expect(
      store.transact(racing.id, (unit) =>
        unit.removeDiscipleshipGoal({
          ministryId: racing.id,
          goalId: survivor,
          label: offered,
          chosenBy: 0,
        }),
      ),
    ).rejects.toThrow(new GoalRefused('goal.last_one'))

    expect(await theList(racing)).toEqual([offered])
  })

  it('shows the list and its counts only to an Admin of that Ministry', async () => {
    const other = await createMinistryWithAdmin('Lakeview Church')
    const session = await signInAs(ministry)

    // Their own list comes back with the counts the warning is built from.
    const { data: own, error } = await session.rpc('discipleship_goal_options', {
      target_ministry_id: ministry.id,
    })
    expect(error).toBeNull()
    expect((own ?? []).length).toBeGreaterThan(0)

    // Another Ministry's does not. Asked about a congregation this Admin does not
    // administer, the function answers with nothing rather than with their list --
    // goals are never shared or compared across Ministries.
    const { data: theirs } = await session.rpc('discipleship_goal_options', {
      target_ministry_id: other.id,
    })
    expect(theirs ?? []).toEqual([])
  })
})
