import { timezoneChoices } from './timezones'

/**
 * The Timezone control: the common zones by name, then every other zone.
 *
 * `current` null is a Ministry that has not chosen yet -- the Setup Link -- and
 * opens on a prompt nothing can be submitted with, so no Ministry starts on a
 * clock nobody picked. That is how every Ministry came to be on UTC before this
 * asked (2026-09-25).
 */
export const TimezoneSelect = ({ current }: { readonly current: string | null }) => {
  const zones = timezoneChoices(current)
  return (
    <select id="timezone" name="timezone" defaultValue={current ?? ''} required>
      {current === null ? (
        <option value="" disabled>
          Choose your timezone
        </option>
      ) : null}
      <optgroup label="Common">
        {zones.common.map((zone) => (
          <option key={zone.value} value={zone.value}>
            {zone.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Everywhere">
        {zones.everywhere.map((zone) => (
          <option key={zone.value} value={zone.value}>
            {zone.label}
          </option>
        ))}
      </optgroup>
    </select>
  )
}
