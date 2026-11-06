'use client'

import { useEffect } from 'react'

/**
 * Keeps the two editable words in the message preview in step while an Admin is typing
 * them. `app/settings/page.tsx` says what this is and is not. Draws nothing.
 *
 * A component rather than an inline script, because the Content-Security-Policy runs no
 * inline script of Discipler's (Exponential launch, ticket 37). An effect also runs when
 * Settings is reached without a full load, which the inline script never did.
 */
export const LivePreview = () => {
  useEffect(() => {
    const valueOf = (id: string): string =>
      document.querySelector<HTMLInputElement>(`input#${id}`)?.value ?? ''
    const spoken = () => valueOf('fromName') || valueOf('name')

    const controller = new AbortController()
    for (const input of document.querySelectorAll<HTMLInputElement>('[data-preview]')) {
      const key = input.dataset.preview
      const words = document.querySelectorAll(`[data-preview-word="${key}"]`)
      if (words.length === 0) continue

      const saved = Array.from(words, (word) => word.textContent)

      input.addEventListener(
        'input',
        () => {
          const typed = key === 'readsAs' ? spoken() : input.value
          words.forEach((word, index) => {
            word.textContent = typed || (saved[index] ?? '')
          })
        },
        { signal: controller.signal },
      )
    }
    return () => controller.abort()
  }, [])

  return null
}
