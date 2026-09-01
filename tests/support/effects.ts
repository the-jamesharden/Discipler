import { expect } from 'vitest'
import type { Effect } from '~/domain/effects'

/**
 * The tick's effects, less the housekeeping every run does regardless of what it
 * finds.
 *
 * Every tick sweeps the conversations the clock has run out on, open or not: the
 * boundary has no cheaper way to learn whether any are still standing than to close
 * whatever the cutoffs catch, so the sweep is unconditional and a quiet Ministry
 * gets a `where` clause that matches nothing.
 *
 * Dropped here so that *the tick did nothing about this* stays assertable as an
 * empty list. The sweep has tests of its own -- it is not being hidden, only kept
 * out of assertions that are about something else.
 *
 * It is asserted before it is dropped, and that is the point of doing this here
 * rather than with a bare `filter` at each call site. Every caller follows this with
 * `toEqual([])`, so a filter alone would make those assertions pass just as happily
 * if the tick stopped sweeping altogether, or swept twice. Exactly one, every time.
 */
export const withoutTheSweep = (effects: readonly Effect[]): readonly Effect[] => {
  expect(effects.filter((effect) => effect.kind === 'outstandingReply.sweep')).toHaveLength(1)
  return effects.filter((effect) => effect.kind !== 'outstandingReply.sweep')
}
