import { NextResponse, type NextRequest } from 'next/server'
import { askDisciplerIsOn } from '~/platform/ask-discipler-switch'
import { currentAdmin, signInFromToken } from '~/platform/supabase/current-admin'
import { getAskDiscipler } from '~/service/container'
import { askDisciplerInstructions } from '../instructions'
import { guideReply } from '../reply'

export const dynamic = 'force-dynamic'
// More than the model's own longest wait, so the Admin hears sorry rather than a timeout.
export const maxDuration = 60

/**
 * A question to Ask Discipler (Exponential launch, ticket 31). Takes the form field
 * `question` and answers JSON for a chat that stays on screen: `answered` with the reply,
 * `limit`, or `failed`. Never an error page, because the chat says sorry for all of them.
 *
 * Who is asking, and for which church, comes from the session and never the form, and
 * the church's name and the Admin's name stop here: `ask` is handed IDs for the store.
 */
export async function POST(request: NextRequest) {
  if (!askDisciplerIsOn(process.env)) return new NextResponse(null, { status: 404 })

  try {
    const admin = await currentAdmin()
    if (!admin) return NextResponse.json({ kind: 'signed-out' }, { status: 401 })

    const sessionId = await signInFromToken()
    if (!sessionId) return NextResponse.json({ kind: 'signed-out' }, { status: 401 })

    const form = await request.formData().catch(() => null)
    const typed = form?.get('question')

    const answer = await getAskDiscipler().ask({
      ministryId: admin.ministryId,
      userId: admin.userId,
      sessionId,
      typed: typeof typed === 'string' ? typed : '',
      instructions: askDisciplerInstructions(),
    })

    switch (answer.kind) {
      case 'answered':
        return NextResponse.json({
          kind: 'answered',
          reply: guideReply(answer.text),
          questionsLeft: answer.questionsLeft,
        })
      case 'limit':
        return NextResponse.json({ kind: 'limit', questionsLeft: 0 }, { status: 429 })
      case 'failed':
        return NextResponse.json({ kind: 'failed', questionsLeft: answer.questionsLeft }, { status: 503 })
    }
  } catch (error) {
    // The store, since the model does not throw. By name alone: logs carry no chat text.
    console.error(`Asking Ask Discipler failed: ${error instanceof Error ? error.name : 'unknown'}`)
    return NextResponse.json({ kind: 'failed', questionsLeft: null }, { status: 503 })
  }
}
