import { RELATIONSHIP_OUTCOMES } from '~/domain/relationships'
import { END, ENDING_EXPLANATION, outcomeLabel, REASON_PLACEHOLDER } from './copy'

/**
 * Ending a relationship: the outcome and the reason, both required, behind one
 * press that opens them. The browser's own disclosure, so it opens with script
 * or without. Drawn at the foot of the pair card (Pastor feedback, ticket 07),
 * as the quiet link that is the one place a relationship is ended from since
 * Follow-Up's items became buttons that open the card (ticket 10); the card
 * passes `back` so the route returns to it.
 */
export const EndForm = ({
  relationshipId,
  back,
  summary = END,
  summaryClassName,
}: {
  readonly relationshipId: string
  /** The card the route returns to. */
  readonly back: string
  readonly summary?: string
  readonly summaryClassName: string
}) => (
  <details>
    <summary className={summaryClassName}>{summary}</summary>
    <form method="post" action="/follow-up/relationship/end" className="notice" style={{ marginTop: '0.5rem' }}>
      <input type="hidden" name="relationshipId" value={relationshipId} />
      <input type="hidden" name="back" value={back} />
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
