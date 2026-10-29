import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { Pool } from 'pg'

const file = () => path.join(app.getPath('userData'), 'config.json')

export function readStoredUrl(): string | null {
  try {
    const cfg = JSON.parse(fs.readFileSync(file(), 'utf8'))
    return cfg.databaseUrl || null
  } catch {
    return null
  }
}

export const isConfigured = () => !!(process.env.DATABASE_URL || readStoredUrl())

/** Tests the link first, and only saves it if it works. */
export async function saveDatabaseUrl(raw: string): Promise<void> {
  const url = raw.trim()
  if (!/^postgres(ql)?:\/\//i.test(url)) throw new Error('The link must start with postgresql://')
  if (/\[YOUR-PASSWORD\]|REGION/.test(url)) throw new Error('The link still contains a placeholder (such as [YOUR-PASSWORD] or REGION). Replace it with the real value.')

  const test = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 30000 })
  test.on('error', () => {})
  try {
    await test.query('SELECT 1')
  } finally {
    await test.end().catch(() => {})
  }
  fs.mkdirSync(path.dirname(file()), { recursive: true })
  fs.writeFileSync(file(), JSON.stringify({ databaseUrl: url }))
}