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
 */
export const withoutTheSweep = (effects: readonly Effect[]): readonly Effect[] =>
  effects.filter((effect) => effect.kind !== 'outstandingReply.sweep')
