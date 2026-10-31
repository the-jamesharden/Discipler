import { STILL_STUCK } from './copy'

/** The line under every help page and the list, with the support address as a link. */
export const StillStuck = () => (
  <p className="help-foot">
    {STILL_STUCK.before}
    <a href={`mailto:${STILL_STUCK.email}`}>{STILL_STUCK.email}</a>
    {STILL_STUCK.after}
  </p>
)
