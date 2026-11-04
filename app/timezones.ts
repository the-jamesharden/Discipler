/**
 * The Timezone control's options, shared by the two places a Ministry's clock is
 * chosen: Ministry Settings, and the Ministry Setup Link that opens a Ministry.
 * One list, so the zone a Ministry opens on is one Settings can show again.
 *
 * Sign-up's own shorter list is at the foot, and every zone on it is one the first
 * list can show.
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

/** A group of choices on sign-up's Timezone control. */
export interface TimezoneGroup {
  readonly label: string
  readonly zones: readonly TimezoneChoice[]
}

/** What "Set up your account" shows before the browser has been asked. */
export const SIGN_UP_TIMEZONE_BEFORE_ASKING = 'America/New_York'

/** The mock-up's groups and words (`s4-account.html`), which James approved. */
const SIGN_UP_TIMEZONES: readonly TimezoneGroup[] = [
  {
    label: 'United States',
    zones: [
      { value: 'America/New_York', label: 'Eastern Time (New York)' },
      { value: 'America/Chicago', label: 'Central Time (Chicago)' },
      { value: 'America/Denver', label: 'Mountain Time (Denver)' },
      { value: 'America/Phoenix', label: 'Mountain Time, no daylight saving (Phoenix)' },
      { value: 'America/Los_Angeles', label: 'Pacific Time (Los Angeles)' },
      { value: 'America/Anchorage', label: 'Alaska Time (Anchorage)' },
      { value: 'Pacific/Honolulu', label: 'Hawaii Time (Honolulu)' },
    ],
  },
  {
    label: 'Other',
    zones: [
      { value: 'America/Puerto_Rico', label: 'Atlantic Time (Puerto Rico)' },
      { value: 'America/Toronto', label: 'Toronto' },
      { value: 'Europe/London', label: 'London' },
    ],
  },
]

/**
 * Sign-up's choices, with the browser's zone added to Other when it is on neither list,
 * so the zone preselected is one that is offered.
 */
export const signUpTimezones = (browserZone: string | null): readonly TimezoneGroup[] => {
  const offered = SIGN_UP_TIMEZONES.some((group) => group.zones.some((zone) => zone.value === browserZone))
  if (browserZone === null || offered) return SIGN_UP_TIMEZONES
  return SIGN_UP_TIMEZONES.map((group) =>
    group.label === 'Other'
      ? { ...group, zones: [...group.zones, { value: browserZone, label: browserZone.replaceAll('_', ' ') }] }
      : group,
  )
}
