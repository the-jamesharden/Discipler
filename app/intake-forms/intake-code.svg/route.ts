import { ministryGroupsJoinQrLink } from '~/domain/outbound-copy'
import { renderQrCode } from '~/platform/qr/qr-code'
import { appBaseUrl } from '~/platform/supabase/credentials'
import { getIntakeFormsReader } from '~/service/container'
import { qrCodeCaption, qrCodeFilename } from '../copy'

/**
 * The groups form's QR code as a file of its own, so it can be printed and put in
 * front of a room or saved and dropped into a slide. *Download QR code* on the
 * Groups form's tile saves it. The path is the one this route has had since the
 * original link was the group form; only what it encodes has changed, to the
 * readable link (Pastor feedback, ticket 04).
 *
 * The Ministry comes from the session and never from the URL. One path answers every
 * Admin with their own Ministry's code, which means an Admin cannot be handed a URL
 * that quietly asks for somebody else's -- and it means the response must never be
 * held in a shared cache, because the one thing keyed on is the same for everybody.
 *
 * A missing session is answered with 404 rather than a redirect to sign in: the
 * URL is fetched by a download, and a login page saved under a QR code's name is
 * a file nobody can open.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  // The page's own read, for the short name the code is built from. It is drawn
  // only when an Admin downloads it, so the extra reads are paid once per press.
  const resolution = await getIntakeFormsReader().readIntakeFormsPage()
  if (resolution.status !== 'admin') return new Response('Not found', { status: 404 })

  const { admin, page } = resolution
  const svg = await renderQrCode(
    ministryGroupsJoinQrLink(appBaseUrl(), page.shortName),
    qrCodeCaption.groups(admin.ministryName),
  )

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      // Saved under the link it opens, so an Admin recognises it later in a folder
      // of downloads.
      'content-disposition': `inline; filename="${qrCodeFilename.groups(page.shortName)}"`,
      'cache-control': 'private, no-store',
    },
  })
}
