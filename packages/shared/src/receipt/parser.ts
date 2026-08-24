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

// Scored total keywords: [regex, scoreBonus] — includes both diacritic and diacritic-free variants
const TOTAL_KEYWORDS_SCORED: Array<{ regex: RegExp; bonus: number }> = [
  { regex: /TỔNG\s*CỘNG/i, bonus: 30 },
  { regex: /TONG\s*CONG/i, bonus: 30 },  // OCR without diacritics
  { regex: /GRAND\s*TOTAL/i, bonus: 30 },
  { regex: /THÀNH\s*TIỀN/i, bonus: 25 },
  { regex: /THANH\s*TIEN/i, bonus: 25 },  // OCR without diacritics
  { regex: /TỔNG\s*TIỀN/i, bonus: 25 },
  { regex: /TONG\s*TIEN/i, bonus: 25 },
  { regex: /TỔNG\s*THANH\s*TOÁN/i, bonus: 25 },
  { regex: /TONG\s*THANH\s*TOAN/i, bonus: 25 },
  { regex: /TOTAL\s*DUE/i, bonus: 25 },
  { regex: /AMOUNT\s*DUE/i, bonus: 25 },
  { regex: /BALANCE\s*DUE/i, bonus: 20 },
  { regex: /TOTAL\s*PAID/i, bonus: 20 },
  { regex: /PAYMENT\s*TOTAL/i, bonus: 20 },
  { regex: /\bTOTAL\b/i, bonus: 15 },
  { regex: /\bTỔNG\b/i, bonus: 15 },
  { regex: /\bTONG\b/i, bonus: 15 },
  { regex: /THANH\s*TOÁN/i, bonus: 15 },
  { regex: /THANH\s*TOAN/i, bonus: 15 },
];

const NON_TOTAL_KEYWORDS_REGEX = /(SUBTOTAL|SUB\s*TOTAL|TIỀN\s*HÀNG|TỔNG\s*TIỀN\s*HÀNG|TẠM\s*TÍNH|TAX|VAT|THUẾ|DISCOUNT|GIẢM\s*GIÁ|CHIẾT\s*KHẤU|TIỀN\s*KHÁCH\s*ĐƯA|TIỀN\s*KHÁCH\s*TRẢ|TIỀN\s*MẶT|CASH\b|TIỀN\s*THỐI|TIỀN\s*TRẢ\s*LẠI|CHANGE\b)/i;

// Payment method lines — these often show the same amount as the total
// Used ONLY for agreement scoring (confirming which total is correct), not as total candidates
const PAYMENT_KEYWORDS_REGEX = /(MOMO|VNPAY|ZALOPAY|THANH\s*TOÁN\s*QR|CHUYỂN\s*KHOẢN|CARD\b|VISA\b|MASTERCARD|BANK\b|AGRI\b|VCB\b|VTB\b|TPB\b|MB\b|ACB\b|SHB\b|HDB\b|OCB\b|EXIMBANK|VIETIN\b|TECHCOMBANK|SACOMBANK|PUBLIC\s*BANK|LIOABANK|KEB\s*HANA|WOORI|HSBC|STANDARD\s*CHARTERED|CIMB|CITIBANK)/i;

const HEADER_IGNORE_REGEX = /^(RECEIPT|INVOICE|HOÁ\s*ĐƠN|HÓA\s*ĐƠN|PHIẾU\s*THANH\s*TOÁN|PHIẾU\s*TÍNH\s*TIỀN|BIÊN\s*LAI|BIÊN\s*NHẬN|CỬA\s*HÀNG|STORE|SHOP|WELCOME|THANK\s*YOU|CẢM\s*ƠN|TEL|HOTLINE|ĐT|ĐIỆN\s*THOẠI|FAX|MST|MÃ\s*SỐ\s*THUẾ|TAX\s*ID|ĐỊA\s*CHỈ|Đ\/C|ADDRESS|DATE|NGÀY|TIME|GIỜ|STT|NO\.|QUẦY|THU\s*NGÂN|CASHIER)/i;

/**
 * Normalize OCR text: clean up Unicode artifacts, repeated spaces, common OCR mistakes.
 */
export function normalizeOCRText(text: string): string {
  let normalized = text;
  // Replace weird Unicode whitespace with regular space
  normalized = normalized.replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ');
  // Collapse multiple spaces
  normalized = normalized.replace(/ {2,}/g, ' ');
  // Normalize line breaks
  normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Remove trailing whitespace per line
  normalized = normalized.split('\n').map((l) => l.trimEnd()).join('\n');
  return normalized.trim();
}

/**
 * Fix common OCR confusions in numeric/currency contexts only.
 * Only applies corrections where the token is clearly numeric.
 */
export function fixOCRNumericConfusions(text: string): string {
  let fixed = text;
  // Fix "O" → "0" in tokens that are predominantly numeric
  // e.g., "8O.OOO" → "80.000", "45O00" → "45000", "2O26" → "2026"
  fixed = fixed.replace(/\b(\d[Oo\d]*[.,]?[Oo\d]*)\b/g, (match) => {
    // If it contains at least one digit and at least one O, fix the O's
    if (/\d/.test(match) && /[Oo]/.test(match)) {
      return match.replace(/[Oo]/g, '0');
    }
    return match;
  });
  // Fix standalone O's between digits (e.g., "24/O8" → "24/08")
  fixed = fixed.replace(/(\d)\/([Oo])(\d)/g, '$1/0$3');
  fixed = fixed.replace(/(\d)([Oo])(\d)/g, '$10$3');
  return fixed;
}

/**
 * Fix VND-specific OCR variations.
 * "45 000" → "45000", "45.OOO" → "45000" (when context is VND)
 */
export function fixVNDAmountOCR(text: string): string {
  // Fix dot-as-thousand-separator OCR errors: "1.25O.00O" → "1.250.000"
  let fixed = text.replace(/(\d{1,3})\.(\d{3})\.(\d{3})/g, (match, p1, p2, p3) => {
    const fixedP2 = p2.replace(/[OoO]/g, '0');
    const fixedP3 = p3.replace(/[OoO]/g, '0');
    return `${p1}.${fixedP2}.${fixedP3}`;
  });
  // Fix space-separated thousands: "45 000" → "45000" (when surrounded by other numbers)
  fixed = fixed.replace(/\b(\d{1,3})\s(\d{3})\b/g, '$1$2');
  return fixed;
}

/**
 * Parse numeric currency strings taking Vietnamese vs English decimal/thousand conventions into account.
 */
export function parseReceiptAmount(amountStr: string, isVNDContext = true): number | null {
  if (!amountStr) return null;

  // Fix OCR confusions: replace O/o → 0 and l/I → 1 in the raw amount string
  // Safe because at this point we expect a numeric amount string
  let clean = amountStr.replace(/[Oo]/g, '0');
  clean = clean.replace(/(\d)[lI](\d)/g, '$11$2'); // l/I → 1 only between digits

  // Clean currency symbols and non-numeric chars except . , -
  clean = clean.replace(/[^0-9.,]/g, '').trim();
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
 * Extract date from text lines with improved multi-format support.
 */
export function extractDate(lines: string[]): { date: Date | null; confidence: 'high' | 'medium' | 'low' | 'none' } {
  const candidates: Array<{ date: Date; confidence: 'high' | 'medium' | 'low' }> = [];

  for (const line of lines) {
    // 1. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY (most common in VN receipts)
    const dmyMatch = line.match(/\b([0-3]?[0-9])[\/\-.]([0-1]?[0-9])[\/\-.](20\d{2})\b/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10) - 1;
      const year = parseInt(dmyMatch[3], 10);
      if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
        const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
        candidates.push({ date: d, confidence: 'high' });
      }
    }

    // 2. DD/MM/YY
    const dmyShort = line.match(/\b([0-3]?[0-9])[\/\-.]([0-1]?[0-9])[\/\-.](\d{2})\b/);
    if (dmyShort && !dmyMatch) {
      const day = parseInt(dmyShort[1], 10);
      const month = parseInt(dmyShort[2], 10) - 1;
      const year = 2000 + parseInt(dmyShort[3], 10);
      if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
        const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
        candidates.push({ date: d, confidence: 'medium' });
      }
    }

    // 3. YYYY-MM-DD or YYYY/MM/DD
    const ymdMatch = line.match(/\b(20\d{2})[\/\-.]([0-1]?[0-9])[\/\-.]([0-3]?[0-9])\b/);
    if (ymdMatch) {
      const year = parseInt(ymdMatch[1], 10);
      const month = parseInt(ymdMatch[2], 10) - 1;
      const day = parseInt(ymdMatch[3], 10);
      if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
        const d = new Date(Date.UTC(year, month, day, 12, 0, 0));
        candidates.push({ date: d, confidence: 'high' });
      }
    }

    // 4. DD Month YYYY (e.g. 24 Aug 2026 or 24 Thg 8 2026)
    const textMonthMatch = line.match(
      /\b([0-3]?[0-9])\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Tháng\s*\d+|Thg\s*\d+|Thang\s*\d+)[,\s]+(20\d{2})\b/i
    );
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
        candidates.push({ date: new Date(Date.UTC(year, month, day, 12, 0, 0)), confidence: 'high' });
      }
    }

    // 5. DD-MM-YY (short year, common in receipts)
    const dmyShort2 = line.match(/\b([0-3]?[0-9])[\/\-.]([0-1]?[0-9])[\/\-.](\d{2})\b/);
    if (dmyShort2 && !dmyShort && !dmyMatch) {
      const day = parseInt(dmyShort2[1], 10);
      const month = parseInt(dmyShort2[2], 10) - 1;
      const year = 2000 + parseInt(dmyShort2[3], 10);
      if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
        candidates.push({ date: new Date(Date.UTC(year, month, day, 12, 0, 0)), confidence: 'medium' });
      }
    }

    // 6. "Ngày DD tháng MM năm YYYY" (Vietnamese full date)
    const vnFullDate = line.match(/(?:ngày|ngay)\s+(\d{1,2})\s+(?:tháng|thang|th)\s+(\d{1,2})\s+(?:năm|nam)\s+(20\d{2})/i);
    if (vnFullDate) {
      const day = parseInt(vnFullDate[1], 10);
      const month = parseInt(vnFullDate[2], 10) - 1;
      const year = parseInt(vnFullDate[3], 10);
      if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
        candidates.push({ date: new Date(Date.UTC(year, month, day, 12, 0, 0)), confidence: 'high' });
      }
    }
  }

  if (candidates.length === 0) return { date: null, confidence: 'none' };

  // Sort by confidence (high > medium > low), prefer earlier in text
  const confOrder = { high: 3, medium: 2, low: 1 };
  candidates.sort((a, b) => (confOrder[b.confidence] - confOrder[a.confidence]));
  const best = candidates[0];
  return { date: best.date, confidence: best.confidence };
}

/**
 * Extract merchant name from header lines with improved heuristics.
 */
export function extractMerchant(lines: string[]): { merchant: string | null; confidence: 'high' | 'medium' | 'low' | 'none' } {
  const candidateLines: Array<{ text: string; score: number }> = [];

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i].trim();
    if (!line || line.length < 2) continue;

    // Ignore known non-merchant header patterns
    if (HEADER_IGNORE_REGEX.test(line)) continue;
    if (line.includes('===') || line.includes('---') || line.includes('***')) continue;
    if (/^\d+$/.test(line)) continue;
    // Ignore lines that are mostly numbers (addresses, phone, tax codes)
    const digitRatio = (line.match(/\d/g) || []).length / line.length;
    if (digitRatio > 0.5) continue;
    // Ignore lines that look like addresses (contain digits + commas)
    if (/^\d+.*,.*\d+/.test(line) && line.length > 20) continue;
    // Ignore lines that look like phone numbers
    if (/^(?:\+?84|0)\d{9,10}$/.test(line.replace(/[\s\-().]/g, ''))) continue;

    // Score: prefer short, text-heavy, early lines
    let score = 0;
    score += Math.max(0, 10 - i); // Earlier lines score higher
    const alphaRatio = (line.replace(/[^a-zA-ZÀ-ỹ]/g, '').length) / line.length;
    score += alphaRatio * 10; // More alphabetic = better
    if (line.length >= 3 && line.length <= 50) score += 5; // Reasonable length
    if (/^[A-ZÀ-Ỹ]/.test(line)) score += 3; // Starts with capital
    if (/[A-ZÀ-Ỹ]{2,}/.test(line)) score += 2; // Has multiple caps (brand-like)

    candidateLines.push({ text: line, score });
  }

  if (candidateLines.length > 0) {
    candidateLines.sort((a, b) => b.score - a.score);
    const best = candidateLines[0];
    const cleaned = best.text
      .replace(/^[\s\-–—:;.,*#]+/, '')
      .replace(/[\s\-–—:;.,*#]+$/, '')
      .trim();

    if (cleaned.length >= 2) {
      const confidence = candidateLines.length === 1 ? 'high' : best.score > 10 ? 'high' : 'medium';
      return { merchant: cleaned, confidence };
    }
  }

  return { merchant: null, confidence: 'none' };
}

/**
 * Score a line as a total candidate. Returns score + parsed amount.
 */
function scoreTotalCandidate(line: string, nextLine: string | undefined, lineIndex: number, totalLines: number, isVND: boolean): { score: number; amount: number | null } {
  let score = 0;
  let hasKeyword = false;
  let amount: number | null = null;

  // Check for total keywords
  for (const { regex, bonus } of TOTAL_KEYWORDS_SCORED) {
    if (regex.test(line)) {
      score += bonus;
      hasKeyword = true;
      break;
    }
  }

  // If line also has a NON_TOTAL keyword (but not a grand total), penalize
  if (hasKeyword && NON_TOTAL_KEYWORDS_REGEX.test(line) && !/(TỔNG\s*CỘNG|GRAND\s*TOTAL|TOTAL\s*DUE|AMOUNT\s*DUE)/i.test(line)) {
    score -= 50;
    hasKeyword = false; // effectively not a total keyword line
  }

  // Extract amounts from this line (only count if keyword matched)
  const amounts = line.match(/([0-9.,]{2,})/g);
  if (amounts && amounts.length > 0) {
    const parsed = parseReceiptAmount(amounts[amounts.length - 1], isVND);
    if (parsed !== null && parsed > 0) {
      amount = parsed;
      if (hasKeyword) score += 10;
    }
  }

  // Check next line for amount if this line has keyword but no amount
  if (score > 0 && amount === null && nextLine) {
    const nextAmounts = nextLine.match(/([0-9.,]{2,})/g);
    if (nextAmounts && nextAmounts.length > 0) {
      const parsed = parseReceiptAmount(nextAmounts[nextAmounts.length - 1], isVND);
      if (parsed !== null && parsed > 0) {
        amount = parsed;
        score += 8;
      }
    }
  }

  // Position bonus: totals are usually near the bottom
  if (hasKeyword) {
    const positionRatio = lineIndex / Math.max(totalLines - 1, 1);
    if (positionRatio > 0.7) score += 15;
    else if (positionRatio > 0.5) score += 8;
  }

  // Amount sanity: totals are usually > 1000 VND or > 1 USD
  if (hasKeyword && amount !== null) {
    if (isVND && amount >= 1000 && amount <= 100000000) score += 5;
    else if (!isVND && amount >= 1 && amount <= 100000) score += 5;
  }

  return { score, amount };
}

/**
 * Main receipt data extractor with improved detection.
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

  // Normalize text first
  let normalizedText = normalizeOCRText(rawText);
  normalizedText = fixOCRNumericConfusions(normalizedText);
  normalizedText = fixVNDAmountOCR(normalizedText);

  const lines = normalizedText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // 1. Language Detection
  const hasVnDiacritics = VN_DIACRITICS_REGEX.test(normalizedText);
  const hasVnKeywords = /\b(hoá đơn|hóa đơn|phiếu|thanh toán|tổng cộng|thành tiền|tiền mặt|cà phê|quán|bán hàng|cửa hàng)\b/i.test(normalizedText);
  const isVietnamese = hasVnDiacritics || hasVnKeywords;
  const detectedLanguage: 'vi' | 'en' | 'mixed' = isVietnamese ? 'vi' : 'en';

  // 2. Currency Detection
  let detectedCurrency: string | null = null;
  let currencyConfidence: FieldConfidence = 'none';

  for (const { regex, code } of CURRENCY_PATTERNS) {
    if (regex.test(normalizedText)) {
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

  // 5. Total Detection — scored multi-candidate approach with agreement scoring
  let totalAmount: number | null = null;
  let amountConfidence: FieldConfidence = 'none';

  // Collect total candidates and payment amount candidates separately
  const totalCandidates: Array<{ line: string; index: number; score: number; amount: number }> = [];
  const paymentAmounts: Array<{ line: string; amount: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = i + 1 < lines.length ? lines[i + 1] : undefined;
    const { score, amount } = scoreTotalCandidate(line, nextLine, i, lines.length, isVND);
    if (score > 0 && amount !== null && amount > 0) {
      totalCandidates.push({ line, index: i, score, amount });
    }

    // Collect payment line amounts (Momo, cash, bank transfer, etc.)
    if (PAYMENT_KEYWORDS_REGEX.test(line) && !NON_TOTAL_KEYWORDS_REGEX.test(line)) {
      const payAmounts = line.match(/([0-9.,]{2,})/g);
      if (payAmounts) {
        for (const pa of payAmounts) {
          const parsed = parseReceiptAmount(pa, isVND);
          if (parsed !== null && parsed > 0) {
            paymentAmounts.push({ line, amount: parsed });
          }
        }
      }
    }
  }

  // Sort total candidates by score
  if (totalCandidates.length > 0) {
    totalCandidates.sort((a, b) => b.score - a.score);

    // Agreement scoring: payment lines that match a total candidate amount
    // confirm that total, giving it extra weight.
    // This handles OCR uncertainty where:
    //   Tổng cộng      378,120  (OCR uncertain on digit)
    //   Momo            376,120  (payment line confirms correct amount)
    //
    // Strategy:
    // 1. Payment amounts matching a total candidate boost it (+20)
    // 2. If a total candidate is NOT confirmed by any payment amount, and
    //    payment amounts disagree with it, the payment amount is likely more
    //    accurate (payment systems know the exact amount).
    const candidateScores = totalCandidates.map((tc) => ({ ...tc }));

    for (const tc of candidateScores) {
      for (const pa of paymentAmounts) {
        if (pa.amount === tc.amount) {
          tc.score += 20;
        }
      }
      const sameAmount = totalCandidates.filter((other) => other.amount === tc.amount);
      if (sameAmount.length > 1) {
        tc.score += 10 * (sameAmount.length - 1);
      }
    }

    // If no total candidate was confirmed by payment amounts,
    // and payment amounts disagree with the best total candidate,
    // the payment amount likely reflects the actual amount paid.
    const bestUnboosted = candidateScores[0];
    const hasPaymentConfirmation = paymentAmounts.some((pa) => pa.amount === bestUnboosted.amount);

    if (!hasPaymentConfirmation && paymentAmounts.length >= 1) {
      // Add payment amounts as alternative candidates
      // They represent actual money transferred — often more accurate than OCR of total line
      const paymentVotes = new Map<number, number>();
      for (const pa of paymentAmounts) {
        paymentVotes.set(pa.amount, (paymentVotes.get(pa.amount) || 0) + 1);
      }
      for (const [amount, voteCount] of paymentVotes) {
        // Payment amounts get a high base score since they come from payment systems
        candidateScores.push({
          line: `payment-amount(${voteCount}x)`,
          index: totalCandidates.length,
          score: 35 + voteCount * 10,
          amount,
        });
      }
    }

    candidateScores.sort((a, b) => b.score - a.score);
    const bestCandidate = candidateScores[0];
    totalAmount = bestCandidate.amount;

    const paymentAgreements = paymentAmounts.filter((pa) => pa.amount === totalAmount).length;

    if (paymentAgreements >= 2) {
      amountConfidence = 'high';
    } else if (paymentAgreements >= 1) {
      amountConfidence = 'high';
    } else if (bestCandidate.score >= 40) {
      amountConfidence = 'high';
    } else if (bestCandidate.score >= 25) {
      amountConfidence = 'medium';
    } else {
      amountConfidence = 'low';
    }
  }

  // Fallback: only if no total candidate found at all, try to find a reasonable amount
  // from lines that look like summary lines (not individual items)
  // NEVER use "largest number wins" — that fails for receipts with unit prices
  if (totalAmount === null) {
    // Look for standalone amounts on lines without product descriptions
    for (const line of lines) {
      if (NON_TOTAL_KEYWORDS_REGEX.test(line)) continue;
      if (HEADER_IGNORE_REGEX.test(line)) continue;
      // Skip lines that look like item descriptions (text before number)
      if (/^[A-ZÀ-Ỹ].*\d{2,}/i.test(line) && line.length > 15) continue;
      const amounts = line.match(/([0-9.,]{3,})/g);
      if (amounts) {
        for (const m of amounts) {
          const parsed = parseReceiptAmount(m, isVND);
          if (parsed !== null && parsed > 0 && parsed < 1000000000) {
            // Only accept if this is a short line (likely a summary line, not an item)
            if (line.length < 40) {
              totalAmount = parsed;
              amountConfidence = 'low';
              break;
            }
          }
        }
        if (totalAmount !== null) break;
      }
    }
  }

  // 6. Line Item Extraction
  const extractedItems: ExtractedReceiptItem[] = [];
  for (const line of lines) {
    if (HEADER_IGNORE_REGEX.test(line) || NON_TOTAL_KEYWORDS_REGEX.test(line)) continue;
    // Skip lines with total keywords
    if (TOTAL_KEYWORDS_SCORED.some((tk) => tk.regex.test(line))) continue;
    if (line.length < 4 || line.includes('===') || line.includes('---')) continue;

    const itemMatch = line.match(/^(.+?)\s+([0-9.,]{2,})$/);
    if (itemMatch) {
      const desc = itemMatch[1].trim();
      const amountStr = itemMatch[2];
      const parsedPrice = parseReceiptAmount(amountStr, isVND);

      if (desc.length > 2 && parsedPrice !== null && parsedPrice > 0 && parsedPrice <= (totalAmount || 1000000000)) {
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

  // 8. Overall confidence score
  let score = 0;
  if (merchantConfidence === 'high') score += 25;
  else if (merchantConfidence === 'medium') score += 15;

  if (amountConfidence === 'high') score += 35;
  else if (amountConfidence === 'medium') score += 20;
  else if (amountConfidence === 'low') score += 10;

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
    account: 'low',
  };

  return {
    merchant,
    transactionDate,
    totalAmount,
    currency: detectedCurrency,
    suggestedCategoryId,
    suggestedCategoryName,
    rawText: normalizedText,
    detectedLanguage,
    confidence: Math.min(score, 100),
    fieldConfidences,
    items: extractedItems,
  };
}
