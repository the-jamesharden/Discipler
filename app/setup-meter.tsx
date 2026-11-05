import type { SignedInAdmin } from '~/service/ports'
import { SetupMeterBar } from './setup-meter-bar'
import { setupMeterView } from './setup-meter-copy'

/**
 * "Jumpstart discipleship", under the tabs on every Admin page until this Admin has
 * seen the badge. Everything it draws came with the page's one read
 * (`docs/adr/0023-a-page-is-one-read.md`), so it asks the database nothing.
 */
export const SetupMeter = ({ admin }: { readonly admin: SignedInAdmin }) =>
  admin.setup.shown ? (
    <SetupMeterBar view={setupMeterView(admin.setup, admin.ministryName)} />
  ) : null
