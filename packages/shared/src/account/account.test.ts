import { describe, it, expect } from 'vitest';
import { createAccountSchema, updateAccountSchema } from './index.js';
import { isValidCurrencyCode, getCurrencyMeta } from '../currency/index.js';

describe('Account & Currency Validation', () => {
  it('validates correct currency codes', () => {
    expect(isValidCurrencyCode('USD')).toBe(true);
    expect(isValidCurrencyCode('vnd')).toBe(true);
    expect(isValidCurrencyCode('INVALID')).toBe(false);
  });

  it('retrieves currency metadata', () => {
    const vnd = getCurrencyMeta('VND');
    expect(vnd.code).toBe('VND');
    expect(vnd.symbol).toBe('₫');
    expect(vnd.decimalDigits).toBe(0);
  });

  it('validates valid createAccount input with decimal balance', () => {
    const result = createAccountSchema.safeParse({
      name: 'Main Checking',
      type: 'bank',
      currency: 'USD',
      openingBalance: '1500.50',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.openingBalance).toBe('1500.50');
      expect(result.data.currency).toBe('USD');
    }
  });

  it('rejects invalid currency', () => {
    const result = createAccountSchema.safeParse({
      name: 'Cash',
      type: 'cash',
      currency: 'XYZ_FAKE',
      openingBalance: '100',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid account type', () => {
    const result = createAccountSchema.safeParse({
      name: 'Crypto Vault',
      type: 'crypto_vault',
      currency: 'USD',
      openingBalance: '0',
    });
    expect(result.success).toBe(false);
  });

  it('rejects malformed decimal amounts', () => {
    const result = createAccountSchema.safeParse({
      name: 'Cash',
      type: 'cash',
      currency: 'USD',
      openingBalance: '123.45678', // exceeds 4 decimal places
    });
    expect(result.success).toBe(false);
  });
});
