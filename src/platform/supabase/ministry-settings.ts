import { roleNoun, type MinistrySettings } from '~/domain/ministry-settings'
import type { MinistrySettingsReader } from '~/service/ports'
import { count, rows, text } from './rows'
import { createSupabaseServerClient } from './server-client'

/**
 * What the settings surface shows a Ministry about itself.
 *
 * Read through the signed-in Admin's session, like the Discipleship Goal options
 * beside it, so the policies are what scope it rather than a `where` clause this
 * file could forget -- `ministry_settings` answers for the Ministry the caller
 * *administers* and for no other, which is how *settings are per Ministry and
 * readable only within that Ministry* stays true of the data instead of true of
 * the page.
 */

/**
 * Checked field by field rather than cast, like every other row read in this
 * directory. The function, the grants and this reader can each move without the
 * others, and this is the screen a Ministry's cadence and its safeguarding rule
 * are edited from: a settings row that arrived with a field missing would render
 * a form whose blank box saves as a change nobody made.
 */
const asSettings = (row: Record<string, unknown>): MinistrySettings => {
  const name = text(row.name)
  const timezone = text(row.timezone)
  const leaderNoun = text(row.leader_noun)
  const participantNoun = text(row.participant_noun)
  const gap = count(row.suggest_max_age_band_gap)
  const day = count(row.checkin_day)
  const hour = count(row.checkin_hour)

  const missing = (field: string) =>
    new Error(`This Ministry's settings arrived with no ${field}`)

  if (name === null) throw missing('name')
  if (timezone === null) throw missing('timezone')
  if (leaderNoun === null) throw missing('word for a Leader')
  if (participantNoun === null) throw missing('word for a Participant')
  if (gap === null) throw missing('age band gap')
  if (day === null) throw missing('check-in day')
  if (hour === null) throw missing('check-in hour')
  if (typeof row.suggest_gender_match !== 'boolean') throw missing('gender rule')

  return {
    name,
    // `text` folds a blank column into null, which is the reading the whole
    // product takes of this one: a `from_name` of spaces is a Ministry that has
    // not set one, and the form has to show it as unset rather than as set to
    // nothing.
    fromName: text(row.from_name),
    timezone,
    // The columns are the authority on their own wording: they hold what
    // `readMinistrySettings` wrote, behind a check that they are not blank.
    leaderNoun: roleNoun(leaderNoun),
    participantNoun: roleNoun(participantNoun),
    suggestGenderMatch: row.suggest_gender_match,
    suggestMaxAgeBandGap: gap,
    cadence: { day, hour },
  }
}

export const supabaseMinistrySettingsReader: MinistrySettingsReader = {
  async readMinistrySettings(ministryId): Promise<MinistrySettings> {
    const supabase = await createSupabaseServerClient()

    const { data, error } = await supabase.rpc('ministry_settings', {
      target_ministry_id: ministryId,
    })

    if (error) {
      throw new Error(`Could not read this Ministry's settings: ${error.message}`)
    }

    const row = rows(data)[0]
    // Not a Ministry with default settings. `ministry_settings` answers an Admin
    // of that Ministry and nobody else, so an empty answer is a caller who is not
    // one -- and rendering a blank form for them would offer to save settings they
    // may not read.
    if (!row) throw new Error('This account administers no such Ministry')

    return asSettings(row)
  },
}
