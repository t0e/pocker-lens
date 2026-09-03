import { Prisma } from '@prisma/client'
import { prisma } from '../db/client.js'
import {
  ConvertedAmountResult,
  ExchangeRateDTO,
  FIXTURE_USD_RATES,
} from '@pocketlens/shared'

export interface IFXProvider {
  name: string
  getRates(dateStr: string): Promise<Record<string, number>>
}

export class DefaultFXProvider implements IFXProvider {
  name = 'default'

  async getRates(_dateStr: string): Promise<Record<string, number>> {
    // In development / test / offline mode, returns fixture rates
    return FIXTURE_USD_RATES
  }
}

export class FXService {
  private provider: IFXProvider

  constructor(provider: IFXProvider = new DefaultFXProvider()) {
    this.provider = provider
  }

  /**
   * Normalizes a date into YYYY-MM-DD string (UTC).
   */
  public formatDateKey(date?: Date | string): string {
    if (!date) {
      const now = new Date()
      return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`
    }
    const d = typeof date === 'string' ? new Date(date) : date
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  }

  /**
   * Ensures rates for a given date are cached in the database.
   */
  public async ensureRatesForDate(dateStr: string): Promise<void> {
    const rateDate = new Date(`${dateStr}T00:00:00.000Z`)

    // Check if we already have rates stored for this date
    const existing = await prisma.exchangeRate.findFirst({
      where: {
        baseCurrency: 'USD',
        rateDate,
        provider: this.provider.name,
      },
    })

    if (existing) {
      return
    }

    // Fetch from provider and persist
    try {
      const rates = await this.provider.getRates(dateStr)
      const dataToInsert = Object.entries(rates).map(
        ([quoteCurrency, rateNum]) => ({
          baseCurrency: 'USD',
          quoteCurrency: quoteCurrency.toUpperCase(),
          rate: new Prisma.Decimal(rateNum),
          rateDate,
          provider: this.provider.name,
        }),
      )

      await prisma.exchangeRate.createMany({
        data: dataToInsert,
        skipDuplicates: true,
      })
    } catch {
      // If external provider fails, insert fixture rates as fallback
      const dataToInsert = Object.entries(FIXTURE_USD_RATES).map(
        ([quoteCurrency, rateNum]) => ({
          baseCurrency: 'USD',
          quoteCurrency: quoteCurrency.toUpperCase(),
          rate: new Prisma.Decimal(rateNum),
          rateDate,
          provider: 'fallback_fixture',
        }),
      )

      await prisma.exchangeRate.createMany({
        data: dataToInsert,
        skipDuplicates: true,
      })
    }
  }

  /**
   * Retrieves exchange rate between fromCurrency and toCurrency on date.
   */
  public async getExchangeRate(
    fromCurrency: string,
    toCurrency: string,
    date?: Date | string,
  ): Promise<{ rate: number; rateDate: string } | null> {
    const from = fromCurrency.toUpperCase()
    const to = toCurrency.toUpperCase()
    const dateStr = this.formatDateKey(date)

    if (from === to) {
      return { rate: 1.0, rateDate: dateStr }
    }

    await this.ensureRatesForDate(dateStr)
    const rateDateObj = new Date(`${dateStr}T00:00:00.000Z`)

    // 1. Direct rate check (USD -> quote)
    if (from === 'USD') {
      const row = await prisma.exchangeRate.findFirst({
        where: {
          baseCurrency: 'USD',
          quoteCurrency: to,
          rateDate: { lte: rateDateObj },
        },
        orderBy: { rateDate: 'desc' },
      })
      if (row) {
        return {
          rate: row.rate.toNumber(),
          rateDate: this.formatDateKey(row.rateDate),
        }
      }
    }

    // 2. Inverted rate check (quote -> USD)
    if (to === 'USD') {
      const row = await prisma.exchangeRate.findFirst({
        where: {
          baseCurrency: 'USD',
          quoteCurrency: from,
          rateDate: { lte: rateDateObj },
        },
        orderBy: { rateDate: 'desc' },
      })
      if (row && row.rate.toNumber() > 0) {
        return {
          rate: 1 / row.rate.toNumber(),
          rateDate: this.formatDateKey(row.rateDate),
        }
      }
    }

    // 3. Cross-rate via USD: from -> USD -> to
    const rowFrom = await prisma.exchangeRate.findFirst({
      where: {
        baseCurrency: 'USD',
        quoteCurrency: from,
        rateDate: { lte: rateDateObj },
      },
      orderBy: { rateDate: 'desc' },
    })

    const rowTo = await prisma.exchangeRate.findFirst({
      where: {
        baseCurrency: 'USD',
        quoteCurrency: to,
        rateDate: { lte: rateDateObj },
      },
      orderBy: { rateDate: 'desc' },
    })

    if (rowFrom && rowTo && rowFrom.rate.toNumber() > 0) {
      const crossRate = rowTo.rate.toNumber() / rowFrom.rate.toNumber()
      return { rate: crossRate, rateDate: this.formatDateKey(rowTo.rateDate) }
    }

    // Fallback to fixture rate if DB record missing
    const fRateFrom = FIXTURE_USD_RATES[from]
    const fRateTo = FIXTURE_USD_RATES[to]
    if (fRateFrom && fRateTo && fRateFrom > 0) {
      return { rate: fRateTo / fRateFrom, rateDate: dateStr }
    }

    return null
  }

  /**
   * Converts an amount into reportingCurrency with full metadata.
   */
  public async convertAmount(
    amount: number | Prisma.Decimal,
    fromCurrency: string,
    toCurrency: string,
    date?: Date | string,
  ): Promise<ConvertedAmountResult> {
    const rawAmount = typeof amount === 'number' ? amount : amount.toNumber()
    const from = fromCurrency.toUpperCase()
    const to = toCurrency.toUpperCase()
    const dateStr = this.formatDateKey(date)

    if (from === to) {
      return {
        originalAmount: rawAmount,
        originalCurrency: from,
        convertedAmount: rawAmount,
        reportingCurrency: to,
        rate: 1.0,
        rateDate: dateStr,
        isConverted: true,
        isSameCurrency: true,
      }
    }

    const rateInfo = await this.getExchangeRate(from, to, date)
    if (!rateInfo || rateInfo.rate <= 0) {
      return {
        originalAmount: rawAmount,
        originalCurrency: from,
        convertedAmount: rawAmount,
        reportingCurrency: to,
        rate: 1.0,
        rateDate: dateStr,
        isConverted: false,
        isSameCurrency: false,
      }
    }

    const converted = Math.round(rawAmount * rateInfo.rate * 10000) / 10000
    return {
      originalAmount: rawAmount,
      originalCurrency: from,
      convertedAmount: converted,
      reportingCurrency: to,
      rate: rateInfo.rate,
      rateDate: rateInfo.rateDate,
      isConverted: true,
      isSameCurrency: false,
    }
  }
}

export const fxService = new FXService()
