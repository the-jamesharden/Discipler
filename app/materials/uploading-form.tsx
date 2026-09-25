'use client'

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { refusalMessage } from './copy'
import { SENT_BY_SCRIPT, type FormAnswer } from './form-answer'

/**
 * The create and edit form, as script runs it (Richer materials, review).
 *
 * Three things the plain form cannot do. Save waits for the uploads: a file
 * still on its way has no hidden field yet, so pressing Save then would save the
 * Material without it and say nothing. Save is pressed once: a second press
 * would post the same uploads again behind a first that had already landed. And
 * a refusal is shown where the Admin is: the form is sent by script and the
 * route answers in kind (`./form-answer`), so every field and every upload stays
 * as it was, however much was typed.
 *
 * Without script the form posts as it always has, and the route answers with a
 * page. A refused press there comes back with the sentence the server worded,
 * which this shows until the next answer replaces it.
 */

/** What the rest of the form hears from here, and tells it. */
interface UploadingFormState {
  /** How many files are still on their way to the bucket; Files and links says. */
  readonly setUploading: (count: number) => void
  /** Whether Save may be pressed now. */
  readonly canSave: boolean
  /**
   * The last answer that changes the uploads on the page, with a count so the
   * same answer twice is two answers.
   */
  readonly answered: {
    readonly forget: readonly string[]
    readonly gone: readonly string[]
    readonly count: number
  } | null
}

const UploadingFormContext = createContext<UploadingFormState | null>(null)

/** The form's state, for Files and links and the Save button. Null outside the form. */
export const useUploadingForm = (): UploadingFormState | null => useContext(UploadingFormContext)

export const UploadingForm = ({
  action,
  refusal,
  children,
}: {
  readonly action: string
  /** The sentence for a refusal the page was opened with, or null. */
  readonly refusal: string | null
  readonly children: ReactNode
}) => {
  const [uploading, setUploading] = useState(0)
  const [sending, setSending] = useState(false)
  const [shown, setShown] = useState(refusal)
  const [answered, setAnswered] = useState<UploadingFormState['answered']>(null)
  const toast = useRef<HTMLParagraphElement>(null)

  // Back to a page the browser kept, after a save that landed: the form is as
  // it was left, and so is this, which would otherwise be a Save that cannot be
  // pressed.
  useEffect(() => {
    const shownAgain = (event: PageTransitionEvent) => {
      if (event.persisted) setSending(false)
    }
    window.addEventListener('pageshow', shownAgain)
    return () => window.removeEventListener('pageshow', shownAgain)
  }, [])

  // A refusal is at the top of the form and Save is at the bottom.
  useEffect(() => {
    if (answered && shown) toast.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [answered, shown])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (sending || uploading > 0) return
    const form = event.currentTarget
    setSending(true)

    const response = await fetch(action, {
      method: 'POST',
      body: new FormData(form),
      headers: { [SENT_BY_SCRIPT.header]: SENT_BY_SCRIPT.value },
    }).catch(() => null)
    const answer = response?.headers.get('content-type')?.includes('application/json')
      ? ((await response.json().catch(() => null)) as FormAnswer | null)
      : null

    // Anything else -- signed out, a fault, no answer at all -- is sent again the
    // plain way, and the browser shows whatever the server says to that. A fault
    // rolled the command back, so a second send is not a second Material.
    if (!answer) {
      HTMLFormElement.prototype.submit.call(form)
      return
    }
    if ('location' in answer) {
      window.location.assign(answer.location)
      return
    }
    setSending(false)
    setShown('refused' in answer ? refusalMessage(answer.refused) : null)
    setAnswered((last) => ({
      forget: 'refused' in answer ? answer.forget : [],
      gone: 'gone' in answer ? answer.gone : [],
      count: (last?.count ?? 0) + 1,
    }))
  }

  return (
    <UploadingFormContext.Provider
      value={{ setUploading, canSave: uploading === 0 && !sending, answered }}
    >
      <form method="post" action={action} onSubmit={submit}>
        {shown ? (
          <p ref={toast} className="toast error" role="alert">
            {shown}
          </p>
        ) : null}
        {children}
      </form>
    </UploadingFormContext.Provider>
  )
}

/** The form's submit button, which cannot be pressed while a file is uploading or a press is on its way. */
export const SaveButton = ({ children }: { readonly children: ReactNode }) => {
  const form = useUploadingForm()
  return (
    <button type="submit" disabled={form ? !form.canSave : false}>
      {children}
    </button>
  )
}
