import { prisma } from '../db/client.js'
import {
  CategorySuggestionResponse,
  CategorySuggestionConfidence,
  SuggestCategoryInput,
  normalizeMerchant,
  viDictionary,
  enDictionary,
} from '@pocketlens/shared'

export class CategorizationService {
  /**
   * Predicts / suggests the most likely category for a transaction based on user history.
   * Priority:
   * 1. Exact user merchant history (high/medium confidence)
   * 2. Normalized user merchant history (medium/high confidence)
   * 3. User description keyword history (low/medium confidence)
   * 4. Deterministic dictionary rules (low confidence)
   */
  public async suggestCategory(
    userId: string,
    input: SuggestCategoryInput,
  ): Promise<CategorySuggestionResponse> {
    const rawMerchant = input.merchant?.trim() || ''
    const rawDescription = input.description?.trim() || ''

    // 1. Exact merchant match in user history
    if (rawMerchant) {
      const merchantTxs = await prisma.transaction.findMany({
        where: {
          userId,
          merchant: { equals: rawMerchant, mode: 'insensitive' },
          categoryId: { not: null },
        },
        select: {
          categoryId: true,
          category: { select: { id: true, name: true, icon: true } },
        },
        take: 50,
      })

      if (merchantTxs.length > 0) {
        const counts: Record<string, { count: number; cat: any }> = {}
        for (const tx of merchantTxs) {
          if (!tx.categoryId || !tx.category) continue
          if (!counts[tx.categoryId]) {
            counts[tx.categoryId] = { count: 0, cat: tx.category }
          }
          counts[tx.categoryId].count++
        }

        const sorted = Object.values(counts).sort((a, b) => b.count - a.count)
        if (sorted.length > 0) {
          const top = sorted[0]
          const total = merchantTxs.length
          const ratio = top.count / total

          const confidence: CategorySuggestionConfidence =
            total >= 3 && ratio >= 0.75
              ? 'HIGH'
              : total >= 1 && ratio >= 0.5
                ? 'MEDIUM'
                : 'LOW'

          return {
            categoryId: top.cat.id,
            categoryName: top.cat.name,
            categoryIcon: top.cat.icon,
            confidence,
            reason: `Matched user history for "${rawMerchant}" (${top.count}/${total} transactions)`,
          }
        }
      }

      // 2. Normalized merchant match
      const normMerchant = normalizeMerchant(rawMerchant)
      if (normMerchant && normMerchant !== rawMerchant.toLowerCase()) {
        const allUserTxsWithMerchant = await prisma.transaction.findMany({
          where: {
            userId,
            merchant: { not: null },
            categoryId: { not: null },
          },
          select: {
            merchant: true,
            categoryId: true,
            category: { select: { id: true, name: true, icon: true } },
          },
          take: 100,
        })

        const matching = allUserTxsWithMerchant.filter(
          (tx) =>
            tx.merchant &&
            normalizeMerchant(tx.merchant) === normMerchant &&
            tx.category,
        )

        if (matching.length > 0) {
          const counts: Record<string, { count: number; cat: any }> = {}
          for (const tx of matching) {
            if (!tx.categoryId || !tx.category) continue
            if (!counts[tx.categoryId]) {
              counts[tx.categoryId] = { count: 0, cat: tx.category }
            }
            counts[tx.categoryId].count++
          }
          const sorted = Object.values(counts).sort((a, b) => b.count - a.count)
          if (sorted.length > 0) {
            const top = sorted[0]
            return {
              categoryId: top.cat.id,
              categoryName: top.cat.name,
              categoryIcon: top.cat.icon,
              confidence: 'MEDIUM',
              reason: `Matched normalized merchant pattern "${normMerchant}"`,
            }
          }
        }
      }
    }

    // 3. User description keyword match
    if (rawDescription) {
      const descTxs = await prisma.transaction.findMany({
        where: {
          userId,
          description: { contains: rawDescription, mode: 'insensitive' },
          categoryId: { not: null },
        },
        select: {
          categoryId: true,
          category: { select: { id: true, name: true, icon: true } },
        },
        take: 20,
      })

      if (descTxs.length > 0) {
        const counts: Record<string, { count: number; cat: any }> = {}
        for (const tx of descTxs) {
          if (!tx.categoryId || !tx.category) continue
          if (!counts[tx.categoryId]) {
            counts[tx.categoryId] = { count: 0, cat: tx.category }
          }
          counts[tx.categoryId].count++
        }
        const sorted = Object.values(counts).sort((a, b) => b.count - a.count)
        if (sorted.length > 0) {
          const top = sorted[0]
          return {
            categoryId: top.cat.id,
            categoryName: top.cat.name,
            categoryIcon: top.cat.icon,
            confidence: 'LOW',
            reason: `Matched description keyword history for "${rawDescription}"`,
          }
        }
      }
    }

    // 4. Deterministic dictionary token fallback (EN + VI)
    const textToMatch = `${rawMerchant} ${rawDescription}`.toLowerCase()
    const categories = await prisma.category.findMany({
      where: {
        OR: [{ isSystem: true }, { userId }],
        isArchived: false,
      },
    })

    for (const [catName, keywords] of Object.entries(
      viDictionary.categoryKeywords,
    )) {
      for (const token of keywords) {
        if (textToMatch.includes(token.toLowerCase())) {
          const matched = categories.find((c) =>
            c.name.toLowerCase().includes(catName.toLowerCase()),
          )
          if (matched) {
            return {
              categoryId: matched.id,
              categoryName: matched.name,
              categoryIcon: matched.icon,
              confidence: 'LOW',
              reason: `Matched Vietnamese keyword "${token}"`,
            }
          }
        }
      }
    }

    for (const [catName, keywords] of Object.entries(
      enDictionary.categoryKeywords,
    )) {
      for (const token of keywords) {
        if (textToMatch.includes(token.toLowerCase())) {
          const matched = categories.find((c) =>
            c.name.toLowerCase().includes(catName.toLowerCase()),
          )
          if (matched) {
            return {
              categoryId: matched.id,
              categoryName: matched.name,
              categoryIcon: matched.icon,
              confidence: 'LOW',
              reason: `Matched keyword "${token}"`,
            }
          }
        }
      }
    }

    return {
      categoryId: null,
      categoryName: null,
      categoryIcon: null,
      confidence: 'NONE',
      reason: 'No category pattern detected',
    }
  }
}

export const categorizationService = new CategorizationService()
