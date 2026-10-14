import {
  GROWTH_MEASURES,
  GROWTH_SCALES,
  OPENING_CHOICE,
  type GrowthChoice,
  type GrowthMeasure,
  type GrowthScale,
} from '~/domain/growth'

/**
 * Where the growth chart's choice lives (Pastor feedback, ticket 05): in the
 * address, like every other control on the dashboard, so the dropdown and the
 * toggle are links that work without script and a refresh keeps what was
 * picked. `?growth=` says what it counts and `?by=` weeks or months; the choice
 * Overview opens on is said by saying nothing, so `/overview` stays `/overview`.
 */

export const MEASURE_PARAMETER = 'growth'
export const SCALE_PARAMETER = 'by'

/** Whatever arrives in the address is whatever somebody typed there: anything unknown is the opening choice. */
export const growthChoiceFrom = (query: { readonly growth?: string; readonly by?: string }): GrowthChoice => ({
  measure: GROWTH_MEASURES.find((measure): measure is GrowthMeasure => measure === query.growth) ?? OPENING_CHOICE.measure,
  scale: GROWTH_SCALES.find((scale): scale is GrowthScale => scale === query.by) ?? OPENING_CHOICE.scale,
})

/** The Overview's address with this choice, and a card open where one is named. */
export const overviewAddress = (choice: GrowthChoice, card: string | null = null): string => {
  const query = new URLSearchParams()
  if (card !== null) query.set('card', card)
  if (choice.measure !== OPENING_CHOICE.measure) query.set(MEASURE_PARAMETER, choice.measure)
  if (choice.scale !== OPENING_CHOICE.scale) query.set(SCALE_PARAMETER, choice.scale)
  const said = query.toString()
  return said ? `/overview?${said}` : '/overview'
}
