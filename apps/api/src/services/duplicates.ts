import { Prisma } from '@prisma/client'
import { prisma } from '../db/client.js'
import {
  CheckDuplicatesInput,
  DuplicateCheckResult,
  DuplicateMatch,
  DuplicateConfidence,
  normalizeMerchant,
} from '@pocketlens/shared'

export class DuplicateDetectionService {
  /**
   * Checks for potential duplicate transactions before creating or confirming a transaction.
   */
  public async checkDuplicates(
    userId: string,
    input: CheckDuplicatesInput,
  ): Promise<DuplicateCheckResult> {
    const candidateDate = new Date(input.transactionDate)
    const candidateAmount = new Prisma.Decimal(input.amount)
    const candidateType = input.type.toUpperCase() as any
    const normMerchant = normalizeMerchant(input.merchant)
    const normDesc = input.description.toLowerCase().trim()

    // Query candidate window: +- 24 hours around transaction date
    const startWindow = new Date(candidateDate.getTime() - 24 * 60 * 60 * 1000)
    const endWindow = new Date(candidateDate.getTime() + 24 * 60 * 60 * 1000)

    const candidates = await prisma.transaction.findMany({
      where: {
        userId,
        currency: input.currency.toUpperCase(),
        type: candidateType,
        transactionDate: {
          gte: startWindow,
          lte: endWindow,
        },
        ...(input.excludeTransactionId
          ? { id: { not: input.excludeTransactionId } }
          : {}),
      },
      include: {
        account: { select: { id: true, name: true } },
        category: { select: { id: true, name: true } },
      },
      take: 20,
    })

    const matches: DuplicateMatch[] = []

    for (const tx of candidates) {
      const txAmount = tx.amount.toNumber()
      const amountDiff = Math.abs(txAmount - input.amount)
      const isExactAmount = amountDiff < 0.0001

      if (!isExactAmount) {
        // We only compare exact amounts for same currency to avoid false positives
        continue
      }

      const isSameAccount = tx.accountId === input.accountId
      const isSameCalendarDay =
        tx.transactionDate.toISOString().slice(0, 10) ===
        candidateDate.toISOString().slice(0, 10)

      const txNormMerchant = normalizeMerchant(tx.merchant)
      const txNormDesc = tx.description.toLowerCase().trim()

      const isSameMerchant =
        normMerchant && txNormMerchant && normMerchant === txNormMerchant
      const isSameDescription =
        normDesc && txNormDesc && normDesc === txNormDesc

      let confidence: DuplicateConfidence
      let score: number
      let reason: string

      if (
        isSameAccount &&
        isSameCalendarDay &&
        (isSameMerchant || isSameDescription)
      ) {
        confidence = 'EXACT'
        score = 1.0
        reason = `Exact match on amount (${input.amount} ${input.currency}), date (${tx.transactionDate.toISOString().slice(0, 10)}), account (${tx.account.name}), and description/merchant`
      } else if (isSameAccount && isSameCalendarDay) {
        confidence = 'LIKELY'
        score = 0.85
        reason = `Identical amount (${input.amount} ${input.currency}) on the same date in account "${tx.account.name}"`
      } else if (isSameMerchant || isSameDescription) {
        confidence = 'LIKELY'
        score = 0.8
        reason = `Identical amount (${input.amount} ${input.currency}) with matching merchant/description on ${tx.transactionDate.toISOString().slice(0, 10)}`
      } else {
        confidence = 'POSSIBLE'
        score = 0.6
        reason = `Same amount (${input.amount} ${input.currency}) recorded nearby on ${tx.transactionDate.toISOString().slice(0, 10)}`
      }

      matches.push({
        existingTransactionId: tx.id,
        confidence,
        score,
        reason,
        existingTransaction: {
          id: tx.id,
          description: tx.description,
          merchant: tx.merchant,
          amount: txAmount,
          currency: tx.currency,
          transactionDate: tx.transactionDate.toISOString(),
          accountId: tx.account.id,
          accountName: tx.account.name,
          categoryId: tx.category?.id || null,
          categoryName: tx.category?.name || null,
        },
      })
    }

    // Sort by confidence score descending
    matches.sort((a, b) => b.score - a.score)

    const highestConfidence = matches.length > 0 ? matches[0].confidence : null

    return {
      hasDuplicate: matches.length > 0,
      highestConfidence,
      matches,
    }
  }
}

export const duplicateDetectionService = new DuplicateDetectionService()
