import { NextResponse, type NextRequest } from 'next/server'
import { passwordResetRefusal, SHORTEST_PASSWORD } from '~/domain/accounts'
import { PasswordResetRefused } from '~/domain/errors'
import { personId as asPersonId } from '~/domain/ids'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { getAccounts, getCommandService, getRosterReader } from '~/service/container'
import {
  RECORD_FAILED,
  resetDoneHeading,
  resetDoneInstruction,
  SIGNED_OUT_EVERYWHERE,
} from '../../copy'

export const dynamic = 'force-dynamic'

/**
 * The reset itself, and the one screen in Discipler that a POST renders rather than
 * redirects to.
 *
 * That is the whole reason this is a route handler and not a page. The password is
 * hashed on write and cannot be read back, so both ordinary answers are bad: a
 * redirect would have to carry the credential in a query string, into browser
 * history and server logs, and a POST that renders is what makes a browser refresh
 * perform a *second* reset -- killing the password the Admin has just read out. The
 * hidden candidate the GET minted is what settles it. A refresh re-posts the same
 * four words and sets the same password: nothing stored, nothing in a URL, and no
 * client JavaScript.
 *
 * A refresh does record a second `person.password_reset`, and that is left alone
 * rather than deduplicated. It is true -- the account was touched again -- and
 * history saying so twice is a smaller lie than history saying nothing about the
 * second time. There is nowhere to keep a *this one has been used* mark that is not
 * the storage this design does without.
 *
 * The markup is composed here rather than rendered from JSX, because Next refuses
 * `react-dom/server` inside the app directory. It is the same shape the QR routes
 * take, and everything variable goes through `escapeHtml` -- a Person's name is
 * whatever an Admin typed, and this response is a full document rather than a React
 * tree that would have escaped it for us.
 */

/** The five characters that cannot appear literally in HTML text or an attribute. */
const escapeHtml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]
      ?? character,
  )

const page = (body: string) =>
  new Response(
    '<!doctype html>'
      + '<html lang="en"><head>'
      + '<meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<title>Discipler</title>'
      // The same stylesheet the layout links, from the same URL. See
      // `app/layout.tsx` for why it is served from `public/` rather than imported:
      // this response is the second thing in the product that renders a document,
      // and it cannot be told the hashed path a bundled import sits behind.
      + '<link rel="stylesheet" href="/discipler.css">'
      + `</head><body>${body}</body></html>`,
    {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        // A live credential is on this page. Never held in a shared cache, and
        // never in a private one either: the next person at this machine pressing
        // Back must not be handed somebody's password.
        'cache-control': 'private, no-store, max-age=0, must-revalidate',
      },
    },
  )

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ personId: string }> },
) {
  const admin = await currentAdmin()
  if (!admin) return NextResponse.redirect(new URL('/login', request.url), { status: 303 })

  const { personId } = await params
  const person = asPersonId(personId)
  const back = new URL(`/roster/reset/${encodeURIComponent(personId)}`, request.url)

  const form = await request.formData()
  const password = form.get('password')

  // Not a candidate this product minted. Sent back to the screen that mints one
  // rather than refused in words: there is no code for it because there is no Admin
  // action that produces it -- every button in the product arrives here with four
  // words in the field -- and the page they land on hands them a fresh one.
  if (typeof password !== 'string' || password.length < SHORTEST_PASSWORD) {
    return NextResponse.redirect(back, { status: 303 })
  }

  // The guard, immediately before the password is touched and not in the command
  // that follows it. The command cannot be the guard here: it runs *after* the
  // credential has changed, because a Supabase Auth write and a `history.append`
  // cannot be one transaction and the record is the one that has to be able to
  // fail.
  //
  // On this Admin's Roster, holds an account, is not the Admin themselves. The
  // Ministry check is the read itself -- `accountOnTheRoster` goes through the
  // signed-in session, so a Person of another Ministry's is not visible and comes
  // back as nothing to reset.
  const target = await getRosterReader().accountOnTheRoster(admin.ministryId, person)

  // Back to the screen, which says which of the two it was. Nothing has been
  // touched, so there is no result to render and nothing for the Admin to hold on
  // to -- and the wording belongs on the page that has to say it on a first visit
  // anyway. The rule is the domain's, so this guard and that screen cannot come to
  // disagree; the `!target` beside it is restated for the compiler, which cannot
  // see that one value narrows another.
  if (passwordResetRefusal(target?.userId ?? null, admin.userId) || !target) {
    return NextResponse.redirect(back, { status: 303 })
  }

  // The password first, then the record. Whichever runs second can fail, and this
  // is the order that fails honestly: history claiming a credential change that
  // never happened is the worse lie, because it is the record a Ministry consults
  // precisely when it is asking whether somebody's account was touched. The same
  // shape provisioning already uses for its one unrollbackable step.
  //
  // Every session on the account ends here too. One port method, because two would
  // make *a password change that left an old session alive* a state a caller could
  // reach by forgetting the second call --
  // `docs/adr/0016-a-password-change-ends-every-session.md`.
  await getAccounts().setPassword(target.userId, password)

  let recorded = true
  try {
    await getCommandService().execute({
      type: 'person.reset_password',
      // From the session and never from the form, like every other Admin action.
      ministryId: admin.ministryId,
      personId: target.personId,
      resetBy: admin.userId,
    })
  } catch (error) {
    // Reported, never swallowed -- and never by taking the password off the screen,
    // which is now the only copy of a working credential anybody has. A refusal here
    // is the race the guard above cannot close: the Roster moved between the read
    // and the write. Either way the Admin is told, and the reason goes where
    // whoever runs the app will see it.
    recorded = false
    console.error(
      error instanceof PasswordResetRefused
        ? `A password reset for ${target.personId} was refused as it was recorded: ${error.refusal}`
        : error,
    )
  }

  return page(
    '<main>'
      + `<h1>${escapeHtml(resetDoneHeading(target.fullName))}</h1>`
      + `<p class="subtle">${escapeHtml(admin.ministryName)}</p>`
      + '<div class="panel">'
      + `<p>${escapeHtml(resetDoneInstruction(target.fullName))}</p>`
      // A readonly field rather than a paragraph, for the reason the Intake link on
      // the Roster is one: what an Admin does with this is select it, and a sentence
      // is not something a browser lets them copy cleanly. Not a copy button, which
      // would leave somebody's password sitting on a clipboard until the next copy.
      + `<input type="text" readonly value="${escapeHtml(password)}" aria-label="The new password">`
      + `<p class="subtle">${escapeHtml(SIGNED_OUT_EVERYWHERE)}</p>`
      + (recorded ? '' : `<p class="error" role="alert">${escapeHtml(RECORD_FAILED)}</p>`)
      + '</div>'
      + '<p><a href="/roster">Back to the Roster</a></p>'
      + '</main>',
  )
}
