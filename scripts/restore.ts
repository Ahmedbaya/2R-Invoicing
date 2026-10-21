import 'dotenv/config'
import fs from 'node:fs'
import { Client } from 'pg'
import { SERIAL_TABLES, TABLES, type BackupFile } from '../electron/backupFormat'

const TRIGGER_TABLES = ['invoices', 'invoice_items', 'invoice_logistics']

async function main() {
  const [file, ...flags] = process.argv.slice(2)
  const force = flags.includes('--force')
  if (!file) throw new Error('Usage: npm run db:restore -- "<path to backup.json>" [--force]')
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set in .env')

  const data = JSON.parse(fs.readFileSync(file, 'utf8')) as BackupFile
  if (data.app !== '2r-invoicing' || data.format !== 1) throw new Error('This is not a valid backup file.')

  const db = new Client({ connectionString: url })
  await db.connect()
  try {
    const applied = (await db.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name as string)
    const missing = data.migrations.filter((m) => !applied.includes(m))
    if (missing.length) throw new Error(`The database is missing migrations: ${missing.join(', ')}. Run "npm run db:migrate" first.`)
    const newer = applied.filter((m) => !data.migrations.includes(m))
    if (newer.length) throw new Error(`This backup was taken before these migrations: ${newer.join(', ')}. Restoring it automatically is not supported. Ask for help.`)

    const existing = (await db.query('SELECT (SELECT count(*) FROM invoices) + (SELECT count(*) FROM clients) + (SELECT count(*) FROM products) AS n')).rows[0].n
    if (Number(existing) > 0 && !force) {
      throw new Error('The database is not empty. Add --force to replace ALL its data with the backup.')
    }

    await db.query('BEGIN')
    try {
      // The immutability triggers would block inserting finalized invoices, so pause them in this transaction only.
      for (const t of TRIGGER_TABLES) await db.query(`ALTER TABLE ${t} DISABLE TRIGGER USER`)
      await db.query(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`)
      for (const t of TABLES) {
        const rows = data.tables[t] ?? []
        if (rows.length) {
          await db.query(`INSERT INTO ${t} SELECT * FROM jsonb_populate_recordset(null::${t}, $1::jsonb)`, [JSON.stringify(rows)])
        }
      }
      for (const t of SERIAL_TABLES) {
        await db.query(
          `SELECT setval(pg_get_serial_sequence('${t}', 'id'), COALESCE((SELECT MAX(id) FROM ${t}), 1), (SELECT MAX(id) FROM ${t}) IS NOT NULL)`,
        )
      }
      for (const t of TRIGGER_TABLES) await db.query(`ALTER TABLE ${t} ENABLE TRIGGER USER`)
      await db.query('COMMIT')
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    }

    for (const t of TABLES) {
      const n = Number((await db.query(`SELECT count(*) AS n FROM ${t}`)).rows[0].n)
      const expected = data.counts[t] ?? 0
      console.log(`${t.padEnd(18)} ${String(n).padStart(6)}  ${n === expected ? 'OK' : `MISMATCH (expected ${expected})`}`)
    }
    console.log('Restore finished.')
  } finally {
    await db.end()
  }
}
main().catch((e) => { console.error(e.message ?? e); process.exit(1) })