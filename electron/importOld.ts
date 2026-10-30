import fs from 'node:fs/promises'
import path from 'node:path'
import { BrowserWindow, dialog, type OpenDialogOptions } from 'electron'
import ExcelJS from 'exceljs'
import { computeTotals, dec } from '../shared/calc'
import { decodeText, parseCsv } from '../shared/csv'
import {
  clean, emptyParsed, isProductSuffix, makeCtx, norm, parseOldInvoice, resolveLine,
  type ParsedOld, type ProductRef,
} from '../shared/oldInvoice'
import type { Client, OldImportFile, OldImportPreview, OldImportResult, OldImportRules, OldReviewLine } from '../shared/types'
import { getPool, withTx } from './db'

interface Loaded { file: string; parsed: ParsedOld }
let loaded: Loaded[] = []

const clientKey = (name: string) => norm(name).replace(/[^A-Z0-9]/g, '')

async function readRows(file: string): Promise<string[][]> {
  if (/\.xlsx$/i.test(file)) {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.readFile(file)
    const ws = wb.worksheets[0]
    if (!ws) throw new Error('The workbook has no sheet')
    const rows: string[][] = []
    ws.eachRow({ includeEmpty: true }, (row, n) => {
      const arr: string[] = []
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        if (cell.isMerged && cell.master.address !== cell.address) return // merged cells repeat the same text
        arr[col - 1] = cell.text ?? ''
      })
      rows[n - 1] = Array.from(arr, (v) => v ?? '')
    })
    return Array.from(rows, (r) => r ?? [])
  }
  return parseCsv(decodeText(await fs.readFile(file)))
}

interface PlanItem {
  product_id: number | null
  item_code: string
  order_name: string
  customs_code: string
  description: string
  quantity: string
  unit_price: string
  line_total: string
  vkey: string | null // set when the product was typed manually in the preview
}
interface Plan {
  file: string
  parsed: ParsedOld
  client: Client | null
  clientKey: string
  items: PlanItem[]
  status: 'ok' | 'duplicate' | 'error'
  preview: OldImportFile
}

async function buildPlan(rules: OldImportRules): Promise<{ plans: Plan[]; virtuals: Map<string, ProductRef>; preview: OldImportPreview }> {
  if (loaded.length === 0) throw new Error('Choose the files first.')
  const db = getPool()
  const [cl, pr, iv] = await Promise.all([
    db.query('SELECT id, company_name, address_1, address_2, country, tax_id FROM clients'),
    db.query('SELECT p.id, p.code, p.name, c.customs_code FROM products p LEFT JOIN categories c ON c.id = p.category_id'),
    db.query('SELECT client_id, year, number FROM invoices WHERE number IS NOT NULL'),
  ])
  const clientByKey = new Map<string, Client>()
  for (const c of cl.rows as Client[]) clientByKey.set(clientKey(c.company_name), c)
  const existing = new Set<string>((iv.rows as { client_id: number | null; year: number; number: number }[]).map((r) => `${r.client_id}|${r.year}|${r.number}`))

  // Products from your list, plus the ones typed manually in the preview.
  const catalog = pr.rows as ProductRef[]
  const catalogNames = new Set(catalog.map((c) => norm(c.name)))
  const virtuals = new Map<string, ProductRef>()
  for (const e of rules.manual) {
    const name = clean(e.name)
    const k = norm(name)
    if (!k || !isProductSuffix(e.text, name) || catalogNames.has(k) || virtuals.has(k)) continue
    virtuals.set(k, { id: null, code: clean(e.code) || null, name, customs_code: clean(e.customs_code) || null, manual: true, add: e.add })
  }
  const ctx = makeCtx([...catalog, ...virtuals.values()])

  const batchKeys = new Set<string>()
  const review = new Map<string, OldReviewLine>()
  let matchedTotal = 0
  let manualTotal = 0
  let unmatchedTotal = 0
  const plans: Plan[] = []

  for (const l of loaded) {
    const p = l.parsed
    const problems = [...p.errors]
    const warnings: string[] = []
    if (!p.number || !p.year) problems.push('Invoice number not found (expected "FACTURE N° 79 / 2026")')
    if (!p.date) problems.push('Invoice date not found (expected "DATE LE 16/10/2026")')
    if (!p.client_name) problems.push('Client not found (expected "CLIENT: NAME")')
    if (p.items.length === 0 && p.errors.length === 0) problems.push('No invoice lines found')
    if (p.skipped_no_qty) warnings.push(`${p.skipped_no_qty} line(s) without quantity were skipped`)
    if (p.date && p.year && Number(p.date.slice(0, 4)) !== p.year) {
      warnings.push(`The date is in ${p.date.slice(0, 4)} but the number says ${p.year}`)
    }

    const resolved = p.items.map((it) => ({ it, r: resolveLine(it.text, ctx) }))
    const items: PlanItem[] = resolved.map(({ it, r }) => ({
      product_id: r.product?.id ?? null,
      item_code: r.product?.code ?? '',
      order_name: r.order_name,
      customs_code: r.customs_code,
      description: r.description,
      quantity: it.quantity,
      unit_price: it.unit_price,
      line_total: '0',
      vkey: r.product?.manual ? norm(r.product.name) : null,
    }))
    const t = computeTotals(items)
    items.forEach((x, i) => { x.line_total = t.lines[i] })
    if (p.declared_total && !dec(p.declared_total).equals(dec(t.totalAmount))) {
      warnings.push(`Computed total ${t.totalAmount} differs from the total in the file (${p.declared_total})`)
    }

    const ck = p.client_name ? clientKey(p.client_name) : ''
    const client = ck ? clientByKey.get(ck) ?? null : null
    let status: Plan['status'] = problems.length ? 'error' : 'ok'
    if (status === 'ok') {
      const dupKey = `${client?.id ?? 'new:' + ck}|${p.year}|${p.number}`
      if ((client && existing.has(dupKey)) || batchKeys.has(dupKey)) {
        status = 'duplicate'
        problems.push(`Invoice ${p.number} / ${p.year} already exists for this client`)
      }
      batchKeys.add(dupKey)
    }

    if (status === 'ok') {
      for (const { it, r } of resolved) {
        const state: 'none' | 'manual' | 'catalog' = !r.product ? 'none' : r.product.manual ? 'manual' : 'catalog'
        if (state === 'catalog') matchedTotal++
        else {
          if (state === 'manual') manualTotal++
          else unmatchedTotal++
          const k = norm(it.text)
          const cur = review.get(k)
          if (cur) cur.count++
          else review.set(k, { text: clean(it.text), count: 1, state })
        }
      }
    }

    plans.push({
      file: l.file, parsed: p, client, clientKey: ck, items, status,
      preview: {
        file: l.file, number: p.number, year: p.year, date: p.date, client: p.client_name,
        client_state: !p.client_name ? 'unknown' : client ? 'existing' : 'new',
        lines: items.length, total: t.totalAmount, status, problems, warnings,
        unmatched: resolved.filter(({ r }) => !r.product).length,
      },
    })
  }

  const newClients = new Map<string, string>()
  for (const p of plans) if (p.status === 'ok' && !p.client && p.parsed.client_name) newClients.set(p.clientKey, p.parsed.client_name)
  const rank = (s: OldReviewLine['state']) => (s === 'none' ? 0 : 1)

  return {
    plans,
    virtuals,
    preview: {
      files: plans.map((p) => p.preview),
      ok: plans.filter((p) => p.status === 'ok').length,
      duplicates: plans.filter((p) => p.status === 'duplicate').length,
      errors: plans.filter((p) => p.status === 'error').length,
      new_clients: [...newClients.values()],
      review: [...review.values()].sort((a, b) => rank(a.state) - rank(b.state) || b.count - a.count).slice(0, 300),
      matched_total: matchedTotal,
      manual_total: manualTotal,
      unmatched_total: unmatchedTotal,
    },
  }
}

export async function chooseOldInvoices(parent: BrowserWindow | null, rules: OldImportRules): Promise<OldImportPreview | null> {
  const opts: OpenDialogOptions = {
    title: 'Choose the old invoices (Excel or CSV)',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Excel / CSV', extensions: ['xlsx', 'csv'] }],
  }
  const picked = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts)
  if (picked.canceled || picked.filePaths.length === 0) return null
  if (picked.filePaths.length > 300) throw new Error('Choose at most 300 files at a time.')

  const out: Loaded[] = []
  for (const file of picked.filePaths) {
    try {
      out.push({ file: path.basename(file), parsed: parseOldInvoice(await readRows(file)) })
    } catch (e) {
      out.push({ file: path.basename(file), parsed: emptyParsed([`Cannot read this file: ${(e as Error).message}`]) })
    }
  }
  loaded = out
  return (await buildPlan(rules)).preview
}

export async function previewOldInvoices(rules: OldImportRules): Promise<OldImportPreview> {
  return (await buildPlan(rules)).preview
}

export async function applyOldInvoices(rules: OldImportRules): Promise<OldImportResult> {
  const { plans, virtuals } = await buildPlan(rules)
  const todo = plans.filter((p) => p.status === 'ok')
  if (todo.length === 0) throw new Error('Nothing to import.')
  const db = getPool()

  // 1. Create the clients that do not exist yet (kept even if an invoice fails later).
  const created = new Map<string, Client>()
  for (const p of todo) {
    if (p.client || created.has(p.clientKey)) continue
    const r = (
      await db.query(
        `INSERT INTO clients (company_name, address_1, address_2, country) VALUES ($1,$2,$3,$4)
         RETURNING id, company_name, address_1, address_2, country, tax_id`,
        [p.parsed.client_name, p.parsed.address_1, p.parsed.address_2, p.parsed.country],
      )
    ).rows[0] as Client
    created.set(p.clientKey, r)
  }

  // 2. Add the manually typed products to the Products list (when "Add to products" is ticked and a code is given).
  const firstPrice = new Map<string, string>()
  for (const p of todo) for (const it of p.items) if (it.vkey && !firstPrice.has(it.vkey)) firstPrice.set(it.vkey, it.unit_price)
  const productIds = new Map<string, number>()
  for (const [vk, price] of firstPrice) {
    const v = virtuals.get(vk)
    if (!v || !v.add || !v.code) continue
    const r = await db.query(
      `INSERT INTO products (code, name, description, category_id, default_price)
       VALUES ($1, $2, '', (SELECT id FROM categories WHERE customs_code = $3 ORDER BY id LIMIT 1), $4)
       ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
       RETURNING id`,
      [v.code, v.name, v.customs_code, price],
    )
    productIds.set(vk, r.rows[0].id)
  }
  const productOf = (i: PlanItem) => i.product_id ?? (i.vkey ? productIds.get(i.vkey) ?? null : null)

  // 3. One transaction per invoice, so one bad file never blocks the others.
  let imported = 0
  let skipped = 0
  const failed: { file: string; message: string }[] = []
  for (const p of todo) {
    const client = (p.client ?? created.get(p.clientKey))!
    const x = p.parsed
    try {
      await withTx(async (c) => {
        const t = computeTotals(p.items)
        const id = (
          await c.query(
            `INSERT INTO invoices (client_id, issue_date, currency, vat_note, total_amount, total_quantity, created_by, number, year)
             VALUES ($1,$2,'EUR','',$3,$4,'import',$5,$6) RETURNING id`,
            [client.id, x.date, t.totalAmount, t.totalQuantity, x.number, x.year],
          )
        ).rows[0].id as number

        await c.query(
          `INSERT INTO invoice_items (invoice_id, position, product_id, item_code, order_name, customs_code, description, quantity, unit_price, line_total)
           SELECT $1::int, * FROM unnest($2::int[], $3::int[], $4::text[], $5::text[], $6::text[], $7::text[], $8::numeric[], $9::numeric[], $10::numeric[])`,
          [
            id,
            p.items.map((_, i) => i),
            p.items.map(productOf),
            p.items.map((i) => i.item_code),
            p.items.map((i) => i.order_name),
            p.items.map((i) => i.customs_code),
            p.items.map((i) => i.description),
            p.items.map((i) => i.quantity),
            p.items.map((i) => i.unit_price),
            p.items.map((i) => i.line_total),
          ],
        )
        await c.query(
          `INSERT INTO invoice_logistics (invoice_id, customs_declaration, transporter, gross_weight_kg, net_weight_kg, pallets)
           VALUES ($1,$2,$3,$4,NULL,$5)`,
          [id, x.origin, x.transporter, x.gross_weight || null, x.pallets],
        )
        // Items are added while the invoice is a draft (finalized invoices are locked), then it is finalized.
        await c.query(
          `UPDATE invoices SET status='finalized', client_snapshot=$2, finalized_at=now(), version=version+1, updated_at=now() WHERE id=$1`,
          [id, client],
        )
      })
      imported++
    } catch (e) {
      if ((e as { code?: string }).code === '23505') skipped++
      else failed.push({ file: p.file, message: (e as Error).message })
    }
  }
  loaded = []
  return { imported, skipped, failed }
}