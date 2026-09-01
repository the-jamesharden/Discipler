import { ministryDiscipleshipIntakeQrLink } from '~/domain/outbound-copy'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { renderQrCode } from '~/platform/qr/qr-code'
import { appBaseUrl } from '~/platform/supabase/credentials'

/**
 * The discipleship wizard's QR code, as a file of its own.
 *
 * A second route rather than one route with a parameter, for the reason there are
 * two functions composing the two links: an Admin prints one of these and puts it
 * in front of a room, and *which code did I print* is a question the consent
 * records will later be read for. A path that answered either depending on a query
 * string is a path that answers the wrong one when somebody drops it.
 *
 * Everything else it does, it does for the reasons `intake-code.svg` gives: the
 * Ministry comes from the session and never from the URL, the response is never
 * cached, and a missing session is a 404 rather than a redirect because this URL is
 * loaded as an image.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  const admin = await currentAdmin()
  if (!admin) return new Response('Not found', { status: 404 })

  const svg = await renderQrCode(
    ministryDiscipleshipIntakeQrLink(appBaseUrl(), admin.ministryId),
  )

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      // Named for the form it opens, so an Admin with both squares saved in a
      // folder of downloads can tell which is which without opening them.
      'content-disposition': 'inline; filename="discipleship-intake-qr-code.svg"',
      'cache-control': 'private, no-store',
    },
  })
}
