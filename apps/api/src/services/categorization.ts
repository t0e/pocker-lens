import { prisma } from '../db/client.js'
import {
  CategorySuggestionResponse,
  CategorySuggestionConfidence,
  SuggestCategoryInput,
  normalizeMerchant,
  viDictionary,
  enDictionary,
} from '@pocketlens/shared'

interface CategorySummary {
  id: string
  name: string
  icon: string | null
}

export class CategorizationService {
  private aggregateTopCategory(
    transactions: {
      categoryId: string | null
      category: CategorySummary | null
    }[],
  ): { top: { count: number; cat: CategorySummary }; total: number } | null {
    const counts: Record<string, { count: number; cat: CategorySummary }> = {}
    let total = 0
    for (const tx of transactions) {
      if (!tx.categoryId || !tx.category) continue
      total++
      if (!counts[tx.categoryId]) {
        counts[tx.categoryId] = { count: 0, cat: tx.category }
      }
      counts[tx.categoryId].count++
    }

    const sorted = Object.values(counts).sort((a, b) => b.count - a.count)
    if (sorted.length === 0) return null
    return { top: sorted[0], total }
  }

  private async matchExactMerchantHistory(
    userId: string,
    rawMerchant: string,
  ): Promise<CategorySuggestionResponse | null> {
    if (!rawMerchant) return null

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

    const aggregated = this.aggregateTopCategory(merchantTxs)
    if (!aggregated) return null

    const { top, total } = aggregated
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

  private async matchNormalizedMerchantHistory(
    userId: string,
    rawMerchant: string,
  ): Promise<CategorySuggestionResponse | null> {
    const normMerchant = normalizeMerchant(rawMerchant)
    if (!normMerchant || normMerchant === rawMerchant.toLowerCase()) return null

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

    const aggregated = this.aggregateTopCategory(matching)
    if (!aggregated) return null

    return {
      categoryId: aggregated.top.cat.id,
      categoryName: aggregated.top.cat.name,
      categoryIcon: aggregated.top.cat.icon,
      confidence: 'MEDIUM',
      reason: `Matched normalized merchant pattern "${normMerchant}"`,
    }
  }

  private async matchDescriptionKeywordHistory(
    userId: string,
    rawDescription: string,
  ): Promise<CategorySuggestionResponse | null> {
    if (!rawDescription) return null

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

    const aggregated = this.aggregateTopCategory(descTxs)
    if (!aggregated) return null

    return {
      categoryId: aggregated.top.cat.id,
      categoryName: aggregated.top.cat.name,
      categoryIcon: aggregated.top.cat.icon,
      confidence: 'LOW',
      reason: `Matched description keyword history for "${rawDescription}"`,
    }
  }

  private async matchDictionaryKeywords(
    textToMatch: string,
    userId: string,
  ): Promise<CategorySuggestionResponse | null> {
    const categories = await prisma.category.findMany({
      where: {
        OR: [{ isSystem: true }, { userId }],
        isArchived: false,
      },
    })

    const dictionaries = [
      { dict: viDictionary.categoryKeywords, isVi: true },
      { dict: enDictionary.categoryKeywords, isVi: false },
    ]

    for (const { dict, isVi } of dictionaries) {
      for (const [catName, keywords] of Object.entries(dict)) {
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
                reason: isVi
                  ? `Matched Vietnamese keyword "${token}"`
                  : `Matched keyword "${token}"`,
              }
            }
          }
        }
      }
    }

    return null
  }

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

    const exactMatch = await this.matchExactMerchantHistory(userId, rawMerchant)
    if (exactMatch) return exactMatch

    const normMatch = await this.matchNormalizedMerchantHistory(
      userId,
      rawMerchant,
    )
    if (normMatch) return normMatch

    const descMatch = await this.matchDescriptionKeywordHistory(
      userId,
      rawDescription,
    )
    if (descMatch) return descMatch

    const textToMatch = `${rawMerchant} ${rawDescription}`.toLowerCase()
    const dictMatch = await this.matchDictionaryKeywords(textToMatch, userId)
    if (dictMatch) return dictMatch

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
