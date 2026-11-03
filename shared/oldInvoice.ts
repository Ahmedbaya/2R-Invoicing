// Reads the old Excel invoices (FACT-Okeo layout) and splits each line into order name + article.
// Pure functions only, so they can be tested without Electron or a database.

export interface OldItem { line: number; quantity: string; unit_price: string; text: string }
export interface ParsedOld {
  number: number | null
  year: number | null
  date: string | null // yyyy-mm-dd
  client_name: string | null
  address_1: string | null
  address_2: string | null
  country: string | null
  items: OldItem[]
  skipped_no_qty: number
  declared_total: string | null
  origin: string
  transporter: string
  gross_weight: string
  pallets: number | null
  errors: string[]
}

export const clean = (s: string) => (s ?? '').normalize('NFC').replace(/[\s\u00a0]+/g, ' ').trim()
export const norm = (s: string) => clean(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()
const key = (s: string) => norm(s).replace(/\./g, '')

export function parseAmount(raw: string): string | null {
  let s = (raw ?? '').replace(/[€\s\u00a0]/g, '').replace(/[A-Za-z]/g, '')
  if (!/\d/.test(s)) return null
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  } else s = s.replace(',', '.')
  return /^\d+(\.\d+)?$/.test(s) ? s : null
}

export function emptyParsed(errors: string[] = []): ParsedOld {
  return {
    number: null, year: null, date: null, client_name: null, address_1: null, address_2: null, country: null,
    items: [], skipped_no_qty: 0, declared_total: null, origin: '', transporter: '', gross_weight: '', pallets: null, errors,
  }
}

const QTY = ['QTE', 'QTA', 'QTY', 'QUANTITE', 'QUANTITA']
const ART = ['ARTICOLO', 'ARTICLE', 'DESIGNATION']
const PRI = ['PRIX', 'PRIX UNITAIRE', 'PREZZO', 'PRICE']
const TOT = ['TOTAL', 'TOTALE']

export function parseOldInvoice(rows: string[][]): ParsedOld {
  const out = emptyParsed()

  let h = -1, cQty = -1, cArt = -1, cPri = -1, cTot = -1
  for (let r = 0; r < rows.length; r++) {
    const keys = (rows[r] ?? []).map(key)
    const q = keys.findIndex((k) => QTY.includes(k))
    const a = keys.findIndex((k) => ART.includes(k))
    if (q >= 0 && a >= 0) {
      h = r; cQty = q; cArt = a
      cPri = keys.findIndex((k) => PRI.includes(k))
      cTot = keys.findIndex((k) => TOT.includes(k))
      break
    }
  }
  if (h < 0) { out.errors.push('Table header (Q.TE / ARTICOLO / PRIX) not found'); return out }
  if (cPri < 0) { out.errors.push('Price column (PRIX) not found'); return out }

  // Header block: invoice number, date, client
  let clientRow = -1, clientCol = -1
  for (let r = 0; r < h; r++) {
    ;(rows[r] ?? []).forEach((raw, j) => {
      const t = clean(raw)
      if (!t) return
      const n = t.match(/FACTURE\s+N\s*[°º.]?\s*(\d+)\s*\/\s*(\d{4})/i)
      if (n) { out.number = Number(n[1]); out.year = Number(n[2]) }
      const d = t.match(/DATE[^\d]*(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{4})/i)
      if (d) {
        const dd = Number(d[1]), mm = Number(d[2]), yy = Number(d[3])
        if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) out.date = `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
      }
      const c = t.match(/^CLIENT\s*:\s*(.*)$/i)
      if (c && clientRow < 0) { out.client_name = clean(c[1]) || null; clientRow = r; clientCol = j }
    })
  }
  if (clientRow >= 0) {
    const lines: string[] = []
    for (let r = clientRow + 1; r < h && lines.length < 5; r++) {
      const t = clean(rows[r]?.[clientCol] ?? '')
      if (t && !/FACTURE|DATE\s+LE/i.test(t)) lines.push(t)
    }
    out.address_1 = lines[0] ?? null
    if (lines.length === 2) out.address_2 = lines[1]
    if (lines.length >= 3) { out.address_2 = lines.slice(1, -1).join(', '); out.country = lines[lines.length - 1] }
  }

  // Lines, until the totals row
  let i = h + 1
  for (; i < rows.length; i++) {
    const row = rows[i] ?? []
    const art = clean(row[cArt] ?? '')
    const qtyRaw = row[cQty] ?? ''
    const totRaw = cTot >= 0 ? row[cTot] ?? '' : ''
    if (!art) {
      if (clean(qtyRaw) || /\d/.test(totRaw)) { out.declared_total = cTot >= 0 ? parseAmount(totRaw) : null; break }
      continue
    }
    const qty = parseAmount(qtyRaw)
    if (qty === null || Number(qty) === 0) { out.skipped_no_qty++; continue }
    const price = parseAmount(row[cPri] ?? '')
    if (price === null) { out.errors.push(`Row ${i + 1}: invalid price for "${art}"`); continue }
    out.items.push({ line: i + 1, quantity: qty, unit_price: price, text: art })
  }

  // Shipping text below the totals
  let collecting = false
  for (const row of rows.slice(i)) {
    const cells = (row ?? []).map(clean).filter(Boolean)
    if (cells.length === 0) { collecting = false; continue }
    const first = cells[0]
    if (/^MARCHANDISE\b/i.test(first)) { out.origin = cells.join(' '); collecting = true; continue }
    const stop = cells.some((c) => /^(POIDS|NBRE|V,?M,?P|TRANSPORT)/i.test(c))
    if (collecting && !stop) out.origin += ' ' + cells.join(' ')
    else collecting = false
    for (const c of cells) {
      const w = c.match(/POIDS\s*[=:]?\s*([\d.,\s]+?)\s*KG/i)
      if (w) out.gross_weight = parseAmount(w[1]) ?? ''
      const p = c.match(/(\d+)\s*PALETT/i)
      if (p) out.pallets = Number(p[1])
      const t = c.match(/TRANSPORT(?:EUR)?\s*[:=]\s*(.+)$/i)
      if (t) out.transporter = clean(t[1])
    }
  }
  return out
}

// ---- Order name / article split and customs code ----

// ---- Product detection: the product name goes in ARTICOLO, the rest of the line in COMMANDE ----

// ---- Product detection ----
// The end of an old line may be only a PART of a product name (start, middle or end of it).
// The line then takes the full name from the Products list, and the rest of the line becomes the order name.

export interface ProductRef {
  id: number | null // null for products typed manually during the import
  code: string | null
  name: string
  customs_code: string | null
  manual?: boolean
  add?: boolean
}
export type MatchKind = 'exact' | 'partial' | 'ambiguous' | 'none' | 'manual'
export interface Resolved {
  order_name: string
  description: string
  product: ProductRef | null
  customs_code: string
  kind: MatchKind
  candidates: ProductRef[] // when several products contain the end of the line
}
export interface ResolveCtx { products: (ProductRef & { words: string[] })[]; minWords: number }

const words = (s: string) => norm(s).split(' ').filter(Boolean)

function containsSeq(hay: string[], needle: string[]): boolean {
  outer: for (let s = 0; s + needle.length <= hay.length; s++) {
    for (let k = 0; k < needle.length; k++) if (hay[s + k] !== needle[k]) continue outer
    return true
  }
  return false
}

export function makeCtx(products: ProductRef[], minWords = 1): ResolveCtx {
  const seen = new Set<string>()
  const list: (ProductRef & { words: string[] })[] = []
  for (const p of products) {
    const w = words(p.name)
    const k = w.join(' ')
    if (!k || seen.has(k)) continue // two products with the same name count once (the first wins)
    seen.add(k)
    list.push({ ...p, words: w })
  }
  return { products: list, minWords }
}

/** True when `name` is the end of `line` (whole words), ignoring case and accents. */
export function isProductSuffix(line: string, name: string): boolean {
  const l = norm(line)
  const n = norm(name)
  return !!n && (l === n || l.endsWith(' ' + n))
}

/** For a product chosen by the user: the longest end of the line found inside its name is the article, the rest is the order. */
export function splitByFragment(text: string, name: string): { order: string; found: boolean } {
  const lw = clean(text).split(' ')
  const nw = lw.map(norm)
  const pw = words(name)
  for (let i = 0; i < lw.length; i++) {
    if (containsSeq(pw, nw.slice(i))) return { order: lw.slice(0, i).join(' '), found: true }
  }
  return { order: clean(text), found: false }
}

const done = (order: string, p: ProductRef, kind: MatchKind): Resolved => ({
  order_name: order, description: clean(p.name), product: p, customs_code: p.customs_code ?? '', kind, candidates: [],
})

export function resolveLine(text: string, ctx: ResolveCtx): Resolved {
  const full = clean(text)
  const lw = full.split(' ')
  const nw = lw.map(norm)
  // Try the longest end of the line first, then shorter ones.
  for (let i = 0; i < lw.length; i++) {
    const frag = nw.slice(i)
    const hits = ctx.products.filter((p) => (frag.length >= ctx.minWords || frag.length === p.words.length) && containsSeq(p.words, frag))
    if (hits.length === 0) continue
    const order = lw.slice(0, i).join(' ')
    const exact = hits.find((p) => p.words.length === frag.length)
    if (exact) return done(order, exact, 'exact')
    if (hits.length === 1) return done(order, hits[0], 'partial')
    const candidates = [...hits].sort((a, b) => frag.length / b.words.length - frag.length / a.words.length).slice(0, 8)
    return { order_name: '', description: full, product: null, customs_code: '', kind: 'ambiguous', candidates }
  }
  return { order_name: '', description: full, product: null, customs_code: '', kind: 'none', candidates: [] }
}