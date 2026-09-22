import { FolderPage } from '../folder'

export const dynamic = 'force-dynamic'

/**
 * The "No material assigned" folder: the accepted relationships still on their
 * opening period, or un-assigned since. Where first assignments happen, under
 * ticket 03.
 */
export default async function NoMaterialPage({
  searchParams,
}: {
  searchParams: Promise<{ gender?: string; assignError?: string }>
}) {
  const query = await searchParams
  return <FolderPage which={{ kind: 'none' }} gender={query.gender} assignError={query.assignError} />
}
