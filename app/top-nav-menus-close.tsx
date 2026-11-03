'use client'

import { useEffect } from 'react'

/**
 * Closes the top nav's menus the way a menu is expected to close: on a press
 * anywhere outside it, on choosing something in it, and on Escape.
 *
 * Only an addition. Without a script the menus still open and close from their own
 * buttons, because each is a `details` element (`./top-nav`). Draws nothing.
 */

const openMenus = () => document.querySelectorAll<HTMLDetailsElement>('details.top-menu[open]')

export const TopNavMenusClose = () => {
  useEffect(() => {
    const pressed = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return

      for (const menu of openMenus()) {
        if (menu.querySelector('summary')?.contains(target)) continue
        if (!menu.contains(target) || target.closest('a, button')) menu.open = false
      }
    }

    const typed = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return

      for (const menu of openMenus()) {
        menu.open = false
        menu.querySelector('summary')?.focus()
      }
    }

    document.addEventListener('click', pressed)
    document.addEventListener('keydown', typed)

    return () => {
      document.removeEventListener('click', pressed)
      document.removeEventListener('keydown', typed)
    }
  }, [])

  return null
}
