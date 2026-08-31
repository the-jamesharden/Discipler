/**
 * Twilio is a delivery vendor and not a domain concept, so what it needs to
 * authenticate lives here beside the adapter that uses it and nowhere else --
 * the same shape `src/platform/supabase/credentials.ts` has, for the same reason.
 *
 * The number to send from is deliberately absent. That is a property of the
 * Ministry and is read from its row; a number in the environment would be one
 * congregation's people receiving texts from another's.
 */

export interface TwilioCredentials {
  readonly accountSid: string
  readonly authToken: string
}

const required = (name: string): string => {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set. Discipler cannot send without it.`)
  }
  return value
}

export const twilioCredentials = (): TwilioCredentials => ({
  accountSid: required('TWILIO_ACCOUNT_SID'),
  authToken: required('TWILIO_AUTH_TOKEN'),
})
