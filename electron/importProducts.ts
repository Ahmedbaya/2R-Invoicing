import fs from 'node:fs/promises'
import path from 'node:path'
import { BrowserWindow, dialog, type OpenDialogOptions } from 'electron'
import type { ImportPreview, ImportRow } from '../shared/types'
import { getPool, withTx } from './db'

type Field = 'code' | 'name' | 'description' | 'category' | 'price'
interface Valid { code: string; name: string; description: string; category_id: number; price: string }

const MAX_ROWS = 5000
let pending: Valid[] | null = null

const ALIASES: Record<Field, string[]> = {
  code: ['code', 'code produit', 'reference', 'ref', 'sku', 'codice'],
  name: ['name', 'nom', 'designation', 'article', 'produit', 'nom du produit', 'nome', 'articolo'],
  description: ['description', 'desc', 'descrizione'],
  category: ['category', 'categorie', 'categoria', 'code douane', 'customs code', 'customs', 'codice doganale'],
  price: ['price', 'prix', 'prix unitaire', 'prezzo'],
}

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

function decode(buf: Buffer): string {
  const text = new TextDecoder('utf-8').decode(buf)
  return text.includes('\uFFFD') ? new TextDecoder('windows-1252').decode(buf) : text
}

function parseCsv(text: string): { line: number; cells: string[] }[] {
  const first = text.split(/\r?\n/, 1)[0] ?? ''
  const count = (d: string) => first.split(d).length - 1
  const delim = [';', '\t', ','].reduce((best, d) => (count(d) > count(best) ? d : best), ';')

  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ } else quoted = false
      } else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delim) { row.push(cell); cell = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      rows.push(row); row = []
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
  return rows.map((cells, i) => ({ line: i + 1, cells })).filter((r) => r.cells.some((c) => c.trim() !== ''))
}

function parsePrice(raw: string): string | null {
  let s = raw.replace(/[€\s\u00a0]/g, '').replace(/[a-zA-Z]/g, '')
  if (s === '') return '0'
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else s = s.replace(',', '.')
  return /^\d+(\.\d+)?$/.test(s) ? s : null
}

export async function previewProductImport(parent: BrowserWindow | null): Promise<ImportPreview | null> {
  const opts: OpenDialogOptions = {
    title: 'Choose the products file (CSV)',
    properties: ['openFile'],
    filters: [{ name: 'CSV', extensions: ['csv', 'txt'] }],
  }
  const picked = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts)
  if (picked.canceled || !picked.filePaths[0]) return null
  const file = picked.filePaths[0]

  const all = parseCsv(decode(await fs.readFile(file)))
  if (all.length < 2) throw new Error('The file is empty or has no data rows.')
  if (all.length - 1 > MAX_ROWS) throw new Error(`The file has more than ${MAX_ROWS} rows. Split it into smaller files.`)

  const header = all[0].cells.map(norm)
  const idx = {} as Record<Field, number>
  for (const f of Object.keys(ALIASES) as Field[]) idx[f] = header.findIndex((h) => ALIASES[f].includes(h))
  const missing = (['code', 'name', 'category', 'price'] as Field[]).filter((f) => idx[f] < 0)
  if (missing.length) {
    throw new Error(`Missing column(s): ${missing.join(', ')}. The first row must contain the headers: code, name, description, category, price.`)
  }

  const db = getPool()
  const cats = (await db.query('SELECT id, name, customs_code FROM categories')).rows as { id: number; name: string; customs_code: string }[]
  const existing = new Set<string>((await db.query('SELECT code FROM products WHERE code IS NOT NULL')).rows.map((r) => r.code as string))

  const seen = new Set<string>()
  const out: ImportRow[] = []
  const valid: Valid[] = []
  for (const { line, cells } of all.slice(1)) {
    const get = (f: Field) => (idx[f] >= 0 ? (cells[idx[f]] ?? '').trim() : '')
    const code = get('code')
    const name = get('name')
    const description = get('description')
    const category = get('category')
    const priceRaw = get('price')
    const cat = cats.find((c) => norm(c.name) === norm(category) || c.customs_code.trim() === category)
    const price = parsePrice(priceRaw)

    let message = ''
    if (!code) message = 'Code is empty'
    else if (code.length > 50) message = 'Code is longer than 50 characters'
    else if (seen.has(code)) message = 'This code appears twice in the file'
    else if (!name) message = 'Name is empty'
    else if (name.length > 200) message = 'Name is longer than 200 characters'
    else if (description.length > 1000) message = 'Description is longer than 1000 characters'
    else if (!category) message = 'Category is empty'
    else if (!cat) message = `Unknown category "${category}". Add it on the Categories page first`
    else if (price === null) message = `Invalid price "${priceRaw}"`
    if (code) seen.add(code)

    const action: ImportRow['action'] = message ? 'error' : existing.has(code) ? 'update' : 'new'
    out.push({ line, code, name, category, price: priceRaw, action, message })
    if (!message && cat && price !== null) valid.push({ code, name, description, category_id: cat.id, price })
  }

  pending = valid
  return {
    fileName: path.basename(file),
    rows: out,
    newCount: out.filter((r) => r.action === 'new').length,
    updateCount: out.filter((r) => r.action === 'update').length,
    errorCount: out.filter((r) => r.action === 'error').length,
  }
}

/** Applies the rows validated by the last preview, in one request and one transaction. */
export async function applyProductImport(): Promise<{ created: number; updated: number }> {
  if (!pending || pending.length === 0) throw new Error('Nothing to import. Choose a file first.')
  const rows = pending
  const result = await withTx((c) =>
    c.query(
      `INSERT INTO products (code, name, description, category_id, default_price)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::int[], $5::numeric[])
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
         category_id = EXCLUDED.category_id, default_price = EXCLUDED.default_price, updated_at = now()
       RETURNING (xmax = 0) AS inserted`,
      [rows.map((r) => r.code), rows.map((r) => r.name), rows.map((r) => r.description), rows.map((r) => r.category_id), rows.map((r) => r.price)],
    ),
  )
  pending = null
  const created = result.rows.filter((r) => r.inserted).length
  return { created, updated: result.rows.length - created }
}