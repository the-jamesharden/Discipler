import { ministryJoinQrLink } from '~/domain/outbound-copy'
import { renderQrCode } from '~/platform/qr/qr-code'
import { appBaseUrl } from '~/platform/supabase/credentials'
import { getIntakeFormsReader } from '~/service/container'
import { qrCodeCaption, qrCodeFilename } from '../copy'

/**
 * The mentor and mentee form's QR code, as a file of its own. *Download QR code*
 * on that form's tile saves it, encoding the readable link (Pastor feedback,
 * ticket 04).
 *
 * A second route rather than one route with a parameter, for the reason there are
 * two functions composing the two links: an Admin prints one of these and puts it
 * in front of a room, and *which code did I print* is a question the consent
 * records will later be read for. A path that answered either depending on a query
 * string is a path that answers the wrong one when somebody drops it.
 *
 * Everything else it does, it does for the reasons `intake-code.svg` gives: the
 * Ministry comes from the session and never from the URL, the response is never
 * cached, and a missing session is a 404 rather than a redirect.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
  const resolution = await getIntakeFormsReader().readIntakeFormsPage()
  if (resolution.status !== 'admin') return new Response('Not found', { status: 404 })

  // Captioned with the Ministry and the form, which is the whole of *labelled
  // clearly enough that an Admin printing one for a room knows which one they
  // printed*. The label is in the file rather than beside it on the page,
  // because the file is what gets opened on its own and put on paper.
  const { admin, page } = resolution
  const svg = await renderQrCode(
    ministryJoinQrLink(appBaseUrl(), page.shortName),
    qrCodeCaption.mentorAndMentee(admin.ministryName),
  )

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      // Named for the link it opens, so an Admin with both squares saved in a
      // folder of downloads can tell which is which without opening them.
      'content-disposition': `inline; filename="${qrCodeFilename.mentorAndMentee(page.shortName)}"`,
      'cache-control': 'private, no-store',
    },
  })
}
