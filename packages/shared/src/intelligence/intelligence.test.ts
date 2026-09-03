import { describe, it, expect } from 'vitest'
import { normalizeMerchant } from './index.js'

describe('Merchant Normalization', () => {
  it('should normalize casing and whitespace safely', () => {
    expect(normalizeMerchant('  HIGHLANDS   COFFEE  ')).toBe('highlands coffee')
    expect(normalizeMerchant('Grab  Food')).toBe('grab food')
  })

  it('should remove noisy punctuation while keeping alphanumeric tokens', () => {
    expect(normalizeMerchant('Masteri Thao Dien - Landlord #01')).toBe(
      'masteri thao dien landlord 01',
    )
    expect(normalizeMerchant('STARBUCKS (VINCOM MALL)')).toBe(
      'starbucks vincom mall',
    )
  })

  it('should keep distinct merchants separate', () => {
    const m1 = normalizeMerchant('Highlands Coffee')
    const m2 = normalizeMerchant('Highland Electronics')
    expect(m1).not.toBe(m2)
  })

  it('should handle empty or null values gracefully', () => {
    expect(normalizeMerchant('')).toBe('')
    expect(normalizeMerchant(null)).toBe('')
    expect(normalizeMerchant(undefined)).toBe('')
  })
})
