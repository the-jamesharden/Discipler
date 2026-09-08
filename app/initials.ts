/**
 * A person's initials, for the avatar beside their name. Derived from the name.
 *
 * On its own so a client component can draw an avatar without pulling the page
 * shell, and everything the shell reads on the server, into the browser bundle.
 */
export const initialsOf = (fullName: string): string => {
  const parts = fullName.trim().split(/\s+/).filter((part) => part !== '')
  const first = parts[0]?.[0] ?? '?'
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return `${first}${last}`.toUpperCase()
}
