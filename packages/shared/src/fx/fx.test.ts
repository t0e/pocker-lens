import { describe, it, expect } from 'vitest'
import { convertCurrency, formatCurrencyAmount } from './index.js'

describe('FX & Currency Utilities', () => {
  it('should return same amount for identical source and target currency', () => {
    expect(convertCurrency(100, 'USD', 'USD')).toBe(100)
    expect(convertCurrency(2500000, 'VND', 'VND')).toBe(2500000)
    expect(convertCurrency(50.5, 'EUR', 'EUR')).toBe(50.5)
  })

  it('should accurately convert USD to VND and VND to USD', () => {
    // 100 USD at 25,400 rate -> 2,540,000 VND
    const inVnd = convertCurrency(100, 'USD', 'VND')
    expect(inVnd).toBe(2540000)

    // 2,540,000 VND -> 100 USD
    const inUsd = convertCurrency(2540000, 'VND', 'USD')
    expect(inUsd).toBe(100)
  })

  it('should accurately calculate cross-rates via USD base', () => {
    // 100 EUR to VND (1 EUR = 0.92 USD base => in USD = 100 / 0.92; in VND = (100 / 0.92) * 25400)
    const inVnd = convertCurrency(92, 'EUR', 'VND')
    expect(inVnd).toBe(2540000) // 92 EUR = 100 USD = 2,540,000 VND
  })

  it('should return null for unsupported or invalid currency rates', () => {
    expect(convertCurrency(100, 'UNKNOWN', 'USD')).toBeNull()
    expect(convertCurrency(100, 'USD', 'INVALID')).toBeNull()
  })

  it('should format amounts with appropriate currency decimals', () => {
    const formattedVnd = formatCurrencyAmount(1250000, 'VND')
    expect(formattedVnd).toContain('1,250,000')

    const formattedUsd = formatCurrencyAmount(12.5, 'USD')
    expect(formattedUsd).toContain('12.50')
  })
})
