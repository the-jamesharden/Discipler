import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestClock } from '~/domain/clock'
import { goalWording } from '~/domain/discipleship-goals'
import { GoalRefused, IntakeRefused } from '~/domain/errors'
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
 * loss the Admin has to be warned about, and which no query recovers afterwards.
 * What does survive it is the `discipleship_goal.removed` event, written from a
 * read taken before the delete in the same transaction: ADR-0014's bargain is that
 * the live surface loses the answer and the record does not. The one removal that
 * is refused outright is the last option, because a Ministry with no options
 * cannot serve the Intake form its own link opens.
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
      answers: { goalId: goal, availability: [{ day: 'tuesday', hour: '19' }] },
    })

    await service().execute({
      type: 'goal.remove',
      ministryId: ministry.id,
      goalId: goal,
    })

    // Her stated goal is off every live surface, and no query puts it back.
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
      payload: {
        label: string
        answersLost: number
        blankedAnswers: readonly { submissionId: string; personId: string }[]
      }
    }>(
      `select payload from ministry_event
        where subject_id = $1 and type = 'discipleship_goal.removed'`,
      [goal],
    )
    expect(rows[0]?.payload.label).toBe('Leadership and serving')
    expect(rows[0]?.payload.answersLost).toBe(2)
    // The rows themselves, and not only how many there were. The submissions are
    // blanked in the same transaction that writes this, so afterwards nothing in
    // the database can say these two people ever chose it -- except this.
    expect(rows[0]?.payload.blankedAnswers).toHaveLength(2)
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

    const { rows } = await pool.query<{
      payload: {
        answersLost: number
        blankedAnswers: readonly { submissionId: string; personId: string }[]
      }
    }>(
      `select payload from ministry_event
        where subject_id = $1 and type = 'discipleship_goal.removed'`,
      [goal],
    )

    // One person was warned about and three rows were blanked, which is the whole
    // difference between the two numbers: Ruth answered twice and Sam's older
    // answer still named it. The Admin decides about people; the record has to
    // list rows, because a row is what the delete actually took.
    expect(rows[0]?.payload.answersLost).toBe(1)
    expect(rows[0]?.payload.blankedAnswers).toHaveLength(3)
    expect(
      new Set(rows[0]?.payload.blankedAnswers.map((answer) => answer.personId)).size,
    ).toBe(2)
    expect(new Set(rows[0]?.payload.blankedAnswers.map((a) => a.personId))).toContain(
      moved,
    )
  })

  it('remembers who chose an option once the answers themselves are blanked', async () => {
    // The whole of ADR-0014's exemption, end to end. The submission loses its
    // pointer and there is no undo; what makes the loss recoverable is that the
    // rows were written into the event before the delete ran, so a Ministry can
    // still answer *who used to want this* from its own history alone.
    await service().execute({
      type: 'goal.add',
      ministryId: ministry.id,
      label: 'Prayer and fasting',
    })
    const goal = await optionCalled('Prayer and fasting')
    const person = await addPerson(ministry, 'Tomas Iglesias', {
      phone: aNumber(),
      answers: { goalId: goal },
    })

    await service().execute({ type: 'goal.remove', ministryId: ministry.id, goalId: goal })

    // Gone from the live surface: this is what the Admin was warned about, and it
    // is still true.
    expect(await goalChosenBy(person)).toBeNull()

    // And recoverable from history, which is what the warning does not have to say.
    const { rows: removed } = await pool.query<{
      payload: {
        label: string
        blankedAnswers: readonly { personId: string }[]
      }
    }>(
      `select payload from ministry_event
        where subject_id = $1 and type = 'discipleship_goal.removed'`,
      [goal],
    )
    expect(removed[0]?.payload.label).toBe('Prayer and fasting')
    expect(removed[0]?.payload.blankedAnswers.map((answer) => answer.personId)).toEqual([
      person,
    ])
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

    // As `service_role`, which is what a pilot script actually connects as -- not
    // as the owner, which bypasses everything and would prove only that the
    // function parses. The floor is the database's, not a screen's.
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query('set local role service_role')

      // Every option but one, in a single statement: permitted, because the form
      // still has something to offer.
      await client.query(
        `delete from discipleship_goal where ministry_id = $1 and label <> $2`,
        [alone.id, options[0]!],
      )

      // The statement that would take them all is refused on its last row.
      await expect(
        client.query(`delete from discipleship_goal where ministry_id = $1`, [alone.id]),
      ).rejects.toThrow(/cannot be left with no Discipleship Goal/)

      await client.query('rollback')
    } finally {
      client.release()
    }

    expect(await theList(alone)).toEqual(options)
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
          label: goalWording(offered),
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
          label: goalWording(offered),
          chosenBy: 0,
        }),
      ),
    ).rejects.toThrow(new GoalRefused('goal.last_one'))

    expect(await theList(racing)).toEqual([offered])
  })

  it('serialises two edits to one list, so neither decides against a stale one', async () => {
    // The boundary decides *where a new option goes* and *whether one is already
    // offered* against the list it read, and neither answer survives a second
    // Admin editing between that read and the write. So the read takes an advisory
    // lock on the Ministry, and the second edit waits for the first.
    //
    // Two additions racing is the case that costs the most when it goes wrong:
    // both compute the same `nextPosition`, and `unique (ministry_id, position)`
    // is deferred, so the collision arrives at commit as an unhandled error rather
    // than as anything an Admin could act on. Both land, on positions of their own.
    const busy = await createMinistryWithAdmin('Fairview Church')
    const before = (await theList(busy)).length

    await Promise.all([
      service().execute({ type: 'goal.add', ministryId: busy.id, label: 'Grief' }),
      service().execute({ type: 'goal.add', ministryId: busy.id, label: 'Money' }),
    ])

    const after = await theList(busy)
    expect(after).toHaveLength(before + 2)
    expect(after).toContain('Grief')
    expect(after).toContain('Money')

    const { rows } = await pool.query<{ position: number }>(
      `select position from discipleship_goal where ministry_id = $1 order by position`,
      [busy.id],
    )
    expect(new Set(rows.map((row) => row.position)).size).toBe(rows.length)
  })

  it('refuses a wording only capitalised differently, even from two Admins at once', async () => {
    // The rule that calls these one option is the domain's -- the database's unique
    // index is exact -- so without the lock both would land and the form would
    // offer two choices a Person could not tell apart.
    const busy = await createMinistryWithAdmin('Greenfield Chapel')

    const both = await Promise.allSettled([
      service().execute({ type: 'goal.add', ministryId: busy.id, label: 'Grief and loss' }),
      service().execute({ type: 'goal.add', ministryId: busy.id, label: 'grief AND loss' }),
    ])

    expect(both.filter((one) => one.status === 'fulfilled')).toHaveLength(1)
    const refused = both.find((one) => one.status === 'rejected')
    expect((refused as PromiseRejectedResult).reason).toEqual(
      new GoalRefused('goal.already_offered'),
    )

    const list = await theList(busy)
    expect(list.filter((label) => label.toLowerCase() === 'grief and loss')).toHaveLength(1)
  })

  it('sends a Person back to the form when their answer was retired mid-fill', async () => {
    // The list was true when the page was served and stopped being true before the
    // form came back. The foreign key is what catches it, and what it reaches the
    // Person as is the difference between one answer to give again and a 500 that
    // loses the availability grid they just filled in.
    const changing = await createMinistryWithAdmin('Harbour Church')
    const retired = await optionCalled((await theList(changing))[1]!, changing)

    await service().execute({
      type: 'goal.remove',
      ministryId: changing.id,
      goalId: retired,
    })

    await expect(
      service().execute({
        type: 'intake.submit',
        ministryId: changing.id,
        form: {
          fullName: 'Tessa Bright',
          phone: '5551230000',
          availability: ['monday:12'],
          ageBand: '25-34',
          gender: 'female',
          goalId: retired,
          email: null,
          smsConsent: true,
          contactSharing: 'granted',
          source: 'pastor_link',
          intakePath: null,
          declaredSide: null,
          experience: null,
          groupId: null,
        },
      }),
    ).rejects.toThrow(new IntakeRefused(['intake.goal_no_longer_offered']))

    // And nothing of theirs landed: the whole submission rolls back with it.
    const { rows } = await pool.query<{ count: string }>(
      `select count(*) from person where ministry_id = $1 and full_name = 'Tessa Bright'`,
      [changing.id],
    )
    expect(Number(rows[0]!.count)).toBe(0)
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
