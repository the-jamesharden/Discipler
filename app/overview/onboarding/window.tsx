'use client'

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { Cross } from '../../icons'
import { RESTART_ONBOARDING } from './addresses'
import { CLOSE, CONTINUE, PLAY_THE_VIDEO, VIDEO_LENGTH, WATCH_IT_AGAIN } from './copy'
import { sayOnboardingClosed } from './hold'
import type { VideoPlayer } from './video'

/**
 * The onboarding modal's frame: which of its two steps is showing, and closing it. What
 * it says is drawn on the server and handed in.
 *
 * Everything works before script has loaded, as the rest of the Admin's pages do: the
 * close button and Continue are links. Script only spares the reload, and tells the
 * server that this Admin has now had their opening, which is said as it opens rather
 * than on the close button, so a reload does not play the video a second time.
 */

const SEEN_ADDRESS = '/settings/setup-seen'

/** The poster until it is pressed, so nobody's page loads another company's player unasked. */
export const WelcomeVideo = ({ title, player }: { readonly title: string; readonly player: VideoPlayer }) => {
  const [playing, setPlaying] = useState(false)

  if (!playing) {
    return (
      <button type="button" className="video" aria-label={PLAY_THE_VIDEO} onClick={() => setPlaying(true)}>
        <span className="play">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
          </svg>
        </span>
        <span className="video-cap">{`${title} · ${VIDEO_LENGTH}`}</span>
      </button>
    )
  }

  return (
    <div className="video">
      {player.kind === 'frame' ? (
        <iframe src={player.src} title={title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
      ) : (
        <video src={player.src} title={title} controls autoPlay playsInline />
      )}
    </div>
  )
}

export const OnboardingWindow = ({
  welcome,
  cards,
  firstOpening,
}: {
  /** The welcome step, where this opening starts with it. */
  readonly welcome: ReactNode
  readonly cards: ReactNode
  /** Whether the server still has to be told this Admin has had their opening. */
  readonly firstOpening: boolean
}) => {
  const [open, setOpen] = useState(true)
  const [onWelcome, setOnWelcome] = useState(welcome !== null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    box.current?.focus()
    if (!firstOpening) return
    // Keepalive so it lands if the Admin has already moved on. A failure costs nothing
    // but a second opening next time.
    void fetch(SEEN_ADDRESS, {
      method: 'POST',
      body: new URLSearchParams({ onboarding: 'yes', stay: 'yes' }),
      keepalive: true,
    }).catch(() => undefined)
  }, [firstOpening])

  useEffect(() => {
    if (open) return
    sayOnboardingClosed()
    // So a reload does not bring it back, and leaving the rest of the address alone.
    const address = new URL(window.location.href)
    address.searchParams.delete('onboarding')
    window.history.replaceState(null, '', address)
  }, [open])

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [])

  if (!open) return null

  const close = (event: MouseEvent) => {
    event.preventDefault()
    setOpen(false)
  }

  return (
    <div className="modal-bg open onb-bg">
      <div className="modal onb" role="dialog" aria-modal="true" aria-labelledby="onb-title" tabIndex={-1} ref={box}>
        <a className="modal-close onb-close" href="/overview" aria-label={CLOSE} onClick={close}>
          <Cross />
        </a>
        {onWelcome ? (
          <div className="onb-step onb-welcome">
            {welcome}
            <div className="onb-welcome-acts">
              <a
                className="btn"
                href={RESTART_ONBOARDING}
                onClick={(event) => {
                  event.preventDefault()
                  setOnWelcome(false)
                }}
              >
                {CONTINUE}
              </a>
              <span>{WATCH_IT_AGAIN}</span>
            </div>
          </div>
        ) : (
          <div className="onb-step">{cards}</div>
        )}
      </div>
    </div>
  )
}
