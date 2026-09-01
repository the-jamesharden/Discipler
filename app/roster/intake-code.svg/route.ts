import { ministryIntakeQrLink } from '~/domain/outbound-copy'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { renderQrCode } from '~/platform/qr/qr-code'
import { appBaseUrl } from '~/platform/supabase/credentials'
import { qrCodeCaption } from '../copy'

/**
 * The QR code as a file of its own, so it can be printed and put in front of a room
 * or saved and dropped into a slide.
 *
 * The Ministry comes from the session and never from the URL. One path answers every
 * Admin with their own Ministry's code, which means an Admin cannot be handed a URL
 * that quietly asks for somebody else's -- and it means the response must never be
 * held in a shared cache, because the one thing keyed on is the same for everybody.
 *
 * A missing session is answered with 404 rather than a redirect to sign in. This URL
 * is loaded as an image by the Roster; sending an <img> to a login page produces a
 * broken image and an HTML document nobody will ever see.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  const admin = await currentAdmin()
  if (!admin) return new Response('Not found', { status: 404 })

  const svg = await renderQrCode(
    ministryIntakeQrLink(appBaseUrl(), admin.ministryId),
    qrCodeCaption.intake(admin.ministryName),
  )

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      // Displayed inline on the Roster and saved from here under a name an Admin
      // will recognise in a folder of downloads.
      'content-disposition': 'inline; filename="intake-qr-code.svg"',
      'cache-control': 'private, no-store',
    },
  })
}
