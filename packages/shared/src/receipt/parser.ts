import { FieldConfidence, FieldConfidences } from './index.js';
import { enDictionary } from '../parser/dictionaries/en.js';
import { viDictionary } from '../parser/dictionaries/vi.js';

export interface ExtractedReceiptItem {
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
}

export interface ExtractedReceiptData {
  merchant: string | null;
  transactionDate: Date | null;
  totalAmount: number | null;
  currency: string | null;
  suggestedCategoryId?: string | null;
  suggestedCategoryName?: string | null;
  rawText: string;
  detectedLanguage: 'vi' | 'en' | 'mixed';
  confidence: number;
  fieldConfidences: FieldConfidences;
  items: ExtractedReceiptItem[];
}

export interface ExtractionContext {
  userCategories?: Array<{ id: string; name: string }>;
  defaultCurrency?: string;
}

// Regex patterns
const VN_DIACRITICS_REGEX = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/i;

const CURRENCY_PATTERNS: Array<{ regex: RegExp; code: string }> = [
  { regex: /\b(VNĐ|VND|đ|₫|dong|đồng)\b/i, code: 'VND' },
  { regex: /\b(USD|\$|dollar|dollars)\b/i, code: 'USD' },
  { regex: /\b(EUR|€|euro|euros)\b/i, code: 'EUR' },
  { regex: /\b(JPY|¥|yen)\b/i, code: 'JPY' },
  { regex: /\b(SGD|S\$)\b/i, code: 'SGD' },
  { regex: /\b(THB|฿|baht)\b/i, code: 'THB' },
  { regex: /\b(GBP|£|pound|pounds)\b/i, code: 'GBP' },
];

const TOTAL_KEYWORDS_REGEX = /(TỔNG\s*CỘNG|THÀNH\s*TIỀN|TỔNG\s*TIỀN|TỔNG\s*THANH\s*TOÁN|THANH\s*TOÁN|GRAND\s*TOTAL|TOTAL\s*DUE|AMOUNT\s*DUE|BALANCE\s*DUE|TOTAL\s*PAID|PAYMENT\s*TOTAL|\bTOTAL\b|\bTỔNG\b)/i;

const NON_TOTAL_KEYWORDS_REGEX = /(SUBTOTAL|SUB\s*TOTAL|TIỀN\s*HÀNG|TỔNG\s*TIỀN\s*HÀNG|TẠM\s*TÍNH|TAX|VAT|THUẾ|DISCOUNT|GIẢM\s*GIÁ|CHIẾT\s*KHẤU|TIỀN\s*KHÁCH\s*ĐƯA|TIỀN\s*MẶT|CASH\b|TIỀN\s*THỐI|TIỀN\s*TRẢ\s*LẠI|CHANGE\b)/i;

const HEADER_IGNORE_REGEX = /^(RECEIPT|INVOICE|HOÁ\s*ĐƠN|HÓA\s*ĐƠN|PHIẾU\s*THANH\s*TOÁN|PHIẾU\s*TÍNH\s*TIỀN|BIÊN\s*LAI|BIÊN\s*NHẬN|CỬA\s*HÀNG|STORE|SHOP|WELCOME|THANK\s*YOU|CẢM\s*ƠN|TEL|HOTLINE|ĐT|ĐIỆN\s*THOẠI|FAX|MST|MÃ\s*SỐ\s*THUẾ|TAX\s*ID|ĐỊA\s*CHỈ|Đ\/C|ADDRESS|DATE|NGÀY|TIME|GIỜ|STT|NO\.|QUẦY|THU\s*NGÂN|CASHIER)/i;

/**
 * Parses numeric currency strings taking Vietnamese vs English decimal/thousand conventions into account.
 */
export function parseReceiptAmount(amountStr: string, isVNDContext = true): number | null {
  if (!amountStr) return null;

  // Clean currency symbols and non-numeric chars except . , -
  let clean = amountStr.replace(/[^0-9.,]/g, '').trim();
  if (!clean) return null;

  // Case 1: Multiple dots e.g., "1.250.000" or "80.000" (Vietnamese thousands)
  if (/^\d{1,3}(\.\d{3})+$/.test(clean)) {
    return parseInt(clean.replace(/\./g, ''), 10);
  }

  // Case 2: Multiple commas e.g., "1,250,000" or "80,000" (English thousands)
  if (/^\d{1,3}(,\d{3})+$/.test(clean)) {
    return parseInt(clean.replace(/,/g, ''), 10);
  }

  // Case 3: English format with comma thousands and dot decimal e.g., "1,250.50" or "80.00"
  if (/^\d{1,3}(,\d{3})*\.\d{1,2}$/.test(clean)) {
    return parseFloat(clean.replace(/,/g, ''));
  }

  // Case 4: European / Vietnamese format with dot thousands and comma decimal e.g., "1.250,50" or "80,00"
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(clean)) {
    return parseFloat(clean.replace(/\./g, '').replace(',', '.'));
  }

  // Case 5: Single dot e.g. "80.000" vs "80.00"
  if (/^\d+\.\d+$/.test(clean)) {
    const parts = clean.split('.');
    if (parts[1].length === 3) {
      // 3 decimals e.g., 45.000 or 80.000 -> standard VND thousand separator
      return parseInt(clean.replace(/\./g, ''), 10);
    }
    if (parts[1].length <= 2) {
      if (isVNDContext && parseInt(parts[0], 10) < 1000 && parseInt(parts[1], 10) === 0) {
        // In VND receipts, 80.00 is sometimes OCR artifact for 80,000 or 80k
        return parseFloat(clean);
      }
      return parseFloat(clean);
    }
  }

  // Case 6: Single comma e.g. "80,000" or "80,00"
  if (/^\d+,\d+$/.test(clean)) {
    const parts = clean.split(',');
    if (parts[1].length === 3) {
      return parseInt(clean.replace(/,/g, ''), 10);
    }
    if (parts[1].length <= 2) {
      return parseFloat(parts[0] + '.' + parts[1]);
    }
  }

  // Fallback plain integer
  const plainNum = parseInt(clean.replace(/[^0-9]/g, ''), 10);
  return isNaN(plainNum) ? null : plainNum;
}

/**
 * Extracts date from text lines
 */
export function extractDate(lines: string[]): { date: Date | null; confidence: 'high' | 'medium' | 'low' | 'none' } {
  for (const line of lines) {
    // 1. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const dmyMatch = line.match(/\b([0-3]?[0-9])[\/\-.]([0-1]?[0-9])[\/\-.](20\d{2})\b/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10) - 1;
      const year = parseInt(dmyMatch[3], 10);
      if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
        const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
        return { date: d, confidence: 'high' };
      }
    }

    // 2. YYYY-MM-DD or YYYY/MM/DD
    const ymdMatch = line.match(/\b(20\d{2})[\/\-.]([0-1]?[0-9])[\/\-.]([0-3]?[0-9])\b/);
    if (ymdMatch) {
      const year = parseInt(ymdMatch[1], 10);
      const month = parseInt(ymdMatch[2], 10) - 1;
      const day = parseInt(ymdMatch[3], 10);
      if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
        const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
        return { date: d, confidence: 'high' };
      }
    }

    // 3. DD Month YYYY (e.g. 24 Aug 2026 or 24 Thg 8 2026)
    const textMonthMatch = line.match(/\b([0-3]?[0-9])\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Tháng\s*\d+|Thg\s*\d+)[,\s]+(20\d{2})\b/i);
    if (textMonthMatch) {
      const day = parseInt(textMonthMatch[1], 10);
      const year = parseInt(textMonthMatch[3], 10);
      const monthStr = textMonthMatch[2].toLowerCase();
      let month = 0;
      const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const idx = months.findIndex((m) => monthStr.startsWith(m));
      if (idx !== -1) month = idx;
      else {
        const vnM = monthStr.match(/\d+/);
        if (vnM) month = parseInt(vnM[0], 10) - 1;
      }
      if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
        return { date: new Date(Date.UTC(year, month, day, 12, 0, 0)), confidence: 'high' };
      }
    }
  }

  return { date: null, confidence: 'none' };
}

/**
 * Extracts merchant name from header lines
 */
export function extractMerchant(lines: string[]): { merchant: string | null; confidence: 'high' | 'medium' | 'low' | 'none' } {
  const candidateLines: string[] = [];

  for (let i = 0; i < Math.min(lines.length, 8); i++) {
    const line = lines[i].trim();
    if (!line || line.length < 2) continue;

    // Ignore known non-merchant header patterns
    if (HEADER_IGNORE_REGEX.test(line)) continue;
    if (line.includes('===') || line.includes('---') || line.includes('***')) continue;
    if (/^\d+$/.test(line)) continue;

    candidateLines.push(line);
  }

  if (candidateLines.length > 0) {
    const best = candidateLines[0]
      .replace(/^[\s\-–—:;.,*#]+/, '')
      .replace(/[\s\-–—:;.,*#]+$/, '')
      .trim();

    if (best.length >= 2) {
      return { merchant: best, confidence: candidateLines.length === 1 ? 'high' : 'medium' };
    }
  }

  return { merchant: null, confidence: 'none' };
}

/**
 * Main receipt data extractor
 */
export function extractReceiptData(rawText: string, context?: ExtractionContext): ExtractedReceiptData {
  if (!rawText || !rawText.trim()) {
    return {
      merchant: null,
      transactionDate: null,
      totalAmount: null,
      currency: null,
      rawText: rawText || '',
      detectedLanguage: 'en',
      confidence: 0,
      fieldConfidences: {
        merchant: 'none',
        transactionDate: 'none',
        totalAmount: 'none',
        currency: 'none',
        category: 'none',
        account: 'none',
      },
      items: [],
    };
  }

  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // 1. Language Detection
  const hasVnDiacritics = VN_DIACRITICS_REGEX.test(rawText);
  const hasVnKeywords = /\b(hoá đơn|hóa đơn|phiếu|thanh toán|tổng cộng|thành tiền|tiền mặt|cà phê|quán|bán hàng|cửa hàng)\b/i.test(rawText);
  const isVietnamese = hasVnDiacritics || hasVnKeywords;
  const detectedLanguage: 'vi' | 'en' | 'mixed' = isVietnamese ? 'vi' : 'en';

  // 2. Currency Detection
  let detectedCurrency: string | null = null;
  let currencyConfidence: FieldConfidence = 'none';

  for (const { regex, code } of CURRENCY_PATTERNS) {
    if (regex.test(rawText)) {
      detectedCurrency = code;
      currencyConfidence = 'high';
      break;
    }
  }

  if (!detectedCurrency) {
    if (isVietnamese) {
      detectedCurrency = 'VND';
      currencyConfidence = 'medium';
    } else if (context?.defaultCurrency) {
      detectedCurrency = context.defaultCurrency;
      currencyConfidence = 'low';
    }
  }

  const isVND = detectedCurrency === 'VND';

  // 3. Merchant Detection
  const { merchant, confidence: merchantConfidence } = extractMerchant(lines);

  // 4. Date Detection
  const { date: transactionDate, confidence: dateConfidence } = extractDate(lines);

  // 5. Total and Line Items Detection
  let totalAmount: number | null = null;
  let amountConfidence: FieldConfidence = 'none';
  const extractedItems: ExtractedReceiptItem[] = [];

  // Reverse scan to prioritize bottom totals
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];

    // Check if line contains Total keyword
    if (TOTAL_KEYWORDS_REGEX.test(line)) {
      // Ensure it's not a Subtotal or discount or change line unless explicitly matching grand total
      if (NON_TOTAL_KEYWORDS_REGEX.test(line) && !/(TỔNG\s*CỘNG|GRAND\s*TOTAL|TOTAL\s*DUE|AMOUNT\s*DUE)/i.test(line)) {
        continue;
      }

      // Extract numeric values in this line or subsequent line
      const amounts = line.match(/([0-9.,]{2,})/g);
      if (amounts && amounts.length > 0) {
        // Pick the last amount on the total line
        const parsed = parseReceiptAmount(amounts[amounts.length - 1], isVND);
        if (parsed !== null && parsed > 0) {
          totalAmount = parsed;
          amountConfidence = 'high';
          break;
        }
      } else if (i + 1 < lines.length) {
        // Next line might contain the amount
        const nextAmounts = lines[i + 1].match(/([0-9.,]{2,})/g);
        if (nextAmounts && nextAmounts.length > 0) {
          const parsed = parseReceiptAmount(nextAmounts[nextAmounts.length - 1], isVND);
          if (parsed !== null && parsed > 0) {
            totalAmount = parsed;
            amountConfidence = 'high';
            break;
          }
        }
      }
    }
  }

  // Fallback: If no explicit total keyword found, find largest reasonable amount
  if (totalAmount === null) {
    let maxAmount = 0;
    for (const line of lines) {
      if (NON_TOTAL_KEYWORDS_REGEX.test(line)) continue;
      const matches = line.match(/([0-9.,]{3,})/g);
      if (matches) {
        for (const m of matches) {
          const parsed = parseReceiptAmount(m, isVND);
          if (parsed !== null && parsed > maxAmount && parsed < 1000000000) {
            maxAmount = parsed;
          }
        }
      }
    }
    if (maxAmount > 0) {
      totalAmount = maxAmount;
      amountConfidence = 'low';
    }
  }

  // 6. Line Item Extraction (between top header and total lines)
  for (const line of lines) {
    if (HEADER_IGNORE_REGEX.test(line) || TOTAL_KEYWORDS_REGEX.test(line) || NON_TOTAL_KEYWORDS_REGEX.test(line)) {
      continue;
    }
    if (line.length < 4 || line.includes('===') || line.includes('---')) continue;

    // Pattern: Description ... [Qty x Price] ... Total
    const itemMatch = line.match(/^(.+?)\s+([0-9.,]{2,})$/);
    if (itemMatch) {
      const desc = itemMatch[1].trim();
      const amountStr = itemMatch[2];
      const parsedPrice = parseReceiptAmount(amountStr, isVND);

      if (desc.length > 2 && parsedPrice !== null && parsedPrice > 0 && parsedPrice <= (totalAmount || 1000000000)) {
        // Check for quantity in description e.g. "Cà phê x 2" or "2x Coffee"
        let qty: number | null = 1;
        const qtyMatch = desc.match(/\b([1-9]\d*)\s*[xX]\b/) || desc.match(/\b[xX]\s*([1-9]\d*)\b/);
        if (qtyMatch) {
          qty = parseInt(qtyMatch[1], 10);
        }

        extractedItems.push({
          description: desc,
          quantity: qty,
          unitPrice: qty && qty > 1 ? parsedPrice / qty : parsedPrice,
          totalPrice: parsedPrice,
        });
      }
    }
  }

  // 7. Category Suggestion
  let suggestedCategoryId: string | null = null;
  let suggestedCategoryName: string | null = null;
  let categoryConfidence: FieldConfidence = 'none';

  const combinedSearchText = `${merchant || ''} ${lines.join(' ')}`.toLowerCase();

  // Keyword to category mappings
  const categoryKeywords: Record<string, string[]> = {
    ...enDictionary.categoryKeywords,
    ...viDictionary.categoryKeywords,
  };

  for (const [catName, keywords] of Object.entries(categoryKeywords)) {
    for (const kw of keywords) {
      if (combinedSearchText.includes(kw.toLowerCase())) {
        suggestedCategoryName = catName;
        categoryConfidence = merchant?.toLowerCase().includes(kw.toLowerCase()) ? 'high' : 'medium';
        break;
      }
    }
    if (suggestedCategoryName) break;
  }

  if (suggestedCategoryName && context?.userCategories) {
    const matched = context.userCategories.find(
      (c) => c.name.toLowerCase() === suggestedCategoryName?.toLowerCase()
    );
    if (matched) {
      suggestedCategoryId = matched.id;
    }
  }

  // Calculate overall confidence score (0 to 100)
  let score = 0;
  if (merchantConfidence === 'high') score += 25;
  else if (merchantConfidence === 'medium') score += 15;

  if (amountConfidence === 'high') score += 35;
  else if (amountConfidence === 'low') score += 15;

  if (dateConfidence === 'high') score += 20;
  else if (dateConfidence === 'medium') score += 10;

  if (currencyConfidence === 'high') score += 10;
  else if (currencyConfidence === 'medium') score += 5;

  if (categoryConfidence === 'high') score += 10;
  else if (categoryConfidence === 'medium') score += 5;

  const fieldConfidences: FieldConfidences = {
    merchant: merchantConfidence,
    transactionDate: dateConfidence,
    totalAmount: amountConfidence,
    currency: currencyConfidence,
    category: categoryConfidence,
    account: 'low', // Account is always low/suggestion since receipt does not prove account
  };

  return {
    merchant,
    transactionDate,
    totalAmount,
    currency: detectedCurrency,
    suggestedCategoryId,
    suggestedCategoryName,
    rawText,
    detectedLanguage,
    confidence: Math.min(score, 100),
    fieldConfidences,
    items: extractedItems,
  };
}
