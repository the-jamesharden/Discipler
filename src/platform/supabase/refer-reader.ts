import type { Clock } from '~/domain/clock'
import { systemClock } from '~/domain/clock'
import type { ReferPage, ReferReader } from '~/service/ports'
import { careNeededFrom } from './care-needed-reader'
import { adminPage, readPageDocument, type PageDocument } from './page'
import { historyOf } from './relationship-history'
import { text } from './rows'
import { createSupabaseServerClient } from './server-client'

/**
 * The Refer page (Exponential launch, ticket 32): one document, read as the Admin. It holds
 * the church's live code and what the tab bar's badge reads, and nothing about any church
 * the code ever brought.
 */
export const referPageFrom = (doc: PageDocument, clock: Clock): ReferPage => {
  const code = text(doc.referral_code)
  // Every church has one from the moment it opens, so none is a fault, not a blank page.
  if (!code) throw new Error('The Refer page arrived with no referral code')
  return { code, followUpCount: careNeededFrom(historyOf(doc), clock).length }
}

export const supabaseReferReader: ReferReader = {
  async readReferPage() {
    const supabase = await createSupabaseServerClient()
    return adminPage(await readPageDocument(supabase, 'refer_page'), (doc) => referPageFrom(doc, systemClock))
  },
}
