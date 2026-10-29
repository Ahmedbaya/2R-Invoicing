import ExcelJS from 'exceljs'
import { dialog, type BrowserWindow } from 'electron'
import { amountInWordsFr } from '../shared/amountInWords'
import { computeTotals, dec, formatNumber } from '../shared/calc'
import { COMPANY } from '../shared/company'
import type { InvoiceRecord } from '../shared/types'
import { getPool } from './db'

const thin = { style: 'thin' as const }
const border = { top: thin, left: thin, bottom: thin, right: thin }
const frDate = (iso: string) => iso.split('-').reverse().join('/')
const num = (v: string) => Number(dec(v).toFixed())

async function askPath(parent: BrowserWindow | null, defaultName: string): Promise<string | null> {
  const options = { title: 'Save Excel file', defaultPath: defaultName, filters: [{ name: 'Excel', extensions: ['xlsx'] }] }
  const { canceled, filePath } = parent ? await dialog.showSaveDialog(parent, options) : await dialog.showSaveDialog(options)
  return canceled || !filePath ? null : filePath
}

export async function exportInvoiceExcel(inv: InvoiceRecord, parent: BrowserWindow | null): Promise<string | null> {
  const t = computeTotals(inv.items)
  const c = inv.client
  const wb = new ExcelJS.Workbook()
  wb.creator = COMPANY.name
  const ws = wb.addWorksheet('Facture', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  })
  ws.columns = [{ width: 10 }, { width: 14 }, { width: 22 }, { width: 46 }, { width: 16 }, { width: 12 }, { width: 14 }]

  // Company block (left) and client block (right)
  const left = [
    COMPANY.name,
    ...COMPANY.addressLines,
    `${COMPANY.bank}${COMPANY.bankAccount ? ' : ' + COMPANY.bankAccount : ''}`,
    COMPANY.mf,
    COMPANY.rc,
  ]
  left.forEach((text, i) => { ws.getCell(`A${i + 1}`).value = text })
  ws.getCell('A1').font = { bold: true, size: 12 }
  const right = [c?.company_name, c?.address_1, c?.address_2, c?.country, c?.tax_id]
  right.forEach((text, i) => { if (text) ws.getCell(`E${i + 1}`).value = text })
  ws.getCell('E1').font = { bold: true }

  ws.getCell('A8').value = inv.number ? `FACTURE N° ${inv.number} / ${inv.year}` : 'FACTURE (BROUILLON)'
  ws.getCell('A8').font = { bold: true, size: 14 }
  ws.getCell('A9').value = `Date : ${frDate(inv.issue_date)}`

  // Table header
  const HEAD = 11
  ;['Q.TE', 'CODE', 'COMMANDE', 'ARTICOLO', 'CODE DOUANE', 'PRIX', 'TOTAL'].forEach((h, i) => {
    const cell = ws.getCell(HEAD, i + 1)
    cell.value = h
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } }
    cell.border = border
    cell.alignment = { horizontal: i === 0 || i >= 5 ? 'right' : i === 4 ? 'center' : 'left' }
  })
  ws.pageSetup.printTitlesRow = `${HEAD}:${HEAD}`

  // Lines: the total of each line is a real formula
  inv.items.forEach((it, i) => {
    const r = HEAD + 1 + i
    ws.getCell(r, 1).value = num(it.quantity)
    ws.getCell(r, 2).value = it.item_code
    ws.getCell(r, 3).value = it.order_name
    ws.getCell(r, 4).value = it.description
    ws.getCell(r, 5).value = it.customs_code
    ws.getCell(r, 6).value = num(it.unit_price)
    ws.getCell(r, 7).value = { formula: `ROUND(A${r}*F${r},2)`, result: num(t.lines[i]) }
    ws.getCell(r, 6).numFmt = '#,##0.00##'
    ws.getCell(r, 7).numFmt = '#,##0.00'
    ws.getCell(r, 5).alignment = { horizontal: 'center' }
    for (let col = 1; col <= 7; col++) ws.getCell(r, col).border = border
  })

  // Totals row
  const first = HEAD + 1
  const last = Math.max(first, HEAD + inv.items.length)
  const tr = last + 1
  ws.getCell(tr, 1).value = { formula: `SUM(A${first}:A${last})`, result: num(t.totalQuantity) }
  ws.getCell(tr, 6).value = `TOTAL ${inv.currency}`
  ws.getCell(tr, 7).value = { formula: `SUM(G${first}:G${last})`, result: num(t.totalAmount) }
  ws.getCell(tr, 7).numFmt = '#,##0.00'
  for (let col = 1; col <= 7; col++) {
    const cell = ws.getCell(tr, col)
    cell.font = { bold: true }
    cell.border = border
  }

  // Amount in words, VAT note and shipping block
  let row = tr + 2
  const block = (text: string, height?: number, bold = false) => {
    ws.mergeCells(row, 1, row, 7)
    const cell = ws.getCell(row, 1)
    cell.value = text
    cell.alignment = { wrapText: true, vertical: 'top' }
    cell.font = { bold }
    if (height) ws.getRow(row).height = height
    row++
  }
  block(`ARRÊTÉE LA PRÉSENTE FACTURE À LA SOMME DE : ${amountInWordsFr(t.totalAmount)}`, 32, true)
  if (inv.vat_note) block(inv.vat_note)
  const lg = inv.logistics
  row++
  if (lg.customs_declaration) block(lg.customs_declaration)
  if (lg.transporter) block(`TRANSPORTEUR : ${lg.transporter}`)
  if (lg.gross_weight_kg) {
    block(`POIDS BRUT : ${formatNumber(lg.gross_weight_kg)} KG${lg.net_weight_kg ? ` / POIDS NET : ${formatNumber(lg.net_weight_kg)} KG` : ''}`)
  }
  if (lg.pallets != null) block(`NOMBRE DE PALETTES : ${lg.pallets}`)

  const base = inv.number ? `FACTURE_${inv.number}-${inv.year}` : `BROUILLON_${inv.id}`
  const file = await askPath(parent, `${base}.xlsx`)
  if (!file) return null
  await wb.xlsx.writeFile(file)
  return file
}

export async function exportInvoiceListExcel(ids: number[], parent: BrowserWindow | null): Promise<string | null> {
  const { rows } = await getPool().query(
    `SELECT i.number, i.year, i.issue_date, i.status, i.currency, i.total_quantity, i.total_amount,
            COALESCE(i.client_snapshot->>'company_name', c.company_name) AS client_name
       FROM invoices i LEFT JOIN clients c ON c.id = i.client_id
      WHERE i.id = ANY($1::int[])
      ORDER BY i.issue_date, i.number NULLS LAST, i.id`,
    [ids],
  )
  if (rows.length === 0) throw new Error('No invoices to export.')

  const wb = new ExcelJS.Workbook()
  wb.creator = COMPANY.name
  const ws = wb.addWorksheet('Factures')
  ws.columns = [
    { header: 'N° FACTURE', key: 'number', width: 14 },
    { header: 'CLIENT', key: 'client', width: 36 },
    { header: 'DATE', key: 'date', width: 13 },
    { header: 'STATUT', key: 'status', width: 14 },
    { header: 'DEVISE', key: 'currency', width: 9 },
    { header: 'QUANTITÉ', key: 'qty', width: 12 },
    { header: 'TOTAL', key: 'total', width: 15 },
  ]
  for (const r of rows) {
    ws.addRow({
      number: r.number ? `${r.number} / ${r.year}` : 'Brouillon',
      client: r.client_name ?? '',
      date: new Date(`${r.issue_date}T00:00:00Z`),
      status: r.status === 'finalized' ? 'Finalisée' : r.number ? 'En modification' : 'Brouillon',
      currency: r.currency,
      qty: num(String(r.total_quantity)),
      total: num(String(r.total_amount)),
    })
  }
  ws.getColumn('date').numFmt = 'dd/mm/yyyy'
  ws.getColumn('total').numFmt = '#,##0.00'
  const head = ws.getRow(1)
  head.font = { bold: true }
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  ws.autoFilter = { from: 'A1', to: `G${rows.length + 1}` }

  // A single total only makes sense when every invoice uses the same currency.
  if (new Set(rows.map((r) => r.currency)).size === 1) {
    const tr = rows.length + 2
    ws.getCell(`F${tr}`).value = 'TOTAL'
    ws.getCell(`G${tr}`).value = { formula: `SUBTOTAL(109,G2:G${rows.length + 1})`, result: rows.reduce((s, r) => s + num(String(r.total_amount)), 0) }
    ws.getCell(`G${tr}`).numFmt = '#,##0.00'
    ws.getRow(tr).font = { bold: true }
  }

  const file = await askPath(parent, `Liste_factures_${new Date().toISOString().slice(0, 10)}.xlsx`)
  if (!file) return null
  await wb.xlsx.writeFile(file)
  return file
}