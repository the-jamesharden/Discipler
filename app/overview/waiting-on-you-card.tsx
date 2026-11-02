import Link from 'next/link'
import { isAnybodyWaiting } from '~/domain/waiting-on-you'
import type { OverviewWaiting } from '~/service/ports'
import { People } from '../icons'
import { UnpairedPopUp } from './unpaired-pop-up'
import { theCard, WAITING_ON_YOU } from './waiting-on-you'

/**
 * The unpaired pop-up (Exponential launch, ticket 29), as mock-up 3 draws it
 * (`.lavish/onboarding/s6-popup.html`): headed *Waiting on you*, a line for each
 * count above zero, and a button for each. Nothing at all while nobody is
 * waiting. Whether it is on screen is `UnpairedPopUp`'s to decide.
 */
export const WaitingOnYouCard = ({ waiting }: { readonly waiting: OverviewWaiting }) => {
  if (!isAnybodyWaiting(waiting.waiting)) return null
  const { lines, actions } = theCard(waiting.waiting)
  return (
    <UnpairedPopUp showing={waiting.showing} label={WAITING_ON_YOU.label} dismiss={WAITING_ON_YOU.dismiss}>
      <p className="unpaired-head">
        <People />
        {WAITING_ON_YOU.head}
      </p>
      {lines.map((line) => (
        <p key={line.rest} className="line">
          <strong>{line.lead}</strong>
          {line.rest}
        </p>
      ))}
      <div className="acts">
        {actions.map((action) => (
          <Link key={action.href} className={action.primary ? 'btn' : 'btn sec'} href={action.href}>
            {action.label}
          </Link>
        ))}
      </div>
    </UnpairedPopUp>
  )
}
