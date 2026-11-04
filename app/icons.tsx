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

/** The way on: the next help page. */
export const ArrowRight = () => (
  <Line>
    <path d="M5 12h14" />
    <path d="M12 5l7 7-7 7" />
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

/** Two people, beside who is waiting on the Admin. */
export const People = () => (
  <Line>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
    <path d="M16 4.5a3.5 3.5 0 010 7M18 14.3c2.1.7 3.5 2.8 3.5 5.7" />
  </Line>
)

/** A cross, on a button that puts something away. */
export const Cross = () => (
  <Line>
    <path d="M6 6l12 12M18 6L6 18" />
  </Line>
)

/** A gift, on Refer a church. */
export const Gift = () => (
  <Line>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M12 8v13M5 12v9h14v-9M12 8S10.5 3 8 3.8 8.5 8 12 8zM12 8s1.5-5 4-4.2S15.5 8 12 8z" />
  </Line>
)

/** A question mark in a circle, on the Help menu. */
export const QuestionMark = () => (
  <Line>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.2a2.6 2.6 0 015 .9c0 1.8-2.5 2.3-2.5 3.9M12 17.2v.1" />
  </Line>
)

/** A gear, the way to Settings. */
export const Gear = () => (
  <Line>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
  </Line>
)

/** One person, where a name is not there to make initials from. */
export const Person = () => (
  <Line>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
  </Line>
)

/** An open book, on the Help center. */
export const Book = () => (
  <Line>
    <path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5z" />
    <path d="M4 19a2 2 0 012-2h13" />
  </Line>
)

/** An arrow going back round, on Restart onboarding. */
export const Restart = () => (
  <Line>
    <path d="M3 12a9 9 0 109-9 9.5 9.5 0 00-6.7 2.8L3 8" />
    <path d="M3 3v5h5" />
  </Line>
)

/** A megaphone, on What's new. */
export const Megaphone = () => (
  <Line>
    <path d="M3 11v2a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1z" />
    <path d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" />
  </Line>
)

/** A calendar, on Office hours. */
export const Calendar = () => (
  <Line>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M16 3v4M8 3v4M3 10h18" />
  </Line>
)

/** A video frame, on Setup videos. */
export const Video = () => (
  <Line>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M10 9l5 3-5 3z" />
  </Line>
)

/** A video camera, on the office hours card. */
export const VideoCamera = () => (
  <Line>
    <rect x="2.5" y="6" width="13" height="12" rx="2" />
    <path d="M15.5 10.5l6-3.5v10l-6-3.5z" />
  </Line>
)

/** A pen, on the Blog. */
export const Pen = () => (
  <Line>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="M14 6l4 4" />
  </Line>
)

/** A sheet with lines on it, on Intake forms. */
export const Form = () => (
  <Line>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M9 8h6M9 12h6M9 16h4" />
  </Line>
)

/** A key, on Change your password. */
export const Key = () => (
  <Line>
    <circle cx="7.5" cy="15.5" r="4.5" />
    <path d="M10.7 12.3L20 3M16 7l3 3" />
  </Line>
)

/** An arrow leaving through a door, on Sign out. */
export const LeaveDoor = () => (
  <Line>
    <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l5-5-5-5M15 12H3" />
  </Line>
)

/** A magnifying glass, on search. */
export const Search = () => (
  <Line>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </Line>
)

/** A page with its corner turned, on a row of search that opens a page. */
export const PageIcon = () => (
  <Line>
    <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
    <path d="M14 3v5h5" />
  </Line>
)

/** Two people side by side, on a pair in search. */
export const Pair = () => (
  <Line>
    <circle cx="8" cy="9" r="3" />
    <circle cx="16" cy="9" r="3" />
    <path d="M2.5 19c.5-3 2.8-5 5.5-5s5 2 5.5 5M10.5 19c.5-3 2.8-5 5.5-5s5 2 5.5 5" />
  </Line>
)

/** A card, on Billing. */
export const Card = () => (
  <Line>
    <rect x="2.5" y="5" width="19" height="14" rx="2" />
    <path d="M2.5 10h19" />
  </Line>
)
