import fs from 'node:fs/promises'
import path from 'node:path'
import { app, BrowserWindow, dialog, shell } from 'electron'
import type { BackupInfo, BackupList } from '../shared/types'
import { dumpDatabase } from './backupFormat'
import { getPool } from './db'

const KEEP = 30
const FILE_RE = /^backup_.*\.json$/
const backupDir = () => path.join(app.getPath('documents'), '2R Invoicing Backups')

const pad = (n: number) => String(n).padStart(2, '0')
const fileName = (d = new Date()) =>
  `backup_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}.json`

async function info(file: string): Promise<BackupInfo> {
  const st = await fs.stat(file)
  return { name: path.basename(file), path: file, size: st.size, modified: st.mtime.toISOString() }
}

// Writes to a temporary file first, so a crash never leaves a half-written backup.
async function writeBackup(file: string): Promise<BackupInfo> {
  const client = await getPool().connect()
  let json: string
  try {
    json = JSON.stringify(await dumpDatabase(client))
  } finally {
    client.release()
  }
  const tmp = file + '.tmp'
  await fs.writeFile(tmp, json, 'utf8')
  await fs.rename(tmp, file)
  return info(file)
}

export async function listBackups(): Promise<BackupList> {
  const dir = backupDir()
  await fs.mkdir(dir, { recursive: true })
  const names = (await fs.readdir(dir)).filter((n) => FILE_RE.test(n)).sort().reverse()
  return { dir, files: await Promise.all(names.map((n) => info(path.join(dir, n)))) }
}

export async function createBackup(): Promise<BackupInfo> {
  const dir = backupDir()
  await fs.mkdir(dir, { recursive: true })
  const result = await writeBackup(path.join(dir, fileName()))
  // Keep only the newest copies.
  const names = (await fs.readdir(dir)).filter((n) => FILE_RE.test(n)).sort().reverse()
  for (const old of names.slice(KEEP)) await fs.rm(path.join(dir, old), { force: true })
  return result
}

export async function saveBackupAs(parent: BrowserWindow | null): Promise<string | null> {
  const options = {
    title: 'Save backup copy',
    defaultPath: path.join(app.getPath('documents'), fileName()),
    filters: [{ name: 'Backup', extensions: ['json'] }],
  }
  const { canceled, filePath } = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
  if (canceled || !filePath) return null
  await writeBackup(filePath)
  return filePath
}

export async function openBackupFolder(): Promise<true> {
  const dir = backupDir()
  await fs.mkdir(dir, { recursive: true })
  await shell.openPath(dir)
  return true
}

/** One automatic backup per day per computer, checked every 6 hours while the app is open. */
export function startAutoBackup() {
  const tick = async () => {
    try {
      const { files } = await listBackups()
      const today = new Date().toDateString()
      if (!files.some((f) => new Date(f.modified).toDateString() === today)) await createBackup()
    } catch (e) {
      console.error('[backup] automatic backup failed:', e)
    }
  }
  setTimeout(tick, 15000)
  setInterval(tick, 6 * 60 * 60 * 1000)
}