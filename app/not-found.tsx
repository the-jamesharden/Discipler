/**
 * What an address with nothing at it shows, and every shut sign-up and Refer address is one.
 * The words are Next's own 404's. That page draws itself black in dark mode under the app's
 * dark green headings, which nobody can read, so this one stands on the app's own colours.
 */
export const metadata = { title: '404: This page could not be found.' }

export default function NotFound() {
  return (
    <main className="not-found">
      <h1>404</h1>
      <h2>This page could not be found.</h2>
    </main>
  )
}
