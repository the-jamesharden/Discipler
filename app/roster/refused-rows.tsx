import { isPairingProblem, type RowRejection } from '~/domain/roster'
import { pairsNotPlanned, rowProblemMessage, rowsNotImported } from './copy'

/**
 * The rows an import refused, listed under two headings because they are two
 * things: a row whose person was not imported, and a row whose person was but
 * whose pair was not planned. One count over both would tell an Admin a person was
 * lost when only the pairing was. Shared by the report the Roster shows after the
 * redirect and the review the dialog shows as the rows are typed, so the two
 * cannot drift apart.
 */
export function RefusedRows({ rejections }: { rejections: readonly RowRejection[] }) {
  const notImported = rejections.filter(({ problem }) => !isPairingProblem(problem))
  const notPlanned = rejections.filter(({ problem }) => isPairingProblem(problem))

  const list = (listed: readonly RowRejection[]) => (
    <ul>
      {listed.map(({ line, problem }) => (
        <li key={`${line}:${problem}`}>{`Line ${line} - ${rowProblemMessage(problem)}`}</li>
      ))}
    </ul>
  )

  return (
    <>
      {notImported.length > 0 ? (
        <>
          <p>{rowsNotImported(notImported.length)}</p>
          {list(notImported)}
        </>
      ) : null}
      {notPlanned.length > 0 ? (
        <>
          <p>{pairsNotPlanned(notPlanned.length)}</p>
          {list(notPlanned)}
        </>
      ) : null}
    </>
  )
}
