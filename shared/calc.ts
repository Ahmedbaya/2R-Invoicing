import Decimal from 'decimal.js'

// One rounding rule for the whole app: ROUND_HALF_UP, 2 decimals per line.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP })

export const dec = (v: string | number | null | undefined): Decimal => {
  if (v === null || v === undefined || v === '') return new Decimal(0)
  try {
    return new Decimal(String(v).trim().replace(',', '.'))
  } catch {
    return new Decimal(0)
  }
}

export const lineTotal = (quantity: string, unitPrice: string): string =>
  dec(quantity).times(dec(unitPrice)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)

export interface Totals {
  lines: string[]
  totalAmount: string
  totalQuantity: string
}

export function computeTotals(items: { quantity: string; unit_price: string }[]): Totals {
  let amount = new Decimal(0)
  let qty = new Decimal(0)
  const lines = items.map((i) => {
    const t = lineTotal(i.quantity, i.unit_price)
    amount = amount.plus(t)
    qty = qty.plus(dec(i.quantity))
    return t
  })
  return { lines, totalAmount: amount.toFixed(2), totalQuantity: qty.toDecimalPlaces(3).toFixed() }
}

/** 14875.6 -> "14 875,60" (French grouping and decimal comma). */
export function formatNumber(value: string, decimals?: number): string {
  const d = dec(value)
  const s = decimals === undefined ? d.toFixed() : d.toFixed(decimals)
  const [int, frac] = s.split('.')
  const neg = int.startsWith('-')
  const grouped = int.replace('-', '').replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0')
  return (neg ? '-' : '') + grouped + (frac ? ',' + frac : '')
}
