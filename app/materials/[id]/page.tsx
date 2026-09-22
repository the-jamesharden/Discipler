import { FolderPage } from '../folder'

export const dynamic = 'force-dynamic'

/** One Material's folder, at its own URL. */
export default async function MaterialPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ gender?: string; assignError?: string }>
}) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  return <FolderPage which={{ kind: 'material', id }} gender={query.gender} assignError={query.assignError} />
}
