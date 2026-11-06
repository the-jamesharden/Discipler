'use client'

import { useEffect, useRef } from 'react'
import { startTour } from './play'

/** Sets the tour going on the page the server drew around it. It draws nothing itself. */
export const TourDriver = () => {
  const here = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const tour = here.current?.closest<HTMLElement>('.tour')
    return tour ? startTour(tour) : undefined
  }, [])

  return <span ref={here} hidden />
}
