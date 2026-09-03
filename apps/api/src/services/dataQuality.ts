import { prisma } from '../db/client.js'
import {
  DataQualityReportResponse,
  UncategorizedTransactionItem,
} from '@pocketlens/shared'
import { categorizationService } from './categorization.js'

export class DataQualityService {
  public async getReport(userId: string): Promise<DataQualityReportResponse> {
    // 1. Uncategorized non-transfer transactions
    const uncategorized = await prisma.transaction.findMany({
      where: {
        userId,
        categoryId: null,
        type: { not: 'TRANSFER' },
      },
      include: {
        account: { select: { id: true, name: true } },
      },
      orderBy: { transactionDate: 'desc' },
      take: 50,
    })

    const uncategorizedItems: UncategorizedTransactionItem[] = []
    for (const tx of uncategorized.slice(0, 20)) {
      const suggestion = await categorizationService.suggestCategory(userId, {
        merchant: tx.merchant,
        description: tx.description,
        amount: tx.amount.toNumber(),
      })

      uncategorizedItems.push({
        id: tx.id,
        description: tx.description,
        merchant: tx.merchant,
        amount: tx.amount.toNumber(),
        currency: tx.currency,
        transactionDate: tx.transactionDate.toISOString(),
        accountId: tx.account.id,
        accountName: tx.account.name,
        suggestedCategory: suggestion.confidence !== 'NONE' ? suggestion : null,
      })
    }

    // 2. Pending receipts awaiting review
    const pendingReceiptsCount = await prisma.receipt.count({
      where: {
        userId,
        status: { in: ['READY', 'UPLOADED'] },
        transactionId: null,
      },
    })

    // 3. Potential duplicate clusters (transactions with identical currency, amount, type, date)
    const duplicateGroups = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count
      FROM (
        SELECT user_id, currency, type, amount, DATE(transaction_date) as tx_date
        FROM transactions
        WHERE user_id = ${userId}
        GROUP BY user_id, currency, type, amount, DATE(transaction_date)
        HAVING COUNT(*) > 1
      ) as dupes
    `

    const potentialDuplicatesCount =
      duplicateGroups.length > 0 ? Number(duplicateGroups[0].count) : 0

    return {
      uncategorizedCount: uncategorized.length,
      potentialDuplicatesCount,
      pendingReceiptsCount,
      uncategorizedTransactions: uncategorizedItems,
    }
  }
}

export const dataQualityService = new DataQualityService()
