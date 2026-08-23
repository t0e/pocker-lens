export const SUPPORTED_CURRENCIES = [
  { code: 'USD', name: 'US Dollar', symbol: '$', decimalDigits: 2 },
  { code: 'VND', name: 'Vietnamese Đồng', symbol: '₫', decimalDigits: 0 },
  { code: 'EUR', name: 'Euro', symbol: '€', decimalDigits: 2 },
  { code: 'GBP', name: 'British Pound', symbol: '£', decimalDigits: 2 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimalDigits: 0 },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimalDigits: 2 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', decimalDigits: 2 },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'AU$', decimalDigits: 2 },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', decimalDigits: 2 },
  { code: 'THB', name: 'Thai Baht', symbol: '฿', decimalDigits: 2 },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', decimalDigits: 0 },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', decimalDigits: 2 },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱', decimalDigits: 2 },
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number]['code'];

export const CURRENCY_CODES = SUPPORTED_CURRENCIES.map((c) => c.code) as [CurrencyCode, ...CurrencyCode[]];

export function isValidCurrencyCode(code: string): code is CurrencyCode {
  return SUPPORTED_CURRENCIES.some((c) => c.code === code.toUpperCase());
}

export function getCurrencyMeta(code: string) {
  const found = SUPPORTED_CURRENCIES.find((c) => c.code === code.toUpperCase());
  return found || { code: code.toUpperCase(), name: code.toUpperCase(), symbol: code.toUpperCase(), decimalDigits: 2 };
}
