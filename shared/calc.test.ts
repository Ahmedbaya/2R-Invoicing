import { describe, expect, it } from 'vitest'
import { computeTotals, formatNumber, lineTotal } from './calc'
import { amountInWordsFr } from './amountInWords'

describe('calc', () => {
  it('avoids float errors', () => {
    expect(lineTotal('3', '0.1')).toBe('0.30')
    expect(lineTotal('632', '0.8')).toBe('505.60')
  })
  it('rounds half up per line', () => {
    expect(lineTotal('1', '0.005')).toBe('0.01')
  })
  it('sums totals', () => {
    const t = computeTotals([{ quantity: '632', unit_price: '0.8' }, { quantity: '10', unit_price: '1.25' }])
    expect(t.totalAmount).toBe('518.10')
    expect(t.totalQuantity).toBe('642')
  })
  it('formats French style', () => {
    expect(formatNumber('14875.6', 2)).toBe('14\u00a0875,60')
  })
})

describe('amountInWordsFr', () => {
  it('matches the spec example', () => {
    expect(amountInWordsFr('14875.60')).toBe('QUATORZE MILLE HUIT CENT SOIXANTE QUINZE EUROS ET SOIXANTE CENTIMES')
  })
  it('handles plural rules', () => {
    expect(amountInWordsFr('80')).toBe('QUATRE VINGTS EUROS')
    expect(amountInWordsFr('80000')).toBe('QUATRE VINGT MILLE EUROS')
    expect(amountInWordsFr('200')).toBe('DEUX CENTS EUROS')
    expect(amountInWordsFr('200000')).toBe('DEUX CENT MILLE EUROS')
    expect(amountInWordsFr('1000000')).toBe('UN MILLION EUROS')
    expect(amountInWordsFr('2000000')).toBe('DEUX MILLIONS EUROS')
  })
  it('handles edge values', () => {
    expect(amountInWordsFr('0.01')).toBe('ZÉRO EURO ET UN CENTIME')
    expect(amountInWordsFr('1')).toBe('UN EURO')
    expect(amountInWordsFr('71')).toBe('SOIXANTE ET ONZE EUROS')
    expect(amountInWordsFr('91.99')).toBe('QUATRE VINGT ONZE EUROS ET QUATRE VINGT DIX NEUF CENTIMES')
  })
})
