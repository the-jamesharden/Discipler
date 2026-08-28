import { notFound } from 'next/navigation'
import { AGE_BANDS, DAY_BLOCKS, WEEKDAYS } from '~/domain/intake'
import { dayBlockLabel, refusalMessages, weekdayLabel } from '../copy'
import { getIntakeReader } from '~/service/container'

/**
 * One form, reached with no account and no software to learn. One link serves the
 * whole Ministry: a pastor sends it directly, or a QR code opens the same one at a
 * leaders' meeting, and `?via=qr` is the only difference between the two.
 *
 * It is an ordinary form POST, so it works before JavaScript has loaded -- this is
 * the one page in Discipler filled in by somebody who will never have an account.
 */
export default async function IntakePage({
  params,
  searchParams,
}: {
  params: Promise<{ ministry: string }>
  searchParams: Promise<{ via?: string; refused?: string }>
}) {
  const { ministry } = await params
  const { via, refused } = await searchParams

  const page = await getIntakeReader().readIntakePage(ministry)
  if (!page) notFound()

  const problems = refusalMessages(refused)

  return (
    <main>
      <h1>Join discipleship at {page.ministryName}</h1>
      <p className="subtle">
        A few questions, once. There is nothing to download and no account to create.
      </p>

      <div className="panel">
        {problems.length > 0 ? (
          <div className="error" role="alert">
            <p>Please check the following:</p>
            <ul>
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <form method="post" action={`/intake/${page.ministryId}/submit`}>
          {/* The route the Person arrived by, recorded on each consent record. */}
          <input type="hidden" name="via" value={via === 'qr' ? 'qr' : 'link'} />

          <label htmlFor="fullName">Your name</label>
          <input id="fullName" name="fullName" required autoComplete="name" />

          <label htmlFor="phone">Mobile number</label>
          <input id="phone" name="phone" type="tel" required autoComplete="tel" />

          <label htmlFor="email">Email (optional)</label>
          <input id="email" name="email" type="email" autoComplete="email" />

          <fieldset>
            <legend>When could you meet?</legend>
            <p className="subtle">Select every time that could work — not just your best one.</p>
            <table>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="visually-hidden">Time of day</span>
                  </th>
                  {WEEKDAYS.map((day) => (
                    <th scope="col" key={day}>
                      {weekdayLabel[day]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAY_BLOCKS.map((block) => (
                  <tr key={block}>
                    <th scope="row">{dayBlockLabel[block]}</th>
                    {WEEKDAYS.map((day) => (
                      <td key={day}>
                        <label>
                          <span className="visually-hidden">
                            {weekdayLabel[day]} {dayBlockLabel[block]}
                          </span>
                          <input
                            type="checkbox"
                            name="availability"
                            value={`${day}:${block}`}
                          />
                        </label>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </fieldset>

          <label htmlFor="goalId">What are you hoping for?</label>
          <select id="goalId" name="goalId" required defaultValue="">
            <option value="" disabled>
              Choose one
            </option>
            {page.goals.map((goal) => (
              <option key={goal.id} value={goal.id}>
                {goal.label}
              </option>
            ))}
          </select>

          <label htmlFor="ageBand">Your age</label>
          <select id="ageBand" name="ageBand" required defaultValue="">
            <option value="" disabled>
              Choose one
            </option>
            {AGE_BANDS.map((band) => (
              <option key={band} value={band}>
                {band}
              </option>
            ))}
          </select>

          <fieldset>
            <legend>Gender</legend>
            <label>
              <input type="radio" name="gender" value="female" required /> Female
            </label>
            <label>
              <input type="radio" name="gender" value="male" required /> Male
            </label>
          </fieldset>

          <fieldset>
            <legend>Agreements</legend>

            <label>
              <input type="checkbox" name="smsConsent" value="yes" required /> I agree to
              receive text messages from {page.ministryName} through Discipler about my
              discipleship relationship, including a weekly check-in. Message frequency
              varies. Message and data rates may apply. Reply STOP to opt out or HELP for
              help.
            </label>

            {/*
              Two answers rather than one checkbox, because declining has to be
              something the Person did rather than something they skipped. Agreeing to
              hear from your church is not agreeing to hand your number to a congregant.
            */}
            <p>
              May we share your name and phone number with {page.ministryName} and with the
              people in the discipleship relationship you are placed in — the leader, and
              anyone else being discipled alongside you?
            </p>
            <label>
              <input type="radio" name="contactSharing" value="granted" required /> Yes, that
              is fine
            </label>
            <label>
              <input type="radio" name="contactSharing" value="declined" required /> No,
              please do not
            </label>
          </fieldset>

          <button type="submit">Submit</button>
        </form>
      </div>
    </main>
  )
}
