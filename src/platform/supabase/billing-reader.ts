import { systemClock } from '~/domain/clock'
import type { BillingPage, BillingReader } from '~/service/ports'
import { careNeededFrom } from './care-needed-reader'
import { adminPage, readPageDocument, section } from './page'
import { count, text } from './rows'
import { historyOf } from './relationship-history'
import { createSupabaseServerClient } from './server-client'

/**
 * What Discipler itself knows for the Billing page (Exponential launch, ticket 33), in one
 * document read as the Admin. The plan is Stripe's and comes from `StripeAccount`, on the
 * server, after this.
 */
export const supabaseBillingReader: BillingReader = {
  async readBillingPage() {
    const supabase = await createSupabaseServerClient()
    return adminPage(await readPageDocument(supabase, 'billing_page'), (doc): BillingPage => {
      const settings = section(doc, 'settings')
      const timeZone = text(settings.timezone)
      const day = count(settings.checkin_day)
      const hour = count(settings.checkin_hour)
      if (timeZone === null || day === null || hour === null) {
        throw new Error("The Billing page arrived with no clock or check-in day for this Ministry")
      }
      return {
        timeZone,
        cadence: { day, hour },
        followUpCount: careNeededFrom(historyOf(doc), systemClock).length,
      }
    })
  },
}
