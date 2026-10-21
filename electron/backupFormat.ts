import type { PoolClient } from 'pg'

// Order matters for restoring (parents before children).
export const TABLES = ['categories', 'clients', 'products', 'invoice_counters', 'invoices', 'invoice_items', 'invoice_logistics'] as const
export const SERIAL_TABLES = ['categories', 'clients', 'products', 'invoices', 'invoice_items'] as const

export interface BackupFile {
  app: '2r-invoicing'
  format: 1
  created_at: string
  migrations: string[]
  counts: Record<string, number>
  tables: Record<string, unknown[]>
}

/** Reads every table inside one consistent snapshot. */
export async function dumpDatabase(db: Pick<PoolClient, 'query'>): Promise<BackupFile> {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
  try {
    const tables: Record<string, unknown[]> = {}
    const counts: Record<string, number> = {}
    for (const t of TABLES) {
      const { rows } = await db.query(`SELECT to_jsonb(x) AS r FROM ${t} x`)
      tables[t] = rows.map((r) => r.r)
      counts[t] = rows.length
    }
    const migrations = (await db.query('SELECT name FROM schema_migrations ORDER BY name')).rows.map((r) => r.name as string)
    return { app: '2r-invoicing', format: 1, created_at: new Date().toISOString(), migrations, counts, tables }
  } finally {
    await db.query('COMMIT')
  }
}