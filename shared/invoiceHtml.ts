import { amountInWordsFr } from './amountInWords'
import { computeTotals, formatNumber } from './calc'
import { COMPANY } from './company'
import type { InvoiceRecord } from './types'

const esc = (s: string | null | undefined) =>
  (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

const frDate = (iso: string) => iso.split('-').reverse().join('/')

/** Self-contained A4 HTML used by Electron's printToPDF. Tune the CSS to match the Excel layout. */
export function renderInvoiceHtml(inv: InvoiceRecord, co = COMPANY): string {
  const t = computeTotals(inv.items)
  const c = inv.client
  const title = inv.number ? `FACTURE N° ${inv.number} / ${inv.year}` : 'FACTURE (BROUILLON)'
  const lg = inv.logistics

  const rows = inv.items
    .map(
      (it, i) => `<tr>
        <td class="num">${formatNumber(it.quantity)}</td>
        <td>${esc(it.description)}</td>
        <td class="num">${formatNumber(it.unit_price)}</td>
        <td class="num">${formatNumber(t.lines[i], 2)}</td></tr>`,
    )
    .join('')

  const logistics = [
    lg.customs_declaration && `<div>${esc(lg.customs_declaration)}</div>`,
    lg.transporter && `<div>TRANSPORTEUR : ${esc(lg.transporter)}</div>`,
    lg.gross_weight_kg && `<div>POIDS BRUT : ${formatNumber(lg.gross_weight_kg)} KG${lg.net_weight_kg ? ` / POIDS NET : ${formatNumber(lg.net_weight_kg)} KG` : ''}</div>`,
    lg.pallets != null && `<div>NOMBRE DE PALETTES : ${lg.pallets}</div>`,
  ]
    .filter(Boolean)
    .join('')

  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #000; margin: 0; }
  .top { display: flex; justify-content: space-between; gap: 16mm; margin-bottom: 10mm; }
  .top > div { width: 50%; }
  .client { text-align: right; }
  .co-name { font-weight: bold; font-size: 12pt; }
  h1 { font-size: 14pt; margin: 0 0 1mm; }
  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }        /* repeat header on every page */
  tr { break-inside: avoid; }
  th, td { border: 1px solid #000; padding: 1.6mm 2mm; }
  th { background: #eee; }
  td.num, th.num { text-align: right; white-space: nowrap; }
  .keep { break-inside: avoid; margin-top: 6mm; }   /* totals + logistics stay together on the last page */
  .totals td { border: none; padding: 1mm 2mm; }
  .words { font-weight: bold; margin: 4mm 0; }
  .logistics { border: 1px solid #000; padding: 3mm; line-height: 1.5; }
  .draft { position: fixed; top: 45%; left: 0; right: 0; text-align: center; font-size: 80pt; color: rgba(0,0,0,.07); transform: rotate(-30deg); }
</style></head><body>
  ${inv.status === 'draft' ? '<div class="draft">BROUILLON</div>' : ''}
  <div class="top">
    <div>
      <div class="co-name">${esc(co.name)}</div>
      ${co.addressLines.map((l) => `<div>${esc(l)}</div>`).join('')}
      <div>${esc(co.bank)}${co.bankAccount ? ' : ' + esc(co.bankAccount) : ''}</div>
      <div>${esc(co.mf)}</div>
      <div>${esc(co.rc)}</div>
    </div>
    <div class="client">
      <h1>${title}</h1>
      <div>Date : ${frDate(inv.issue_date)}</div><br>
      <div><b>${esc(c?.company_name)}</b></div>
      <div>${esc(c?.address_1)}</div><div>${esc(c?.address_2)}</div>
      <div>${esc(c?.country)}</div>
      ${c?.tax_id ? `<div>${esc(c.tax_id)}</div>` : ''}
    </div>
  </div>

  <table>
    <thead><tr><th class="num">Q.TE</th><th>ARTICOLO</th><th class="num">PRIX</th><th class="num">TOTAL</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="keep">
    <table class="totals"><tr>
      <td>TOTAL QUANTITÉ : <b>${formatNumber(t.totalQuantity)}</b></td>
      <td class="num">TOTAL ${esc(inv.currency)} : <b>${formatNumber(t.totalAmount, 2)}</b></td>
    </tr></table>
    <div class="words">ARRÊTÉE LA PRÉSENTE FACTURE À LA SOMME DE : ${amountInWordsFr(t.totalAmount)}</div>
    ${inv.vat_note ? `<div>${esc(inv.vat_note)}</div>` : ''}
    ${logistics ? `<div class="logistics">${logistics}</div>` : ''}
  </div>
</body></html>`
}
