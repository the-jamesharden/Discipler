/**
 * The line icons a button carries beside its words: drawn in the text's colour
 * and at its size (`.ico`), and hidden from a screen reader, because the words
 * already say what the button does.
 */

import type { ReactNode } from 'react'

const Line = ({ children }: { readonly children: ReactNode }) => (
  <svg
    className="ico"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)

/** The way back. */
export const ArrowLeft = () => (
  <Line>
    <path d="M19 12H5" />
    <path d="M12 19l-7-7 7-7" />
  </Line>
)

/** A file saved to the device. */
export const Download = () => (
  <Line>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </Line>
)

/** A page opened to be printed. */
export const Printer = () => (
  <Line>
    <path d="M6 9V2h12v7" />
    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
    <rect x="6" y="14" width="12" height="8" />
  </Line>
)

/** A telephone, beside a number to call. */
export const Phone = () => (
  <Line>
    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />
  </Line>
)

/** A speech bubble, beside a text to send from the Admin's own phone. */
export const Message = () => (
  <Line>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </Line>
)

/** An envelope, beside an email address. */
export const Mail = () => (
  <Line>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 6-10 7L2 6" />
  </Line>
)
