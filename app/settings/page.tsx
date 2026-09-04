import { redirect } from 'next/navigation'
import { AGE_BANDS } from '~/domain/intake'
import {
  MOST_BANDS_APART,
  QUIET_HOURS,
  speakingName,
} from '~/domain/ministry-settings'
import { resolveAdmin } from '~/platform/supabase/current-admin'
import { getMinistrySettingsReader } from '~/service/container'
import { AccountMenu, NotAnAdmin, PageShell } from '../shell'
import {
  DAYS,
  gapLabel,
  hourLabel,
  messagePreviews,
  refusalMessages,
} from './copy'

export const dynamic = 'force-dynamic'

const HOURS = Array.from(
  { length: QUIET_HOURS.latest - QUIET_HOURS.earliest + 1 },
  (_unused, index) => QUIET_HOURS.earliest + index,
)

const GAPS = Array.from({ length: MOST_BANDS_APART + 1 }, (_unused, bands) => bands)

/**
 * Every zone this platform can resolve, which is the same set the dispatcher reads
 * a cadence and a week against. Offered as a datalist rather than a `select`,
 * because there are several hundred of them and an Admin knows how to type
 * `Chicago` -- and because a datalist degrades to an ordinary text box, which the
 * boundary and the database both check anyway.
 */
const TIMEZONES = Intl.supportedValuesOf('timeZone')

/**
 * The one settings surface: three sections, one form, one save.
 *
 * One form and not three, because the sections are not three decisions. A Ministry
 * that saved its Language and had its Pairing refused would be looking at a screen
 * showing half of what it asked for, and a cadence that landed without the timezone
 * it is read against is a check-in due at an hour nobody chose.
 *
 * **Message structure, reply tokens and the opt-out footer are not on this page,
 * and are not on it as disabled fields either.** The first two are a state machine
 * and the third is a carrier obligation; none of the three is a ministry's to vary,
 * and a greyed-out box invites *can you turn that on for us?*
 */
export default async function MinistrySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>
}) {
  const resolution = await resolveAdmin()

  if (resolution.status === 'not-an-admin') return <NotAnAdmin title="Ministry Settings" />
  if (resolution.status === 'signed-out') redirect('/login')

  const admin = resolution.admin
  const settings = await getMinistrySettingsReader().readMinistrySettings(admin.ministryId)
  const query = await searchParams

  const refusals = refusalMessages(query.error)
  const previews = messagePreviews()
  // What the messages currently read as. The preview renders the saved values;
  // the script at the foot keeps both in step while an Admin is still typing.
  const readsAs = speakingName(settings)

  return (
    <PageShell
      title="Ministry Settings"
      subtitle={settings.name}
      back={{ href: '/overview', label: 'Back to the overview' }}
      actions={<AccountMenu ministry />}
    >
      {refusals.length > 0 ? (
        <p className="toast error" role="alert">
          Nothing was saved. {refusals.join(' ')}
        </p>
      ) : null}

      {query.saved === 'yes' && refusals.length === 0 ? (
        <p className="toast" role="status">
          Saved.
        </p>
      ) : null}

      {/* One form over all three sections. The sections are headings inside it,
          not separate saves. */}
      <form method="post" action="/settings/save">
        <div className="card">
          <h2 className="card-title">Ministry</h2>

          <div className="field">
            <label className="label" htmlFor="name">Ministry name</label>
            <p className="subtle">What this ministry is called on your own screens.</p>
            <input
              id="name"
              name="name"
              type="text"
              defaultValue={settings.name}
              data-preview="readsAs"
              required
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="fromName">Messages read as</label>
            <p className="subtle">
              The name in front of every text you send. Leave it blank to use the
              ministry name.
            </p>
            <input
              id="fromName"
              name="fromName"
              type="text"
              defaultValue={settings.fromName ?? ''}
              placeholder={settings.name}
              data-preview="readsAs"
            />
          </div>

          <label className="label" htmlFor="timezone">Timezone</label>
          {/* Said plainly, because it looks like the least important field on this
              page and is the most load-bearing: nothing else in the product carries
              a clock, so every rule below resolves against this one. */}
          <p className="subtle">
            Your own clock. Every availability block, the check-in below, the week
            behind your care counters and the monthly opt-out line are all read
            against it.
          </p>
          <input
            id="timezone"
            name="timezone"
            type="text"
            list="timezones"
            defaultValue={settings.timezone}
            required
          />
          <datalist id="timezones">
            {TIMEZONES.map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
        </div>

        <div className="card">
          <h2 className="card-title">Language</h2>
          <p className="card-lead">
            Your people are called what you call them. These words go into the texts
            below exactly as you write them.
          </p>

          <div className="field">
            <label className="label" htmlFor="leaderNoun">A person leading is a…</label>
            <input
              id="leaderNoun"
              name="leaderNoun"
              type="text"
              defaultValue={settings.leaderNoun}
              data-preview="leaderNoun"
              required
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="participantNoun">A person being discipled is a…</label>
            <input
              id="participantNoun"
              name="participantNoun"
              type="text"
              defaultValue={settings.participantNoun}
              data-preview="participantNoun"
              required
            />
          </div>

          {/* The preview, composed by the same functions that compose the messages
              that actually go out -- prefix, opt-out disclosure and all. Rendered
              on the server from what is saved, so it stands with JavaScript off;
              the script at the foot of the page only keeps the word in step as an
              Admin types. */}
          <h3>In your own messages</h3>
          {previews.map((preview, index) => (
            <figure key={preview.to}>
              <figcaption className="subtle">{preview.to}</figcaption>
              <blockquote>
                {preview.opening}
                <span data-preview-word="readsAs">{readsAs}</span>
                {preview.middle}
                <span
                  data-preview-word={index === 0 ? 'leaderNoun' : 'participantNoun'}
                >
                  {index === 0 ? settings.leaderNoun : settings.participantNoun}
                </span>
                {preview.closing}
              </blockquote>
            </figure>
          ))}
        </div>

        <div className="card">
          <h2 className="card-title">Pairing</h2>

          {/* Deliberately not a row in a list of toggles beside the age gap. One is
              a safeguarding rule a ministry turns off on purpose and the other is a
              tuning dial, and a uniform list would misrepresent the first. */}
          <h3>Gender</h3>
          <p className="subtle">
            One-to-ones are matched by gender: men with men, women with women. This
            is enforced everywhere, including when you pair two people by hand.
            Groups are unaffected — a group is what it was declared as.
          </p>
          <label className="check" htmlFor="suggestGenderMatch">
            <input
              id="suggestGenderMatch"
              name="suggestGenderMatch"
              type="checkbox"
              value="yes"
              defaultChecked={settings.suggestGenderMatch}
            />
            <span>Match gender in one-to-ones</span>
          </label>
          <p className="subtle">
            Turning this off permits mixed one-to-ones throughout this ministry.
          </p>

          <h3>Age</h3>
          {/* The word *above* is on the label and in the help text, because the
              setting is a single integer and an integer with no stated direction is
              read as symmetric -- which would exclude most of a ministry's real
              pairings. */}
          <label className="label" htmlFor="suggestMaxAgeBandGap">
            How many age bands a participant may be <strong>above</strong> their
            leader
          </label>
          <p className="subtle">
            Suggestions only — you can always pair across it by hand. There is no
            limit the other way: an older leader with a much younger participant is
            the common case. The bands are {AGE_BANDS.join(', ')}.
          </p>
          <select
            id="suggestMaxAgeBandGap"
            name="suggestMaxAgeBandGap"
            defaultValue={String(settings.suggestMaxAgeBandGap)}
          >
            {GAPS.map((bands) => (
              <option key={bands} value={bands}>
                {gapLabel(bands)}
              </option>
            ))}
          </select>

          <h3>Check-in</h3>
          <p className="subtle">
            When each leader is asked how their week went, in your own timezone. A
            change takes effect from the next check-in; anything already scheduled
            goes out as it was.
          </p>

          <label className="label" htmlFor="checkinDay">Day</label>
          <select
            id="checkinDay"
            name="checkinDay"
            defaultValue={String(settings.cadence.day)}
          >
            {DAYS.map((day) => (
              <option key={day.value} value={day.value}>
                {day.label}
              </option>
            ))}
          </select>

          <label className="label" htmlFor="checkinHour">Hour</label>
          <select
            id="checkinHour"
            name="checkinHour"
            defaultValue={String(settings.cadence.hour)}
          >
            {HOURS.map((hour) => (
              <option key={hour} value={hour}>
                {hourLabel(hour)}
              </option>
            ))}
          </select>
          <p className="subtle">
            Between {hourLabel(QUIET_HOURS.earliest)} and{' '}
            {hourLabel(QUIET_HOURS.latest)}, on the hour. Nobody in your ministry is
            texted outside those hours.
          </p>
        </div>

        <div className="form-actions">
          <span />
          <button type="submit">Save settings</button>
        </div>
      </form>

      {/* Progressive enhancement and nothing more. The preview above is already
          the real message, rendered on the server by the same functions that
          compose the message that goes out; this only keeps the two editable words
          in step while an Admin is still typing them. With JavaScript off the page
          loses the liveness and keeps the preview.

          It shows what was typed and normalises nothing. `readWording` is where
          trimming and collapsing live, and it says so itself -- *one definition,
          because it is one rule and two copies of it would drift* -- and a copy of
          that rule in this string is a copy nothing typechecks. So a word an Admin
          is mid-way through typing appears as they typed it, and the moment they
          save, the server renders what will actually be sent.

          `readsAs` has two inputs and not one, because the name a message reads as
          is a fallback and not a field: an empty *Messages read as* speaks as the
          ministry name, which is the same rule `speakingName` applies on the
          server. */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            const spoken = () => {
              const from = document.getElementById('fromName')
              const name = document.getElementById('name')
              return (from && from.value) || (name && name.value) || ''
            }

            for (const input of document.querySelectorAll('[data-preview]')) {
              const key = input.dataset.preview
              const words = document.querySelectorAll(
                '[data-preview-word="' + key + '"]'
              )
              if (words.length === 0) continue

              const saved = Array.from(words).map((word) => word.textContent)

              input.addEventListener('input', () => {
                const typed = key === 'readsAs' ? spoken() : input.value
                words.forEach((word, index) => {
                  word.textContent = typed || saved[index]
                })
              })
            }
          `,
        }}
      />
    </PageShell>
  )
}
