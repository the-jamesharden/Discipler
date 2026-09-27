/**
 * The Timezone control's options, shared by the two places a Ministry's clock is
 * chosen: Ministry Settings, and the Ministry Setup Link that opens a Ministry.
 * One list, so the zone a Ministry opens on is one Settings can show again.
 */

/**
 * The zones most Ministries are in, first and by the name people say, so an Admin
 * picks *Central time* rather than scrolling for `America/Chicago`.
 */
const COMMON_TIMEZONES: readonly TimezoneChoice[] = [
  { value: 'America/New_York', label: 'Eastern time (New York)' },
  { value: 'America/Chicago', label: 'Central time (Chicago)' },
  { value: 'America/Denver', label: 'Mountain time (Denver)' },
  { value: 'America/Phoenix', label: 'Arizona, no daylight saving (Phoenix)' },
  { value: 'America/Los_Angeles', label: 'Pacific time (Los Angeles)' },
  { value: 'America/Anchorage', label: 'Alaska (Anchorage)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii (Honolulu)' },
]

export interface TimezoneChoice {
  readonly value: string
  readonly label: string
}

export interface TimezoneChoices {
  readonly common: readonly TimezoneChoice[]
  readonly everywhere: readonly TimezoneChoice[]
}

/**
 * What the Timezone control offers: the common zones, then every other zone this
 * platform can resolve -- together the set the dispatcher reads a cadence against.
 *
 * The zone a Ministry already has is always offered, even when it is not in either
 * list. `UTC` is the column default the first Ministries were opened on and is not
 * one of `Intl`'s named zones; a control that could not show it would quietly save
 * whichever option came first.
 */
export const timezoneChoices = (
  /** The zone already chosen, or null where nothing has been chosen yet. */
  current: string | null,
  supported: readonly string[] = Intl.supportedValuesOf('timeZone'),
): TimezoneChoices => {
  const common = COMMON_TIMEZONES.filter((choice) => supported.includes(choice.value))
  // Each zone once. A zone in both groups is two options with one value, and a
  // select shows the later one, so a Ministry that picked *Central time* would
  // see `America/Chicago` after saving.
  const everywhere = supported
    .filter((zone) => !common.some((choice) => choice.value === zone))
    .map((zone) => ({ value: zone, label: zone.replaceAll('_', ' ') }))
  const offered =
    current === null || [...common, ...everywhere].some((choice) => choice.value === current)
  return {
    common: offered ? common : [{ value: current, label: current }, ...common],
    everywhere,
  }
}
