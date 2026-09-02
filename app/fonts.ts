/**
 * The two typefaces the design files use, loaded the way they load them: the
 * Google Fonts stylesheet from the prototype's head. Crimson Pro for headings and
 * DM Sans for everything else; `public/discipler.css` declares the serif and
 * sans-serif fallbacks for a browser that never reaches the fonts. Decision 2 of
 * ticket 31.
 *
 * Its own module because two things render a document: the layout, and the
 * reset-result route handler, which composes its own `<head>`.
 */
export const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Crimson+Pro:wght@300;400;600;700&family=DM+Sans:wght@400;500;700&display=swap'
