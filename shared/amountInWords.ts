import Decimal from 'decimal.js'
import './calc' // shares the Decimal rounding config

const UNITS = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize']
const TENS: Record<number, string> = { 2: 'vingt', 3: 'trente', 4: 'quarante', 5: 'cinquante', 6: 'soixante' }

// `final` = nothing follows this group, so "quatre-vingts" / "deux cents" take their plural s.
function below100(n: number, final: boolean): string {
  if (n < 17) return UNITS[n]
  if (n < 20) return 'dix-' + UNITS[n - 10]
  if (n < 70) {
    const t = Math.floor(n / 10)
    const u = n % 10
    if (u === 0) return TENS[t]
    if (u === 1) return TENS[t] + ' et un'
    return TENS[t] + '-' + UNITS[u]
  }
  if (n < 80) return n === 71 ? 'soixante et onze' : 'soixante-' + below100(n - 60, final)
  if (n === 80) return final ? 'quatre-vingts' : 'quatre-vingt'
  return 'quatre-vingt-' + below100(n - 80, final)
}

function below1000(n: number, final: boolean): string {
  const h = Math.floor(n / 100)
  const r = n % 100
  if (h === 0) return below100(r, final)
  const head = h === 1 ? 'cent' : UNITS[h] + ' cent'
  if (r === 0) return head + (h > 1 && final ? 's' : '')
  return head + ' ' + below100(r, final)
}

export function integerToFrench(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n >= 1_000_000_000) throw new RangeError('Amount out of range (0 to 999 999 999)')
  if (n === 0) return 'zéro'
  const millions = Math.floor(n / 1_000_000)
  const thousands = Math.floor((n % 1_000_000) / 1000)
  const rest = n % 1000
  const parts: string[] = []
  if (millions) parts.push(millions === 1 ? 'un million' : below1000(millions, true) + ' millions')
  if (thousands) parts.push(thousands === 1 ? 'mille' : below1000(thousands, false) + ' mille')
  if (rest) parts.push(below1000(rest, true))
  return parts.join(' ')
}

/** "14875.60" -> "QUATORZE MILLE HUIT CENT SOIXANTE QUINZE EUROS ET SOIXANTE CENTIMES" */
export function amountInWordsFr(total: string): string {
  const d = new Decimal(total).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
  if (d.isNegative()) throw new RangeError('Negative amounts are not supported')
  const euros = d.floor()
  const cents = d.minus(euros).times(100).round().toNumber()
  const e = euros.toNumber()
  let out = `${integerToFrench(e)} ${e >= 2 ? 'euros' : 'euro'}`
  if (cents > 0) out += ` et ${below100(cents, true)} ${cents >= 2 ? 'centimes' : 'centime'}`
  // The legacy Excel layout prints capitals without hyphens.
  return out.toLocaleUpperCase('fr').replace(/-/g, ' ')
}
