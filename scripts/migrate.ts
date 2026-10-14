import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'

async function main() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set')
  const db = new Client({ connectionString: url })
  await db.connect()
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())')
  const dir = path.resolve(__dirname, '../migrations')
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    const done = await db.query('SELECT 1 FROM schema_migrations WHERE name = $1', [f])
    if (done.rowCount) continue
    console.log('Applying', f)
    try {
      await db.query('BEGIN')
      await db.query(fs.readFileSync(path.join(dir, f), 'utf8'))
      await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f])
      await db.query('COMMIT')
    } catch (e) {
      await db.query('ROLLBACK')
      throw e
    }
  }
  await db.end()
  console.log('Migrations up to date.')
}
main().catch((e) => { console.error(e); process.exit(1) })
