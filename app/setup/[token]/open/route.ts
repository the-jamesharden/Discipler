import { NextResponse, type NextRequest } from 'next/server'
import { getMinistrySetup } from '~/service/container'

/**
 * An ordinary form POST, so a Ministry can be opened before JavaScript has
 * loaded. There is no session and none is consulted: possession of the link is
 * the whole of the authentication, exactly as it is for a Leader accepting an
 * Invitation Link.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const back = (code?: string) =>
    NextResponse.redirect(new URL(`/setup/${token}${code ? `?error=${code}` : ''}`, request.url), {
      status: 303,
    })

  const form = await request.formData()
  const fullName = String(form.get('fullName') ?? '').trim()
  const password = String(form.get('password') ?? '')

  // A name is the one thing this form asks for besides the password. The number
  // was displayed, not requested, so there is nothing else here to get wrong.
  if (!fullName) return back('setup.not_found')

  const opened = await getMinistrySetup().open(token, { fullName, password })
  if ('refusal' in opened) return back(opened.refusal)

  // Back to the same link, which is now spent. The page reads that as "your
  // Ministry exists" rather than as a failure, and `done` is what makes it say so
  // in the present tense the first time.
  return NextResponse.redirect(new URL(`/setup/${token}?done=opened`, request.url), {
    status: 303,
  })
}
