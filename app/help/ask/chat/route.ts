import { NextResponse } from 'next/server'
import { questionsLeftAfter } from '~/domain/ask-discipler'
import { askDisciplerIsOn } from '~/platform/ask-discipler-switch'
import { adminPage, list, readPageDocument } from '~/platform/supabase/page'
import { text } from '~/platform/supabase/rows'
import { createSupabaseServerClient } from '~/platform/supabase/server-client'
import { guideReply } from '../reply'

export const dynamic = 'force-dynamic'

/**
 * This sign-in's chat, read when the bubble is opened and at no other time, so a page
 * that is only looked at makes no extra call (ADR-0023). One read, through the session,
 * under the policy that holds a chat to its author. Older chats are never listed.
 */
export async function GET() {
  if (!askDisciplerIsOn(process.env)) return new NextResponse(null, { status: 404 })

  const answer = adminPage(
    await readPageDocument(await createSupabaseServerClient(), 'ask_discipler_page'),
    (doc) => ({
      exchanges: list(doc, 'chat').map((row) => ({
        id: text(row.id),
        question: text(row.question) ?? '',
        reply: guideReply(text(row.answer) ?? ''),
      })),
      questionsLeft: questionsLeftAfter(typeof doc.asked_today === 'number' ? doc.asked_today : 0),
    }),
  )

  return answer.status === 'admin'
    ? NextResponse.json(answer.page, { headers: { 'cache-control': 'no-store' } })
    : NextResponse.json({ kind: 'signed-out' }, { status: 401 })
}
