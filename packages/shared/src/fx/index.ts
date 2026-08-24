import { z } from "zod";
import { CURRENCY_CODES, CurrencyCode } from "../currency/index.js";

export interface ExchangeRateDTO {
  baseCurrency: string;
  quoteCurrency: string;
  rate: number;
  rateDate: string; // "YYYY-MM-DD"
  provider: string;
}

export interface ConvertedAmountResult {
  originalAmount: number;
  originalCurrency: string;
  convertedAmount: number;
  reportingCurrency: string;
  rate: number;
  rateDate: string;
  isConverted: boolean;
  isSameCurrency: boolean;
}

export const SetReportingCurrencySchema = z.object({
  reportingCurrency: z.string().min(3).max(3),
});

export type SetReportingCurrencyInput = z.infer<typeof SetReportingCurrencySchema>;

export const ExchangeRateQuerySchema = z.object({
  baseCurrency: z.string().min(3).max(3),
  quoteCurrency: z.string().min(3).max(3),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD").optional(),
});

export type ExchangeRateQuery = z.infer<typeof ExchangeRateQuerySchema>;

/**
 * Deterministic fallback rates for development & offline fixture support.
 * Rates relative to USD (USD = 1.0).
 */
export const FIXTURE_USD_RATES: Record<string, number> = {
  USD: 1.0,
  VND: 25400.0,
  EUR: 0.92,
  GBP: 0.78,
  JPY: 155.5,
  SGD: 1.35,
  CAD: 1.37,
  AUD: 1.52,
  CHF: 0.90,
  THB: 36.5,
  IDR: 16200.0,
  MYR: 4.70,
  PHP: 58.5,
};

/**
 * Calculates converted amount given base USD rates.
 * Uses exact precision arithmetic.
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number> = FIXTURE_USD_RATES
): number | null {
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();

  if (from === to) {
    return amount;
  }

  const rateFrom = rates[from];
  const rateTo = rates[to];

  if (!rateFrom || !rateTo || rateFrom <= 0 || rateTo <= 0) {
    return null;
  }

  // Cross-rate calculation: (amount / rateFromUSD) * rateToUSD
  // e.g. from USD -> VND: (100 / 1.0) * 25400 = 2,540,000
  // e.g. from VND -> USD: (2,540,000 / 25400) * 1.0 = 100
  // e.g. from EUR -> VND: (100 / 0.92) * 25400 = 2,760,869.57
  const inUSD = amount / rateFrom;
  const inTarget = inUSD * rateTo;

  return Math.round(inTarget * 10000) / 10000;
}

/**
 * Formats a currency amount with appropriate decimal places and locale standards.
 */
export function formatCurrencyAmount(
  amount: number,
  currency: string,
  locale: string = "en-US"
): string {
  const code = currency.toUpperCase();
  const noDecimal = ["VND", "JPY", "IDR", "KRW"].includes(code);

  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
      minimumFractionDigits: noDecimal ? 0 : 2,
      maximumFractionDigits: noDecimal ? 0 : 2,
    }).format(amount);
  } catch {
    const formatted = noDecimal
      ? Math.round(amount).toLocaleString()
      : amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${formatted} ${code}`;
  }
}
