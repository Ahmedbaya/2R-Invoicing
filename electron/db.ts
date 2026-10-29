import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { Pool, types, type PoolClient } from 'pg'
import { readStoredUrl } from './config'

types.setTypeParser(1082, (v) => v) // keep DATE as 'yyyy-mm-dd' string (no timezone shifts)

let pool: Pool | null = null

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const stored = readStoredUrl()
  if (stored) return stored
  throw new Error('Database not configured. Open "Database settings" and paste your database link.')
}
export function resetPool() {
  pool?.end().catch(() => {})
  pool = null
}
export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl(),
      max: 3, // fewer parallel handshakes on a slow link
      connectionTimeoutMillis: 30000, // was 5000
      idleTimeoutMillis: 60000,
      keepAlive: true,
    })
    pool.on('error', (e) => console.error('Idle PG client error', e))
    // Without a listener on each connection, a reset during a query crashes the whole app.
    pool.on('connect', (client) => client.on('error', (e) => console.error('PG client error', e.message)))
  }
  return pool
}

export async function withTx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await getPool().connect()
  let broken = false
  const onError = () => { broken = true }
  c.on('error', onError)
  try {
    await c.query('BEGIN')
    const out = await fn(c)
    await c.query('COMMIT')
    return out
  } catch (e) {
    broken = broken || ['ECONNRESET', 'ETIMEDOUT', 'EPIPE'].includes((e as { code?: string }).code ?? '')
    if (!broken) await c.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    c.removeListener('error', onError)
    c.release(broken) // true = throw this connection away instead of reusing it
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
