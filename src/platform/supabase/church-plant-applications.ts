import pg from 'pg'
import type { PlantApplication, PlantDecision } from '~/domain/church-plant'
import type { ChurchPlantApplications } from '~/service/ports'

/**
 * Church-plant applications for the operator's command (Exponential launch, ticket 19),
 * read across churches on the trusted connection, as the Setup Link is. A browser has no
 * way to these: no role a session holds has any grant on the table.
 *
 * The address comes from the account, whichever account of the church has one, because
 * only an Admin who signed up has one (`supabaseAccounts.create`). It is read here rather
 * than kept on the application, so there is one address and it is the current one.
 */
export interface PostgresChurchPlantApplications extends ChurchPlantApplications {
  close(): Promise<void>
}

const SELECT = `
  select a.*, m.name as church_name, m.timezone as church_timezone,
         (select u.email
            from ministry_member mm
            join auth.users u on u.id = mm.user_id
           where mm.ministry_id = a.ministry_id and mm.tier = 'admin' and u.email is not null
           order by mm.created_at
           limit 1) as admin_email
    from church_plant_application a
    join ministry m on m.id = a.ministry_id`

const applicationOf = (row: Readonly<Record<string, unknown>>): PlantApplication => ({
  id: String(row.id),
  churchId: String(row.ministry_id),
  churchName: String(row.church_name),
  timezone: String(row.church_timezone),
  adminEmail: typeof row.admin_email === 'string' ? row.admin_email : null,
  answers: {
    launchDate: String(row.launch_date),
    sendingChurch: String(row.sending_church),
    averageAttendance: String(row.average_attendance),
    leadPastor: String(row.lead_pastor),
    anythingElse: typeof row.anything_else === 'string' ? row.anything_else : null,
  },
  appliedAt: row.applied_at as Date,
  decision: row.decision as PlantDecision | null,
  decidedAt: row.decided_at as Date | null,
})

export const createPostgresChurchPlantApplications = (
  connectionString: string,
): PostgresChurchPlantApplications => {
  const pool = new pg.Pool({ connectionString })

  return {
    async find(applicationId) {
      // As text, so an ID mistyped at a terminal is one that is not found, not a fault.
      const { rows } = await pool.query(`${SELECT} where a.id::text = lower($1)`, [applicationId.trim()])
      return rows[0] ? applicationOf(rows[0]) : null
    },

    async undecided() {
      const { rows } = await pool.query(`${SELECT} where a.decision is null order by a.applied_at, a.id`)
      return rows.map(applicationOf)
    },

    close: () => pool.end(),
  }
}
