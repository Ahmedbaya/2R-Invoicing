import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { Pool, types, type PoolClient } from 'pg'

types.setTypeParser(1082, (v) => v) // keep DATE as 'yyyy-mm-dd' string (no timezone shifts)

let pool: Pool | null = null

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const file = path.join(app.getPath('userData'), 'config.json')
  if (fs.existsSync(file)) {
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (cfg.databaseUrl) return cfg.databaseUrl
  }
  throw new Error(`Database not configured. Create ${file} with {"databaseUrl": "postgres://user:pass@host:5432/invoicing"}`)
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: databaseUrl(), max: 5, connectionTimeoutMillis: 5000 })
    pool.on('error', (e) => console.error('Idle PG client error', e))
  }
  return pool
}

export async function withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await getPool().connect()
  try {
    await c.query('BEGIN')
    const out = await fn(c)
    await c.query('COMMIT')
    return out
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    c.release()
  }
}

export async function ping(): Promise<true> {
  try {
    await getPool().query('SELECT 1')
    return true
  } catch (e) {
    throw new Error(`Cannot reach the database. ${(e as Error).message}`)
  }
}
