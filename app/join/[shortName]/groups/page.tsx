import { openTheForm, type JoinQuery } from '../../opening'

export const dynamic = 'force-dynamic'

/** The groups form, at the Ministry's short name and `/groups`. See `../../opening.ts`. */
export default async function JoinGroupsPage({
  params,
  searchParams,
}: {
  params: Promise<{ shortName: string }>
  searchParams: Promise<JoinQuery>
}) {
  return openTheForm((await params).shortName, await searchParams, 'groups')
}
