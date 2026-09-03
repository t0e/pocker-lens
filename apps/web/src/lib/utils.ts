import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { getCurrencyMeta } from '@pocketlens/shared'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatMoney(
  amount: string | number,
  currency: string = 'USD',
): string {
  const numeric = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(numeric)) {
    return `0 ${currency}`
  }

  const meta = getCurrencyMeta(currency)

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: meta.decimalDigits,
      maximumFractionDigits: meta.decimalDigits,
    }).format(numeric)
  } catch {
    // Fallback for custom or less common ISO codes
    return `${numeric.toLocaleString('en-US', {
      minimumFractionDigits: meta.decimalDigits,
      maximumFractionDigits: meta.decimalDigits,
    })} ${currency.toUpperCase()}`
  }
}

export function formatCurrency(
  amount: number,
  currency: string = 'USD',
): string {
  return formatMoney(amount, currency)
}
