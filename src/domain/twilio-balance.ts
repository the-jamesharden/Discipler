/**
 * The Twilio balance as money (Exponential launch, ticket 08). Whole cents, because
 * a floor compared in floating point is a floor that moves by a rounding error.
 *
 * Auto-recharge should keep the balance above this, so falling below it means a
 * recharge failed. Below it support@ is told, before an empty balance stops every
 * church's texts and codes.
 */
export const TWILIO_BALANCE_FLOOR_CENTS = 7500

export const twilioBalanceIsLow = (cents: number): boolean => cents < TWILIO_BALANCE_FLOOR_CENTS

const PLAIN_DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/

/**
 * Cents from a decimal as Twilio writes one, or null for anything else. Anything past
 * the cent is cut off, which can only read a balance as lower, never over the floor.
 * Null rather than zero: an answer nobody can read is not an empty balance.
 */
export const dollarsToCents = (raw: string): number | null => {
  const parts = PLAIN_DECIMAL.exec(raw)
  if (!parts) return null

  const [, sign, whole, fraction = ''] = parts
  const magnitude = Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2))
  if (!Number.isSafeInteger(magnitude)) return null
  return sign === '-' && magnitude !== 0 ? -magnitude : magnitude
}

/** `$70.00`, or `-$1.50` for an account Twilio has let go below nothing. */
export const dollars = (cents: number): string => {
  const magnitude = Math.abs(cents)
  const pennies = String(magnitude % 100).padStart(2, '0')
  return `${cents < 0 ? '-' : ''}$${Math.floor(magnitude / 100)}.${pennies}`
}
