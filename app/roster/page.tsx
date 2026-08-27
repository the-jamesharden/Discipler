import { redirect } from 'next/navigation'
import { currentAdmin } from '~/platform/supabase/current-admin'
import { createSupabaseServerClient } from '~/platform/supabase/server-client'
import { getRosterReader } from '~/service/container'

export const dynamic = 'force-dynamic'

const NotAnAdmin = () => (
  <main>
    <h1>Roster</h1>
    <p className="subtle">Discipler</p>
    <div className="panel">
      <p className="empty">
        This account is not an Admin of a Ministry. Ask whoever invited you to add
        you to yours.
      </p>
    </div>
  </main>
)

export default async function RosterPage() {
  const admin = await currentAdmin()

  if (!admin) {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // Signed in but not an Admin. Sending them back to sign in would only loop.
    if (user) return <NotAnAdmin />

    redirect('/login')
  }

  const roster = await getRosterReader().listRoster(admin.ministryId)

  return (
    <main>
      <h1>Roster</h1>
      <p className="subtle">{admin.ministryName}</p>

      <div className="panel">
        {roster.length === 0 ? (
          <p className="empty">Nobody is on this Roster yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>With</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((person) => (
                <tr key={person.personId}>
                  <td>{person.fullName}</td>
                  {/* A relationship with several Participants shows everyone in it,
                      so group membership is visible without opening a record. */}
                  <td>
                    {person.withNames.length === 0 ? (
                      <span className="empty">Not in a relationship</span>
                    ) : (
                      person.withNames.join(', ')
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  )
}
