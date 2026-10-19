import type { z } from 'zod'
import { computeTotals, dec } from '../shared/calc'
import type { Client, InvoiceListRow, InvoiceRecord } from '../shared/types'
import { getPool, withTx } from './db'
import type { draftSchema } from './schemas'

type Draft = z.infer<typeof draftSchema>
const norm = (v: unknown) => (v === null || v === undefined ? '' : dec(v as string).toFixed())

export async function listInvoices(): Promise<InvoiceListRow[]> {
  const { rows } = await getPool().query(
    `SELECT i.id, i.status, i.number, i.year, i.issue_date, i.total_amount, i.currency,
            COALESCE(i.client_snapshot->>'company_name', c.company_name) AS client_name
       FROM invoices i LEFT JOIN clients c ON c.id = i.client_id
      ORDER BY i.year DESC NULLS FIRST, i.number DESC NULLS FIRST, i.id DESC LIMIT 300`,
  )
  return rows
}

export async function getInvoice(id: number): Promise<InvoiceRecord> {
  const db = getPool()
  const r = (await db.query('SELECT * FROM invoices WHERE id=$1', [id])).rows[0]
  if (!r) throw new Error('Invoice not found')
  let client: Client | null = r.status === 'finalized' ? r.client_snapshot : null
  if (!client && r.client_id) {
    client = (await db.query('SELECT id, company_name, address_1, address_2, country, tax_id FROM clients WHERE id=$1', [r.client_id])).rows[0] ?? null
  }
  const items = (
    await db.query('SELECT id, product_id, item_code, order_name, customs_code, description, quantity, unit_price, line_total FROM invoice_items WHERE invoice_id=$1 ORDER BY position', [id])
  ).rows.map((i) => ({ ...i, quantity: norm(i.quantity), unit_price: norm(i.unit_price) }))
  const lg = (await db.query('SELECT * FROM invoice_logistics WHERE invoice_id=$1', [id])).rows[0]
  return {
    id: r.id,
    status: r.status,
    number: r.number,
    year: r.year,
    version: r.version,
    client_id: r.client_id,
    client,
    issue_date: r.issue_date,
    currency: r.currency,
    vat_note: r.vat_note,
    created_by: r.created_by,
    items,
    logistics: {
      customs_declaration: lg?.customs_declaration ?? '',
      transporter: lg?.transporter ?? '',
      gross_weight_kg: norm(lg?.gross_weight_kg),
      net_weight_kg: norm(lg?.net_weight_kg),
      pallets: lg?.pallets ?? null,
    },
    total_amount: r.total_amount,
    total_quantity: norm(r.total_quantity),
  }
}

export async function saveDraft(d: Draft): Promise<InvoiceRecord> {
  const totals = computeTotals(d.items)
  const id = await withTx(async (c) => {
    let invoiceId = d.id
    const head = [d.client_id, d.issue_date, d.currency, d.vat_note, totals.totalAmount, totals.totalQuantity, d.created_by]
    if (invoiceId) {
      const cur = (await c.query('SELECT status, version, year FROM invoices WHERE id=$1 FOR UPDATE', [invoiceId])).rows[0]
      if (!cur) throw new Error('Invoice not found')
      if (cur.status !== 'draft') throw new Error('This invoice is finalized and can no longer be edited.')
      if (cur.version !== d.version) throw new Error('Someone else changed this draft. Reload it to see their changes.')
      if (cur.year && Number(d.issue_date.slice(0, 4)) !== cur.year) {
        throw new Error(`This invoice is numbered in ${cur.year}, so its date must stay in ${cur.year}.`)
      }
      await c.query(
        `UPDATE invoices SET client_id=$2, issue_date=$3, currency=$4, vat_note=$5, total_amount=$6, total_quantity=$7,
                created_by=$8, version=version+1, updated_at=now() WHERE id=$1`,
        [invoiceId, ...head],
      )
      await c.query('DELETE FROM invoice_items WHERE invoice_id=$1', [invoiceId])
    } else {
      invoiceId = (
        await c.query(
          `INSERT INTO invoices (client_id, issue_date, currency, vat_note, total_amount, total_quantity, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          head,
        )
      ).rows[0].id
    }
    for (const [pos, it] of d.items.entries()) {
      await c.query(
        `INSERT INTO invoice_items (invoice_id, position, product_id, item_code, order_name, customs_code, description, quantity, unit_price, line_total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [invoiceId, pos, it.product_id, it.item_code, it.order_name, it.customs_code, it.description, dec(it.quantity).toFixed(), dec(it.unit_price).toFixed(), totals.lines[pos]],
      )
    }
    const lg = d.logistics
    await c.query(
      `INSERT INTO invoice_logistics (invoice_id, customs_declaration, transporter, gross_weight_kg, net_weight_kg, pallets)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (invoice_id) DO UPDATE SET customs_declaration=EXCLUDED.customs_declaration, transporter=EXCLUDED.transporter,
         gross_weight_kg=EXCLUDED.gross_weight_kg, net_weight_kg=EXCLUDED.net_weight_kg, pallets=EXCLUDED.pallets`,
      [invoiceId, lg.customs_declaration, lg.transporter, lg.gross_weight_kg ? dec(lg.gross_weight_kg).toFixed() : null, lg.net_weight_kg ? dec(lg.net_weight_kg).toFixed() : null, lg.pallets],
    )
    return invoiceId!
  })
  return getInvoice(id)
}

/** Assigns the next gap-free number for the invoice's year and freezes the client data. */
export async function finalizeInvoice(id: number, version: number): Promise<InvoiceRecord> {
  await withTx(async (c) => {
    const cur = (await c.query('SELECT status, version, client_id, issue_date, number, year FROM invoices WHERE id=$1 FOR UPDATE', [id])).rows[0]
    if (!cur) throw new Error('Invoice not found')
    if (cur.status !== 'draft') throw new Error('This invoice is already finalized.')
    if (cur.version !== version) throw new Error('Someone else changed this draft. Reload it before finalizing.')
    if (!cur.client_id) throw new Error('Choose a client before finalizing.')
    const n = (await c.query('SELECT count(*)::int AS n FROM invoice_items WHERE invoice_id=$1', [id])).rows[0].n
    if (n === 0) throw new Error('Add at least one line before finalizing.')

    const year = cur.year ?? Number(String(cur.issue_date).slice(0, 4))
    let number: number = cur.number
    if (number === null) {
    // The upsert row-locks the year's counter until COMMIT, so concurrent finalizations queue up.
    // If anything below fails, ROLLBACK also undoes the increment: no gaps.
    number = (
      await c.query(
        `INSERT INTO invoice_counters (year, last_number) VALUES ($1, 1)
         ON CONFLICT (year) DO UPDATE SET last_number = invoice_counters.last_number + 1 RETURNING last_number`,
        [year],
      )
    ).rows[0].last_number
    }
    const client = (await c.query('SELECT id, company_name, address_1, address_2, country, tax_id FROM clients WHERE id=$1', [cur.client_id])).rows[0]
    await c.query(
      `UPDATE invoices SET status='finalized', number=$2, year=$3, client_snapshot=$4, finalized_at=now(),
              version=version+1, updated_at=now() WHERE id=$1`,
      [id, number, year, client],
    )
  })
  return getInvoice(id)
}

/** Reopens a finalized invoice for editing. It keeps its number and is locked again by finalizing. */
export async function unlockInvoice(id: number, version: number): Promise<InvoiceRecord> {
  await withTx(async (c) => {
    const cur = (await c.query('SELECT status, version FROM invoices WHERE id=$1 FOR UPDATE', [id])).rows[0]
    if (!cur) throw new Error('Invoice not found')
    if (cur.status !== 'finalized') throw new Error('This invoice is already editable.')
    if (cur.version !== version) throw new Error('Someone else changed this invoice. Reload it first.')
    await c.query(`UPDATE invoices SET status='draft', version=version+1, updated_at=now() WHERE id=$1`, [id])
  })
  return getInvoice(id)
}

/**
 * Drafts without a number can always be deleted. A numbered invoice can only be deleted if it is the
 * latest of its year; the counter steps back so no number is skipped.
 */
export async function deleteInvoice(id: number): Promise<true> {
  await withTx(async (c) => {
    const cur = (await c.query('SELECT number, year FROM invoices WHERE id=$1 FOR UPDATE', [id])).rows[0]
    if (!cur) throw new Error('Invoice not found')
    if (cur.number !== null) {
      const ctr = (await c.query('SELECT last_number FROM invoice_counters WHERE year=$1 FOR UPDATE', [cur.year])).rows[0]
      if (!ctr || ctr.last_number !== cur.number) {
        throw new Error(
          `Invoice ${cur.number} / ${cur.year} cannot be deleted because newer invoices exist. Deleting it would leave a gap in the numbering. Edit it instead.`,
        )
      }
      await c.query('UPDATE invoice_counters SET last_number = last_number - 1 WHERE year=$1', [cur.year])
    }
    await c.query('DELETE FROM invoices WHERE id=$1', [id])
  })
  return true
}
