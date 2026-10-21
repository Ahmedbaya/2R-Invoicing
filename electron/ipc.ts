import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { ZodError, type ZodType } from 'zod'
import type { Result } from '../shared/types'
import { deleteCategory, deleteClient, deleteProduct, listCategories, listClients, listProducts, saveCategory, saveClient, saveProduct } from './catalog'
import { ping } from './db'
import { deleteInvoice, finalizeInvoice, getInvoice, listInvoices, saveDraft, unlockInvoice } from './invoices'
import { exportInvoicePdf } from './pdf'
import { categorySchema, clientSchema, draftSchema, finalizeSchema, idSchema, productSchema } from './schemas'
import { getDashboardStats } from './dashboard'
import { createBackup, listBackups, openBackupFolder, saveBackupAs } from './backup'

function message(err: unknown): string {
  if (err instanceof ZodError) {
    const i = err.issues[0]
    return `${i.path.join('.') || 'Input'}: ${i.message}`
  }
  const e = err as Error & { code?: string }
  if (e.code === 'ECONNREFUSED' || e.code === 'ETIMEDOUT') return 'Cannot reach the database server.'
  return e.message || 'Unexpected error'
}

// Every channel validates its payload and returns a Result, so the renderer never sees a raw exception.
function handle<I, O>(channel: string, schema: ZodType<I, any, any> | null, fn: (input: I, e: IpcMainInvokeEvent) => Promise<O>) {
  ipcMain.handle(channel, async (e, raw): Promise<Result<O>> => {
    try {
      const input = (schema ? schema.parse(raw) : undefined) as I
      return { ok: true, data: await fn(input, e) }
    } catch (err) {
      console.error(`[ipc:${channel}]`, err)
      return { ok: false, error: message(err) }
    }
  })
}

export function registerIpc() {
  handle('db:ping', null, () => ping())
  handle('clients:list', null, () => listClients())
  handle('clients:save', clientSchema, (c) => saveClient(c))
  handle('clients:delete', idSchema, (id) => deleteClient(id))
  handle('products:list', null, () => listProducts())
  handle('products:save', productSchema, (p) => saveProduct(p))
  handle('categories:list', null, () => listCategories())
  handle('categories:save', categorySchema, (c) => saveCategory(c))
  handle('backup:list', null, () => listBackups())
  handle('backup:now', null, () => createBackup())
  handle('backup:saveAs', null, (_i, e) => saveBackupAs(BrowserWindow.fromWebContents(e.sender)))
  handle('backup:openFolder', null, () => openBackupFolder())
  handle('dashboard:stats', null, () => getDashboardStats())
  handle('categories:delete', idSchema, (id) => deleteCategory(id))
  handle('products:delete', idSchema, (id) => deleteProduct(id))
  handle('invoices:list', null, () => listInvoices())
  handle('invoices:get', idSchema, (id) => getInvoice(id))
  handle('invoices:saveDraft', draftSchema, (d) => saveDraft(d))
  handle('invoices:finalize', finalizeSchema, ({ id, version }) => finalizeInvoice(id, version))
  handle('invoices:unlock', finalizeSchema, ({ id, version }) => unlockInvoice(id, version))
  handle('invoices:delete', idSchema, (id) => deleteInvoice(id))
  handle('invoices:exportPdf', idSchema, async (id, e) =>
    exportInvoicePdf(await getInvoice(id), BrowserWindow.fromWebContents(e.sender)),
  )
}
