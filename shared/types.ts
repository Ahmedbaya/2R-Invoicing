export interface Client {
  id: number
  company_name: string
  address_1: string | null
  address_2: string | null
  country: string | null
  tax_id: string | null
}
export type ClientInput = Omit<Client, 'id'> & { id?: number }

export interface Category {
  id: number
  name: string
  customs_code: string
}
export type CategoryInput = Omit<Category, 'id'> & { id?: number }

export interface Product {
  id: number
  code: string | null
  name: string
  description: string | null
  category_id: number | null
  category_name: string | null
  customs_code: string | null
  default_price: string
}
export interface ProductInput {
  id?: number
  code: string
  name: string
  description: string
  category_id: number
  default_price: string
}
export interface ImportRow {
  line: number
  code: string
  name: string
  category: string
  price: string
  action: 'new' | 'update' | 'error'
  message: string
}
export interface ImportPreview {
  fileName: string
  rows: ImportRow[]
  newCount: number
  updateCount: number
  errorCount: number
}
export interface OldManualEntry {
  text: string // the line as it appears in the old invoice
  name: string // the product name typed by the user (must be the end of the line)
  code: string
  customs_code: string
  add: boolean // also save it in the Products list
}
export interface OldImportRules { manual: OldManualEntry[] }
export interface OldImportFile {
  file: string
  number: number | null
  year: number | null
  date: string | null
  client: string | null
  client_state: 'existing' | 'new' | 'unknown'
  lines: number
  total: string
  status: 'ok' | 'duplicate' | 'error'
  problems: string[]
  warnings: string[]
  unmatched: number
}
export interface OldReviewLine { text: string; count: number; state: 'none' | 'manual' }
export interface OldImportPreview {
  files: OldImportFile[]
  ok: number
  duplicates: number
  errors: number
  new_clients: string[]
  review: OldReviewLine[]
  matched_total: number
  manual_total: number
  unmatched_total: number
}
export interface OldImportResult {
  imported: number
  skipped: number
  failed: { file: string; message: string }[]
}

export interface ItemInput {
  product_id: number | null
  item_code: string
  order_name: string
  customs_code: string
  description: string
  quantity: string
  unit_price: string
}
export interface LogisticsInput {
  customs_declaration: string
  transporter: string
  gross_weight_kg: string
  net_weight_kg: string
  pallets: number | null
}
export interface DraftInput {
  id?: number
  version?: number
  client_id: number | null
  number: number | null
  issue_date: string // yyyy-mm-dd
  currency: string
  vat_note: string
  items: ItemInput[]
  logistics: LogisticsInput
  created_by: string
}
export interface InvoiceRecord {
  id: number
  status: 'draft' | 'finalized'
  number: number | null
  year: number | null
  version: number
  client_id: number | null
  client: Client | null // snapshot when finalized, live row when draft
  issue_date: string
  currency: string
  vat_note: string
  created_by: string
  items: (ItemInput & { id: number; line_total: string })[]
  logistics: LogisticsInput
  total_amount: string
  total_quantity: string
}
export interface InvoiceListRow {
  id: number
  status: 'draft' | 'finalized'
  number: number | null
  year: number | null
  client_name: string | null
  issue_date: string
  total_amount: string
  currency: string
  search_text?: string // codes, order names and article names, used only for searching
}
export interface DashboardStats {
  year: number
  revenue_month: string
  revenue_prev_month: string
  revenue_year: string
  invoices_month: number
  drafts: number
  invoices_year: number
  monthly: string[] // 12 entries, Jan to Dec of the current year
  by_category: { customs_code: string; name: string | null; total: string }[]
  top_clients: { name: string; total: string; count: number }[]
  recent: InvoiceListRow[]
}
export interface BackupInfo {
  name: string
  path: string
  size: number
  modified: string // ISO date
}
export interface BackupList {
  dir: string
  files: BackupInfo[] // newest first
}

export type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export interface Api {
  config: { status(): Promise<{ configured: boolean }>; save(url: string): Promise<true> }
  db: { ping(): Promise<true> }
  clients: { list(): Promise<Client[]>; save(c: ClientInput): Promise<Client>; remove(id: number): Promise<true> }
  categories: { list(): Promise<Category[]>; save(c: CategoryInput): Promise<Category>; remove(id: number): Promise<true> }
  dashboard: { stats(): Promise<DashboardStats> }
  backup: { list(): Promise<BackupList>; now(): Promise<BackupInfo>; saveAs(): Promise<string | null>; openFolder(): Promise<true> }
    products: {
    list(): Promise<Product[]>
    save(p: ProductInput): Promise<Product>
    remove(id: number): Promise<true>
    importPreview(): Promise<ImportPreview | null>
    importApply(): Promise<{ created: number; updated: number }>
  }
  invoices: {
    list(): Promise<InvoiceListRow[]>
    get(id: number): Promise<InvoiceRecord>
    saveDraft(d: DraftInput): Promise<InvoiceRecord>
    finalize(a: { id: number; version: number }): Promise<InvoiceRecord>
    duplicate(a: { id: number; issue_date: string; created_by: string }): Promise<InvoiceRecord>
    lastNumber(a: { client_id: number; year: number }): Promise<number | null>
    unlock(a: { id: number; version: number }): Promise<InvoiceRecord>
    remove(id: number): Promise<true>
    exportPdf(id: number): Promise<string | null> // saved path, or null if cancelled
    exportExcel(id: number): Promise<string | null>
    exportListExcel(ids: number[]): Promise<string | null>
  }
    oldImport: {
    choose(r: OldImportRules): Promise<OldImportPreview | null>
    preview(r: OldImportRules): Promise<OldImportPreview>
    apply(r: OldImportRules): Promise<OldImportResult>
  }
}
