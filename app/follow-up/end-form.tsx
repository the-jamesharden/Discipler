import { RELATIONSHIP_OUTCOMES } from '~/domain/relationships'
import { END, ENDING_EXPLANATION, outcomeLabel, REASON_PLACEHOLDER } from './copy'

/**
 * Ending a relationship: the outcome and the reason, both required, behind one
 * press that opens them. The browser's own disclosure, so it opens with script
 * or without. Shared by the Follow-Up items and the pair card (Pastor feedback,
 * ticket 07), which end a relationship through the same route; the card passes
 * `back` so the route returns to it, and draws its press as the quiet link at
 * its foot.
 */
export const EndForm = ({
  relationshipId,
  back,
  summary = END,
  summaryClassName = 'fu-btn danger',
}: {
  readonly relationshipId: string
  /** The page the route returns to, where it is not Follow-Up. */
  readonly back?: string
  readonly summary?: string
  readonly summaryClassName?: string
}) => (
  <details>
    <summary className={summaryClassName}>{summary}</summary>
    <form method="post" action="/follow-up/relationship/end" className="notice" style={{ marginTop: '0.5rem' }}>
      <input type="hidden" name="relationshipId" value={relationshipId} />
      {back ? <input type="hidden" name="back" value={back} /> : null}
      <p>{ENDING_EXPLANATION}</p>
      <div className="field">
        <label className="label" htmlFor={`outcome:${relationshipId}`}>
          Outcome
        </label>
        <select id={`outcome:${relationshipId}`} name="outcome" required defaultValue="">
          <option value="" disabled>
            Choose one
          </option>
          {RELATIONSHIP_OUTCOMES.map((outcome) => (
            <option key={outcome} value={outcome}>
              {outcomeLabel[outcome]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="label" htmlFor={`reason:${relationshipId}`}>
          Reason
        </label>
        <textarea id={`reason:${relationshipId}`} name="reason" required placeholder={REASON_PLACEHOLDER} />
      </div>
      <button type="submit">{END}</button>
    </form>
  </details>
)
