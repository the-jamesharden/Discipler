'use client'

import { useRef, useState, type FormEvent, type ReactNode } from 'react'

/**
 * "Save new password" (Exponential launch, ticket 22). A plain form post, so it works
 * before JavaScript has loaded. The button turns off at the first press once it has,
 * because the press spends the link: a second click would cancel the first's page and
 * land on the one saying the link has been used, when it has just worked.
 *
 * The page draws the field, so the password rule's module stays on the server.
 */
export const NewPasswordForm = ({
  action,
  submit,
  children,
}: {
  readonly action: string
  readonly submit: string
  readonly children: ReactNode
}) => {
  const [busy, setBusy] = useState(false)
  // A ref as well as `busy`, because a second click can land before `busy` has rendered.
  const pressed = useRef(false)

  const once = (event: FormEvent) => {
    if (pressed.current) {
      event.preventDefault()
      return
    }
    pressed.current = true
    setBusy(true)
  }

  return (
    <form method="post" action={action} onSubmit={once}>
      {children}
      <button type="submit" className="full" disabled={busy}>
        {submit}
      </button>
    </form>
  )
}
