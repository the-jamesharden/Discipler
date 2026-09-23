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
