import { systemClock } from '~/domain/clock'
import { isBillingCycle } from '~/domain/offers'
import type {
  AdminPage,
  BillingPage,
  BillingReader,
  ChurchSignup,
  PaymentStepPage,
} from '~/service/ports'
import { careNeededFrom } from './care-needed-reader'
import { adminPage, readPageDocument, section, type PageDocument } from './page'
import { count, text } from './rows'
import { historyOf } from './relationship-history'
import { createSupabaseServerClient } from './server-client'

/**
 * What Discipler itself knows for the pages about paying (Exponential launch, ticket 33),
 * each in one document read as the Admin. The plan is Stripe's and comes from
 * `StripeAccount`, on the server, after this.
 */

/** A dropped key is raised: read as null, it would quietly lose a church its payment step. */
const churchSignupOf = (doc: PageDocument): ChurchSignup | null => {
  if (!('church_signup' in doc)) throw new Error('The page document has no church_signup')
  if (doc.church_signup === null) return null
  const row = section(doc, 'church_signup')
  const cycle = text(row.billing_cycle)
  const timeZone = text(row.timezone)
  if (cycle === null || !isBillingCycle(cycle) || timeZone === null) {
    throw new Error('The page document holds a church_signup this reader cannot read')
  }
  return {
    cycle,
    carriedCode: text(row.carried_code),
    timeZone,
    began: row.began === true,
    remindersOff: row.reminders_off === true,
  }
}

const readBilling = async (page: 'billing_page' | 'restart_page'): Promise<AdminPage<BillingPage>> => {
  const supabase = await createSupabaseServerClient()
  return adminPage(await readPageDocument(supabase, page), (doc): BillingPage => {
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
      signup: churchSignupOf(doc),
    }
  })
}

const readPaymentStep = async (
  page: 'home_page' | 'payment_step_page',
): Promise<AdminPage<PaymentStepPage>> => {
  const supabase = await createSupabaseServerClient()
  return adminPage(await readPageDocument(supabase, page), (doc): PaymentStepPage => ({
    signup: churchSignupOf(doc),
  }))
}

export const supabaseBillingReader: BillingReader = {
  readBillingPage: () => readBilling('billing_page'),
  readRestartPage: () => readBilling('restart_page'),
  readHomePage: () => readPaymentStep('home_page'),
  readPaymentStepPage: () => readPaymentStep('payment_step_page'),
}
