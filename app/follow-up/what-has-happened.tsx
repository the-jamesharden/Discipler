import type { Happening } from '~/service/ports'
import { happenedOn, happeningLine, WHAT_HAS_HAPPENED } from './copy'

/**
 * *What has happened*, under the facts on Follow-Up's fuller card (Pastor
 * feedback, ticket 10): newest first, each line dated by the day in the
 * Ministry's zone. Drawn only where something has.
 */
export const WhatHasHappened = ({
  happened,
  now,
  timeZone,
}: {
  readonly happened: readonly Happening[]
  readonly now: Date
  readonly timeZone: string
}) =>
  happened.length === 0 ? null : (
    <div className="pc-history">
      <p className="pc-group-label">{WHAT_HAS_HAPPENED}</p>
      <ol>
        {happened.map((entry, index) => (
          <li key={index}>
            <span>{happenedOn(entry.at, timeZone)}</span>
            {happeningLine(entry, now, timeZone)}
          </li>
        ))}
      </ol>
    </div>
  )
