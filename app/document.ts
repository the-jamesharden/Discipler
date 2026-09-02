import { FONTS_URL } from './fonts'

/**
 * A whole HTML document composed by a route handler, for the two screens in
 * Discipler that a POST renders rather than redirects to: the reset result, and
 * the Concern's words. Both exist because a redirect would have to carry
 * something through a query string that must not travel in one -- a credential,
 * or text whose reading is an audited act -- and a POST that renders is what makes
 * a browser refresh perform the act again rather than replay a URL.
 *
 * Composed as strings rather than rendered from JSX, because Next refuses
 * `react-dom/server` inside the app directory. Everything variable goes through
 * `escapeHtml`; a Person's name is whatever an Admin typed.
 *
 * The same fonts and the same stylesheet the layout links, from the same URLs.
 * See `app/layout.tsx` for why the stylesheet is served from `public/`.
 */

/** The five characters that cannot appear literally in HTML text or an attribute. */
export const escapeHtml = (text: string): string =>
  text.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]
      ?? character,
  )

export const htmlDocument = (body: string): Response =>
  new Response(
    '<!doctype html>'
      + '<html lang="en"><head>'
      + '<meta charset="utf-8">'
      + '<meta name="viewport" content="width=device-width, initial-scale=1">'
      + '<title>Discipler</title>'
      + '<link rel="preconnect" href="https://fonts.googleapis.com">'
      + '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
      + `<link rel="stylesheet" href="${FONTS_URL}">`
      + '<link rel="stylesheet" href="/discipler.css">'
      + `</head><body>${body}</body></html>`,
    {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        // Something sensitive is on every page this renders. Never held in a
        // shared cache, and never in a private one either: the next person at this
        // machine pressing Back must not be handed it.
        'cache-control': 'private, no-store, max-age=0, must-revalidate',
      },
    },
  )
