import { openTheForm, type JoinQuery } from '../opening'

export const dynamic = 'force-dynamic'

/** The mentor and mentee form, at the Ministry's short name. See `../opening.ts`. */
export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ shortName: string }>
  searchParams: Promise<JoinQuery>
}) {
  return openTheForm((await params).shortName, await searchParams, 'mentor-and-mentee')
}
