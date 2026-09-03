import {
  TransactionInputParser,
  ParserUserContext,
  ParseTransactionResult,
  ParsedTransactionDraft,
  UserAccountContext,
  UserCategoryContext,
} from './types.js'
import { enDictionary } from './dictionaries/en.js'
import { viDictionary } from './dictionaries/vi.js'
import { TransactionType } from '../transaction/index.js'

export function removeVietnameseAccents(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, (m) => (m === 'đ' ? 'd' : 'D'))
    .toLowerCase()
}

export class RuleBasedParser implements TransactionInputParser {
  private resolveMatchedAccounts(
    rawText: string,
    lowerNormalized: string,
    type: TransactionType,
    accounts: UserAccountContext[],
    warnings: string[],
  ): {
    accountId: string | null
    accountName: string | null
    transferAccountId: string | null
    transferAccountName: string | null
    accountConfidence: number
  } {
    if (type === 'transfer') {
      const transferMatch = this.matchTransferAccounts(
        rawText,
        lowerNormalized,
        accounts,
      )
      if (!transferMatch.sourceAccountId || !transferMatch.destAccountId) {
        warnings.push(
          'Please verify both source and destination accounts for the transfer.',
        )
      } else if (
        transferMatch.sourceAccountCurrency !==
        transferMatch.destAccountCurrency
      ) {
        warnings.push(
          'Source and destination accounts must use the same currency in Phase 3.',
        )
      }
      return {
        accountId: transferMatch.sourceAccountId,
        accountName: transferMatch.sourceAccountName,
        transferAccountId: transferMatch.destAccountId,
        transferAccountName: transferMatch.destAccountName,
        accountConfidence: transferMatch.confidence,
      }
    }

    const accountMatch = this.matchSingleAccount(
      rawText,
      lowerNormalized,
      accounts,
    )
    if (!accountMatch.accountId) {
      warnings.push('No matching account found. Please select an account.')
    }
    return {
      accountId: accountMatch.accountId,
      accountName: accountMatch.accountName,
      transferAccountId: null,
      transferAccountName: null,
      accountConfidence: accountMatch.confidence,
    }
  }

  private resolveFinalCurrency(
    extractedCurrency: string | null,
    accountId: string | null,
    context: ParserUserContext,
  ): string {
    if (extractedCurrency) return extractedCurrency
    if (accountId) {
      const acc = context.accounts.find((a) => a.id === accountId)
      if (acc) return acc.currency
    }
    return context.preferredCurrency || 'VND'
  }

  private calculateOverallConfidence(
    amountConf: number,
    typeConf: number,
    accConf: number,
    catConf: number,
    dateConf: number,
    isTransfer: boolean,
  ): number {
    const raw =
      (amountConf * 0.35 +
        typeConf * 0.2 +
        accConf * 0.25 +
        (isTransfer ? 1.0 : catConf) * 0.2) *
      dateConf
    return parseFloat(raw.toFixed(2))
  }

  parse(inputText: string, context: ParserUserContext): ParseTransactionResult {
    const rawText = inputText.trim()
    const warnings: string[] = []

    if (!rawText) {
      return {
        rawText,
        parsed: this.createEmptyDraft(),
        warnings: ['Empty input text'],
        requiresConfirmation: true,
      }
    }

    const lowerNormalized = removeVietnameseAccents(rawText)
    const { date, dateConfidence, cleanedFromDate } = this.extractDate(
      rawText,
      lowerNormalized,
    )
    const { amount, currency, amountConfidence, cleanedFromAmount } =
      this.extractAmountAndCurrency(cleanedFromDate, context)
    const { type, typeConfidence } = this.detectTransactionType(
      rawText,
      lowerNormalized,
    )

    const accountMatch = this.resolveMatchedAccounts(
      rawText,
      lowerNormalized,
      type,
      context.accounts,
      warnings,
    )

    const catMatch =
      type !== 'transfer'
        ? this.matchCategory(rawText, lowerNormalized, type, context.categories)
        : {
            categoryId: null,
            categoryName: null,
            categoryIcon: null,
            confidence: 0,
          }

    const { description, merchant } = this.extractDescriptionAndMerchant(
      rawText,
      cleanedFromAmount,
      catMatch.categoryName,
      type,
    )

    const finalCurrency = this.resolveFinalCurrency(
      currency,
      accountMatch.accountId,
      context,
    )
    const overallConfidence = this.calculateOverallConfidence(
      amountConfidence,
      typeConfidence,
      accountMatch.accountConfidence,
      catMatch.confidence,
      dateConfidence,
      type === 'transfer',
    )

    return {
      rawText,
      parsed: {
        type,
        amount,
        currency: finalCurrency,
        accountId: accountMatch.accountId,
        accountName: accountMatch.accountName,
        transferAccountId: accountMatch.transferAccountId,
        transferAccountName: accountMatch.transferAccountName,
        categoryId: catMatch.categoryId,
        categoryName: catMatch.categoryName,
        categoryIcon: catMatch.categoryIcon,
        description,
        merchant,
        transactionDate: date.toISOString(),
        confidence: {
          amount: amountConfidence,
          type: typeConfidence,
          account: accountMatch.accountConfidence,
          category: catMatch.confidence,
          date: dateConfidence,
          overall: overallConfidence,
        },
      },
      warnings,
      requiresConfirmation:
        overallConfidence < 0.85 || !amount || !accountMatch.accountId,
    }
  }

  private createEmptyDraft(): ParsedTransactionDraft {
    return {
      type: 'expense',
      amount: null,
      currency: 'VND',
      accountId: null,
      accountName: null,
      transferAccountId: null,
      transferAccountName: null,
      categoryId: null,
      categoryName: null,
      categoryIcon: null,
      description: '',
      merchant: null,
      transactionDate: new Date().toISOString(),
      confidence: {
        amount: 0,
        type: 0.5,
        account: 0,
        category: 0,
        date: 1,
        overall: 0,
      },
    }
  }

  // --- Date Parsing ---
  private extractDate(
    text: string,
    lowerNorm: string,
  ): { date: Date; dateConfidence: number; cleanedFromDate: string } {
    const now = new Date()
    let cleaned = text

    // Check Yesterday
    const yesterdayKeywords = [
      ...enDictionary.dateKeywords.yesterday,
      ...viDictionary.dateKeywords.yesterday,
    ]
    for (const kw of yesterdayKeywords) {
      const reg = new RegExp(`\\b${kw}\\b`, 'i')
      if (reg.test(cleaned) || lowerNorm.includes(kw)) {
        const yDate = new Date()
        yDate.setDate(now.getDate() - 1)
        cleaned = cleaned.replace(reg, '').trim()
        return { date: yDate, dateConfidence: 1.0, cleanedFromDate: cleaned }
      }
    }

    // Check Today
    const todayKeywords = [
      ...enDictionary.dateKeywords.today,
      ...viDictionary.dateKeywords.today,
    ]
    for (const kw of todayKeywords) {
      const reg = new RegExp(`\\b${kw}\\b`, 'i')
      if (reg.test(cleaned)) {
        cleaned = cleaned.replace(reg, '').trim()
        return { date: now, dateConfidence: 1.0, cleanedFromDate: cleaned }
      }
    }

    return { date: now, dateConfidence: 0.9, cleanedFromDate: cleaned }
  }

  // --- Amount & Multipliers Parsing ---
  private extractAmountAndCurrency(
    text: string,
    _context: ParserUserContext,
  ): {
    amount: string | null
    currency: string | null
    amountConfidence: number
    cleanedFromAmount: string
  } {
    let cleaned = text
    let detectedCurrency: string | null = null

    // Check explicit currency markers
    if (/\b(vnd|vnd|d|dong|dong)\b|₫/i.test(cleaned)) {
      detectedCurrency = 'VND'
      cleaned = cleaned.replace(/\b(vnd|vnd|dong|dong)\b|₫/gi, ' ')
    } else if (/\b(usd|dollar|dollars)\b|\$/i.test(cleaned)) {
      detectedCurrency = 'USD'
      cleaned = cleaned.replace(/\b(usd|dollar|dollars)\b|\$/gi, ' ')
    } else if (/\b(eur|euro)\b|€/i.test(cleaned)) {
      detectedCurrency = 'EUR'
      cleaned = cleaned.replace(/\b(eur|euro)\b|€/gi, ' ')
    }

    // Match numbers with multiplier suffix or words:
    // e.g. 85k, 85.5k, 2m, 32tr, 32 triệu, 80 nghìn, 85,000, 1500.50
    // Pattern 1: Number + Multiplier Token (k, tr, m, trieu, nghin, củ, v.v.)
    const multiplierRegex =
      /(\d+(?:[.,]\d+)?)\s*(k|ngh[iì]n|ng[aà]n|thousand|tr|tri[eệ]u|mil|million|c[uủ]|m|b|t[yỷ]|billion)\b/i
    const multMatch = cleaned.match(multiplierRegex)

    if (multMatch) {
      const numStr = multMatch[1].replace(',', '.')
      const unit = multMatch[2].toLowerCase()
      const numVal = parseFloat(numStr)

      let multiplier = 1
      const lowerUnit = removeVietnameseAccents(unit)

      if (['k', 'nghin', 'ngan', 'thousand'].includes(lowerUnit)) {
        multiplier = 1000
        if (!detectedCurrency) detectedCurrency = 'VND'
      } else if (
        ['tr', 'trieu', 'cu', 'm', 'mil', 'million'].includes(lowerUnit)
      ) {
        multiplier = 1000000
        if (!detectedCurrency && ['tr', 'trieu', 'cu'].includes(lowerUnit)) {
          detectedCurrency = 'VND'
        }
      } else if (['b', 'ty', 'billion'].includes(lowerUnit)) {
        multiplier = 1000000000
      }

      const totalVal = Math.round(numVal * multiplier)
      cleaned = cleaned.replace(multMatch[0], ' ').trim()

      return {
        amount: totalVal.toString(),
        currency: detectedCurrency,
        amountConfidence: 1.0,
        cleanedFromAmount: cleaned,
      }
    }

    // Pattern 2: Raw number with formatted thousands (e.g. 85,000 or 85.000 or 1500.50)
    // 85,000 or 85.000 (VND standard)
    const formattedIntRegex = /\b(\d{1,3}(?:[.,]\d{3})+)\b/
    const formattedMatch = cleaned.match(formattedIntRegex)
    if (formattedMatch) {
      const rawNum = formattedMatch[1].replace(/[.,]/g, '')
      cleaned = cleaned.replace(formattedMatch[0], ' ').trim()
      return {
        amount: rawNum,
        currency: detectedCurrency || 'VND',
        amountConfidence: 0.98,
        cleanedFromAmount: cleaned,
      }
    }

    // Pattern 3: Standard decimal or integer (e.g. 1500.50 or 85000 or 100)
    const plainNumRegex = /\b(\d+(?:\.\d{1,4})?)\b/
    const plainMatch = cleaned.match(plainNumRegex)
    if (plainMatch) {
      const rawNum = plainMatch[1]
      cleaned = cleaned.replace(plainMatch[0], ' ').trim()
      return {
        amount: rawNum,
        currency: detectedCurrency,
        amountConfidence: 0.95,
        cleanedFromAmount: cleaned,
      }
    }

    return {
      amount: null,
      currency: detectedCurrency,
      amountConfidence: 0,
      cleanedFromAmount: cleaned,
    }
  }

  // --- Transaction Type Detection ---
  private detectTransactionType(
    rawText: string,
    lowerNorm: string,
  ): { type: TransactionType; typeConfidence: number } {
    // 1. Check Transfer keywords
    const transferKeywords = [
      ...enDictionary.transferKeywords,
      ...viDictionary.transferKeywords,
    ]
    for (const kw of transferKeywords) {
      const kwNorm = removeVietnameseAccents(kw)
      if (lowerNorm.includes(kwNorm)) {
        return { type: 'transfer', typeConfidence: 0.98 }
      }
    }

    // Check "from ... to ..." or "từ ... sang ..."
    if (
      (lowerNorm.includes('from ') && lowerNorm.includes(' to ')) ||
      (lowerNorm.includes('tu ') &&
        (lowerNorm.includes(' sang ') || lowerNorm.includes(' vao ')))
    ) {
      return { type: 'transfer', typeConfidence: 0.95 }
    }

    // 2. Check Income keywords
    const incomeKeywords = [
      ...enDictionary.incomeKeywords,
      ...viDictionary.incomeKeywords,
    ]
    for (const kw of incomeKeywords) {
      const kwNorm = removeVietnameseAccents(kw)
      if (lowerNorm.includes(kwNorm)) {
        return { type: 'income', typeConfidence: 0.95 }
      }
    }

    // 3. Default to Expense
    return { type: 'expense', typeConfidence: 0.85 }
  }

  // --- Single Account Matching ---
  private matchSingleAccount(
    rawText: string,
    lowerNorm: string,
    accounts: UserAccountContext[],
  ): {
    accountId: string | null
    accountName: string | null
    confidence: number
  } {
    const activeAccounts = accounts.filter((a) => !a.isArchived)
    if (activeAccounts.length === 0) {
      return { accountId: null, accountName: null, confidence: 0 }
    }

    // Exact or normalized name matching in text
    for (const acc of activeAccounts) {
      const accNorm = removeVietnameseAccents(acc.name)
      if (lowerNorm.includes(accNorm)) {
        return { accountId: acc.id, accountName: acc.name, confidence: 0.98 }
      }
    }

    // Alias / Type keyword matching (e.g. "cash", "tien mat", "vcb", "vietcombank", "bank")
    for (const acc of activeAccounts) {
      const accType = acc.type.toLowerCase()
      const enKeywords = enDictionary.accountTypeKeywords as Record<
        string,
        string[]
      >
      const viKeywords = viDictionary.accountTypeKeywords as Record<
        string,
        string[]
      >
      const enAliases = enKeywords[accType] || []
      const viAliases = viKeywords[accType] || []
      const allAliases = [...enAliases, ...viAliases]

      for (const alias of allAliases) {
        const aliasNorm = removeVietnameseAccents(alias)
        const regex = new RegExp(`\\b${aliasNorm}\\b`, 'i')
        if (regex.test(lowerNorm) || lowerNorm.includes(aliasNorm)) {
          return { accountId: acc.id, accountName: acc.name, confidence: 0.92 }
        }
      }
    }

    // Default account fallback
    const defaultAcc = activeAccounts.find((a) => a.isDefault)
    if (defaultAcc) {
      return {
        accountId: defaultAcc.id,
        accountName: defaultAcc.name,
        confidence: 0.7,
      }
    }

    if (activeAccounts.length === 1) {
      return {
        accountId: activeAccounts[0].id,
        accountName: activeAccounts[0].name,
        confidence: 0.8,
      }
    }

    return { accountId: null, accountName: null, confidence: 0 }
  }

  // --- Transfer Accounts Matching (Source -> Destination) ---
  private matchTransferAccounts(
    rawText: string,
    lowerNorm: string,
    accounts: UserAccountContext[],
  ): {
    sourceAccountId: string | null
    sourceAccountName: string | null
    sourceAccountCurrency: string | null
    destAccountId: string | null
    destAccountName: string | null
    destAccountCurrency: string | null
    confidence: number
  } {
    const activeAccounts = accounts.filter((a) => !a.isArchived)

    // Extract segments using "from X to Y" or "từ X sang Y"
    let sourceAcc: UserAccountContext | null = null
    let destAcc: UserAccountContext | null = null

    // Try finding "from/từ <source>"
    const fromKeywords = [
      ...enDictionary.transferFromKeywords,
      ...viDictionary.transferFromKeywords,
    ]
    const toKeywords = [
      ...enDictionary.transferToKeywords,
      ...viDictionary.transferToKeywords,
    ]

    for (const acc of activeAccounts) {
      const accNorm = removeVietnameseAccents(acc.name)
      for (const fromKw of fromKeywords) {
        const fromPattern = `${fromKw} ${accNorm}`
        if (lowerNorm.includes(fromPattern)) {
          sourceAcc = acc
          break
        }
      }
      for (const toKw of toKeywords) {
        const toPattern = `${toKw} ${accNorm}`
        if (lowerNorm.includes(toPattern)) {
          destAcc = acc
          break
        }
      }
    }

    // Try keyword type match for source/dest (e.g. "from Vietcombank to Cash" or "từ vietcombank sang tiền mặt")
    if (!sourceAcc || !destAcc) {
      for (const acc of activeAccounts) {
        const accType = acc.type.toLowerCase()
        const enKeywords = enDictionary.accountTypeKeywords as Record<
          string,
          string[]
        >
        const viKeywords = viDictionary.accountTypeKeywords as Record<
          string,
          string[]
        >
        const enAliases = enKeywords[accType] || []
        const viAliases = viKeywords[accType] || []
        const aliases = [...enAliases, ...viAliases]

        for (const alias of aliases) {
          const aliasNorm = removeVietnameseAccents(alias)
          for (const fromKw of fromKeywords) {
            if (lowerNorm.includes(`${fromKw} ${aliasNorm}`) && !sourceAcc) {
              sourceAcc = acc
            }
          }
          for (const toKw of toKeywords) {
            if (lowerNorm.includes(`${toKw} ${aliasNorm}`) && !destAcc) {
              destAcc = acc
            }
          }
        }
      }
    }

    // Fallback: If 2 distinct accounts are mentioned anywhere in text
    if (!sourceAcc || !destAcc) {
      const mentioned: UserAccountContext[] = []
      for (const acc of activeAccounts) {
        const accNorm = removeVietnameseAccents(acc.name)
        if (
          lowerNorm.includes(accNorm) &&
          !mentioned.some((m) => m.id === acc.id)
        ) {
          mentioned.push(acc)
        }
      }
      if (mentioned.length >= 2) {
        sourceAcc = sourceAcc || mentioned[0]
        destAcc =
          destAcc ||
          (mentioned[1].id !== sourceAcc.id ? mentioned[1] : mentioned[0])
      }
    }

    const confidence =
      sourceAcc && destAcc ? 0.95 : sourceAcc || destAcc ? 0.6 : 0

    return {
      sourceAccountId: sourceAcc ? sourceAcc.id : null,
      sourceAccountName: sourceAcc ? sourceAcc.name : null,
      sourceAccountCurrency: sourceAcc ? sourceAcc.currency : null,
      destAccountId: destAcc ? destAcc.id : null,
      destAccountName: destAcc ? destAcc.name : null,
      destAccountCurrency: destAcc ? destAcc.currency : null,
      confidence,
    }
  }

  // --- Category Matching ---
  private matchCategory(
    rawText: string,
    lowerNorm: string,
    type: TransactionType,
    categories: UserCategoryContext[],
  ): {
    categoryId: string | null
    categoryName: string | null
    categoryIcon: string | null
    confidence: number
  } {
    const validCategories = categories.filter((c) => c.type === type)

    // 1. Direct name match in categories
    for (const cat of validCategories) {
      const catNorm = removeVietnameseAccents(cat.name)
      if (lowerNorm.includes(catNorm)) {
        return {
          categoryId: cat.id,
          categoryName: cat.name,
          categoryIcon: cat.icon,
          confidence: 0.95,
        }
      }
    }

    // 2. Dictionary keyword match
    const enDict = enDictionary.categoryKeywords
    const viDict = viDictionary.categoryKeywords

    for (const cat of validCategories) {
      const enKeywords = enDict[cat.name] || []
      const viKeywords = viDict[cat.name] || []
      const allKeywords = [...enKeywords, ...viKeywords]

      for (const kw of allKeywords) {
        const kwNorm = removeVietnameseAccents(kw)
        const regex = new RegExp(`\\b${kwNorm}\\b`, 'i')
        if (regex.test(lowerNorm) || lowerNorm.includes(kwNorm)) {
          return {
            categoryId: cat.id,
            categoryName: cat.name,
            categoryIcon: cat.icon,
            confidence: 0.88,
          }
        }
      }
    }

    return {
      categoryId: null,
      categoryName: null,
      categoryIcon: null,
      confidence: 0,
    }
  }

  // --- Description & Merchant Extraction ---
  private extractDescriptionAndMerchant(
    rawText: string,
    cleanedText: string,
    categoryName: string | null,
    type: TransactionType,
  ): { description: string; merchant: string | null } {
    // Detect well-known merchants
    const merchantKeywords = [
      'Highlands Coffee',
      'Highlands',
      'Starbucks',
      'The Coffee House',
      'Phuc Long',
      'Katinat',
      'Grab',
      'Be',
      'Gojek',
      'Xanh SM',
      'Shopee',
      'Lazada',
      'Tiki',
      'WinMart',
      'Coopmart',
      'Bach Hoa Xanh',
      'Big C',
      'McDonalds',
      'KFC',
      'Pizza Hut',
      'CGV',
      'Lotte Cinema',
      'Netflix',
      'Spotify',
    ]

    let merchant: string | null = null
    const lowerRaw = rawText.toLowerCase()

    for (const m of merchantKeywords) {
      if (lowerRaw.includes(m.toLowerCase())) {
        merchant = m
        break
      }
    }

    // Clean up description
    let desc = cleanedText
      .replace(
        /\b(to|from|into|từ|tu|sang|vào|vao|đến|den|bằng|bang|with|qua)\b/gi,
        ' ',
      )
      .replace(/\s+/g, ' ')
      .trim()

    // Capitalize first letter
    if (desc.length > 0) {
      desc = desc.charAt(0).toUpperCase() + desc.slice(1)
    } else {
      desc =
        merchant ||
        categoryName ||
        (type === 'transfer'
          ? 'Transfer'
          : type === 'income'
            ? 'Income'
            : 'Expense')
    }

    return { description: desc, merchant }
  }
}
