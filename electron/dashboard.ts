import type { DashboardStats, InvoiceListRow } from '../shared/types'
import { getPool } from './db'

const inYear = (col: string) =>
  `${col} >= date_trunc('year', CURRENT_DATE)::date AND ${col} < (date_trunc('year', CURRENT_DATE) + interval '1 year')::date`
const inMonth = (col: string) =>
  `${col} >= date_trunc('month', CURRENT_DATE)::date AND ${col} < (date_trunc('month', CURRENT_DATE) + interval '1 month')::date`
const inPrevMonth = (col: string) =>
  `${col} >= (date_trunc('month', CURRENT_DATE) - interval '1 month')::date AND ${col} < date_trunc('month', CURRENT_DATE)::date`

export async function getDashboardStats(): Promise<DashboardStats> {
  const db = getPool()
  const [totals, monthly, byCategory, topClients, recent, categories] = await Promise.all([
    db.query(`
      SELECT
        EXTRACT(YEAR FROM CURRENT_DATE)::int AS year,
        COALESCE(SUM(total_amount) FILTER (WHERE ${inMonth('issue_date')}), 0) AS revenue_month,
        COALESCE(SUM(total_amount) FILTER (WHERE ${inPrevMonth('issue_date')}), 0) AS revenue_prev_month,
        COALESCE(SUM(total_amount) FILTER (WHERE ${inYear('issue_date')}), 0) AS revenue_year,
        (count(*) FILTER (WHERE ${inMonth('issue_date')}))::int AS invoices_month,
        (SELECT count(*)::int FROM invoices WHERE status = 'draft') AS drafts,
        COALESCE((SELECT last_number FROM invoice_counters WHERE year = EXTRACT(YEAR FROM CURRENT_DATE)::int), 0) + 1 AS next_number
      FROM invoices WHERE status = 'finalized'`),
    db.query(`
      SELECT EXTRACT(MONTH FROM issue_date)::int AS m, SUM(total_amount) AS total
      FROM invoices WHERE status = 'finalized' AND ${inYear('issue_date')} GROUP BY 1`),
    db.query(`
      SELECT ii.customs_code, SUM(ii.line_total) AS total
      FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
      WHERE i.status = 'finalized' AND ${inYear('i.issue_date')}
      GROUP BY ii.customs_code ORDER BY SUM(ii.line_total) DESC LIMIT 6`),
    db.query(`
      SELECT COALESCE(client_snapshot->>'company_name', '(no client)') AS name, SUM(total_amount) AS total, count(*)::int AS count
      FROM invoices WHERE status = 'finalized' AND ${inYear('issue_date')}
      GROUP BY 1 ORDER BY SUM(total_amount) DESC LIMIT 5`),
    db.query(`
      SELECT i.id, i.status, i.number, i.year, i.issue_date, i.total_amount, i.currency,
             COALESCE(i.client_snapshot->>'company_name', c.company_name) AS client_name
      FROM invoices i LEFT JOIN clients c ON c.id = i.client_id
      ORDER BY i.updated_at DESC LIMIT 8`),
    db.query('SELECT customs_code, name FROM categories ORDER BY id'),
  ])

  const t = totals.rows[0]
  const months: string[] = Array(12).fill('0')
  for (const r of monthly.rows) months[r.m - 1] = String(r.total)

  const names = new Map<string, string>()
  for (const c of categories.rows) if (!names.has(c.customs_code)) names.set(c.customs_code, c.name)

  return {
    year: t.year,
    revenue_month: String(t.revenue_month),
    revenue_prev_month: String(t.revenue_prev_month),
    revenue_year: String(t.revenue_year),
    invoices_month: t.invoices_month,
    drafts: t.drafts,
    next_number: t.next_number,
    monthly: months,
    by_category: byCategory.rows.map((r) => ({ customs_code: r.customs_code, name: names.get(r.customs_code) ?? null, total: String(r.total) })),
    top_clients: topClients.rows.map((r) => ({ name: r.name, total: String(r.total), count: r.count })),
    recent: recent.rows as InvoiceListRow[],
  }
}