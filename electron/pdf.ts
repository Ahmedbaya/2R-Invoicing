import fs from 'node:fs/promises'
import { BrowserWindow, dialog } from 'electron'
import { renderInvoiceHtml } from '../shared/invoiceHtml'
import type { InvoiceRecord } from '../shared/types'

/** Renders the invoice in a hidden window, prints to A4 PDF, then asks where to save it. */
export async function exportInvoicePdf(inv: InvoiceRecord, parent: BrowserWindow | null): Promise<string | null> {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } })
  let pdf: Buffer
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(renderInvoiceHtml(inv)))
    pdf = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true, preferCSSPageSize: true })
  } finally {
    win.destroy()
  }
  const base = inv.number ? `FACTURE_${inv.number}-${inv.year}` : `BROUILLON_${inv.id}`
  const options = { title: 'Save invoice PDF', defaultPath: `${base}.pdf`, filters: [{ name: 'PDF', extensions: ['pdf'] }] }
  const { canceled, filePath } = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
  if (canceled || !filePath) return null
  await fs.writeFile(filePath, pdf)
  return filePath
}
