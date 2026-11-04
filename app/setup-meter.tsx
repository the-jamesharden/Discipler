import { setupMeterIsOn } from '~/platform/setup-meter-switch'
import type { SignedInAdmin } from '~/service/ports'
import { SetupMeterBar } from './setup-meter-bar'
import { setupMeterView } from './setup-meter-copy'

/**
 * "Jumpstart discipleship", under the tabs on every Admin page until this Admin has
 * seen the badge. Everything it draws came with the page's one read
 * (`docs/adr/0023-a-page-is-one-read.md`), so it asks the database nothing. Not drawn
 * at all until tickets 27 and 28 ship (`setupMeterIsOn`).
 */
export const SetupMeter = ({ admin }: { readonly admin: SignedInAdmin }) =>
  setupMeterIsOn(process.env) && admin.setup.shown ? (
    <SetupMeterBar view={setupMeterView(admin.setup, admin.ministryName)} />
  ) : null
