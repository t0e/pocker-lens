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

export type SemanticTotalRole =
  | 'grand_total'     // "Tổng cộng", "Grand Total", "Total Due", "Amount Due", "TOTAL"
  | 'purchase_value'  // "Giá trị mua", "Gia tri mua", "Thành tiền", "Thanh tien", "Net Total"
  | 'payment_amount'  // "Momo", "Tiền khách trả", "Thanh toán", "Card", "Visa"
  | 'cash_given'      // "Tiền khách đưa", "Cash", "Cash Tendered" (when change present)
  | 'change'          // "Tiền thối", "Tiền thừa", "Change", "Tiền trả lại"
  | 'subtotal'        // "Subtotal", "Tiền hàng", "Tạm tính"
  | 'discount'        // "Giảm giá", "Chiết khấu"
  | 'tax'             // "Tax", "VAT", "Thuế"
  | 'item_count'      // "Tổng số lượng", "Tổng số: 1", "Total items"
  | 'line_item_sum'   // Computed sum of line items
  | 'fallback';

export interface ScoredTotalCandidate {
  amount: number;
  rawString: string;
  sourceLine: string;
  lineIndex: number;
  role: SemanticTotalRole;
  score: number;
  reasons: string[];
}

const GRAND_TOTAL_REGEX = /(?:^|\s)(?:TỔNG\s*CỘNG|TONG\s*CONG|GRAND\s*TOTAL|TOTAL\s*DUE|AMOUNT\s*DUE|TỔNG\s*THANH\s*TOÁN|TONG\s*THANH\s*TOAN|BALANCE\s*DUE|TOTAL\s*PAID|PAYMENT\s*TOTAL|\bTOTAL\b|\bAMOUNT\b|\bSỐ\s*TIỀN\b|\bSO\s*TIEN\b)(?!\s*item|\s*qty|\s*unit|\s*món|\s*sp|\s*mặt\s*hàng)/i;
const PURCHASE_VALUE_REGEX = /(?:^|\s)(?:GIÁ\s*TRỊ\s*MUA|GIA\s*TRI\s*MUA|THÀNH\s*TIỀN|THANH\s*TIEN|TỔNG\s*TIỀN|TONG\s*TIEN|NET\s*TOTAL|FINAL\s*AMOUNT)(?!\s*item|\s*qty|\s*unit|\s*món|\s*sp|\s*mặt\s*hàng)/i;
const PAYMENT_KEYWORDS_REGEX = /(?:^|\s|\+)(?:MOMO|VNPAY|ZALOPAY|THANH\s*TOÁN\s*QR|CHUYỂN\s*KHOẢN|CARD\b|VISA\b|MASTERCARD|TIỀN\s*KHÁCH\s*TRẢ|TIEN\s*KHACH\s*TRA|THANH\s*TOÁN|THANH\s*TOAN|BANK\b|AGRI\b|VCB\b|VTB\b|TPB\b|MB\b|ACB\b|SHB\b|HDB\b|OCB\b|EXIMBANK|VIETIN\b|TECHCOMBANK|SACOMBANK)/i;
const TOTAL_ITEMS_COUNT_REGEX = /(?:TỔNG\s*SỐ(?:\s*LƯỢNG|\s*MÓN|\s*SP|\s*MẶT\s*HÀNG)?|TONG\s*SO(?:\s*LUONG|\s*MON|\s*SP)?|\bTOTAL\s*ITEMS\b|\bTOTAL\s*QTY\b|\bQTY\s*TOTAL\b|\bITEMS?\s*COUNT\b)/i;
const CASH_GIVEN_REGEX = /(?:^|\s)(?:TIỀN\s*KHÁCH\s*ĐƯA|TIEN\s*KHACH\s*DUA|TIỀN\s*MẶT|TIEN\s*MAT|CASH\s*TENDERED|CASH\s*RECEIVED|\bCASH\b|\bGIVEN\b)/i;
const CHANGE_REGEX = /(?:^|\s)(?:TIỀN\s*THỐI|TIEN\s*THOI|TIỀN\s*THỪA|TIEN\s*THUA|TIỀN\s*TRẢ\s*LẠI|TIEN\s*TRA\s*LAI|\bCHANGE\b)/i;
const SUBTOTAL_REGEX = /(?:^|\s)(?:SUBTOTAL|SUB\s*TOTAL|TIỀN\s*HÀNG|TIEN\s*HANG|TỔNG\s*TIỀN\s*HÀNG|TẠM\s*TÍNH|TAM\s*TINH)/i;
const DISCOUNT_REGEX = /(?:^|\s)(?:DISCOUNT|GIẢM\s*GIÁ|GIAM\s*GIA|CHIẾT\s*KHẤU|CHIET\s*KHAU|\bKM\b)/i;
const TAX_REGEX = /(?:^|\s)(?:TAX\b|VAT\b|THUẾ|THUE)/i;
const ITEM_BREAKDOWN_REGEX = /^(?:unit\s*price|line\s*total|item\s*total|đơn\s*giá|don\s*gia|giá\s*gốc|gia\s*goc|qty\b|sl\b)/i;
const DATE_LINE_REGEX = /(?:ngày|ngay|date|giờ|time|hóa\s*đơn|hoa\s*don|đ\/c|địa\s*chỉ|dia\s*chi|thu\s*ngân|cashier|stt|no\.)/i;
const DATE_FORMAT_REGEX = /(?:\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b|\b\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}\b|\b\d{1,2}:\d{2}\b)/i;

const HEADER_IGNORE_REGEX = /^(RECEIPT|INVOICE|HOÁ\s*ĐƠN|HÓA\s*ĐƠN|PHIẾU\s*THANH\s*TOÁN|PHIẾU\s*TÍNH\s*TIỀN|BIÊN\s*LAI|BIÊN\s*NHẬN|CỬA\s*HÀNG|STORE|SHOP|WELCOME|THANK\s*YOU|CẢM\s*ƠN|TEL|HOTLINE|ĐT|ĐIỆN\s*THOẠI|FAX|MST|MÃ\s*SỐ\s*THUẾ|TAX\s*ID|ĐỊA\s*CHỈ|Đ\/C|ADDRESS|DATE|NGÀY|TIME|GIỜ|STT|NO\.|QUẦY|THU\s*NGÂN|CASHIER)/i;

// Confusable numeric character pairs for OCR post-processing
const CONFUSABLE_PAIRS: Array<[string, string]> = [
  ['6', '8'], ['8', '6'],
  ['3', '8'], ['8', '3'],
  ['0', '8'], ['8', '0'],
  ['0', '6'], ['6', '0'],
  ['1', '7'], ['7', '1'],
  ['5', '6'], ['6', '5'],
];

/**
 * Check if two numeric values differ only by known OCR confusions (e.g. 378,120 vs 376,120).
 */
export function areNumericallyConfusable(a: number, b: number): boolean {
  if (a === b) return true;
  const strA = Math.round(a).toString();
  const strB = Math.round(b).toString();
  if (strA.length !== strB.length || strA.length < 3) return false;

  let diffCount = 0;
  for (let i = 0; i < strA.length; i++) {
    if (strA[i] !== strB[i]) {
      diffCount++;
      if (diffCount > 2) return false;
      const isPair = CONFUSABLE_PAIRS.some(
        ([c1, c2]) => (strA[i] === c1 && strB[i] === c2) || (strA[i] === c2 && strB[i] === c1)
      );
      if (!isPair) return false;
    }
  }
  return diffCount >= 1 && diffCount <= 2;
}

/**
 * Normalize OCR text: clean up Unicode artifacts, repeated spaces, common OCR mistakes.
 */
export function normalizeOCRText(text: string): string {
  let normalized = text;
  normalized = normalized.replace(/[\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]/g, ' ');
  normalized = normalized.replace(/ {2,}/g, ' ');
  normalized = normalized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  normalized = normalized.split('\n').map((l) => l.trimEnd()).join('\n');
  return normalized.trim();
}

/**
 * Fix common OCR confusions in numeric/currency contexts only.
 */
export function fixOCRNumericConfusions(text: string): string {
  let fixed = text;
  fixed = fixed.replace(/\b(\d[Oo\d]*[.,]?[Oo\d]*)\b/g, (match) => {
    if (/\d/.test(match) && /[Oo]/.test(match)) {
      return match.replace(/[Oo]/g, '0');
    }
    return match;
  });
  fixed = fixed.replace(/(\d)\/([Oo])(\d)/g, (_, d1, _o, d2) => `${d1}/0${d2}`);
  fixed = fixed.replace(/(\d)[Oo](\d)/g, (_, d1, d2) => `${d1}0${d2}`);
  return fixed;
}

/**
 * Fix VND-specific OCR variations.
 */
export function fixVNDAmountOCR(text: string): string {
  let fixed = text.replace(/(\d{1,3})\.(\d{3})\.(\d{3})/g, (match, p1, p2, p3) => {
    const fixedP2 = p2.replace(/[OoO]/g, '0');
    const fixedP3 = p3.replace(/[OoO]/g, '0');
    return `${p1}.${fixedP2}.${fixedP3}`;
  });
  fixed = fixed.replace(/\b(\d{1,3})\s(\d{3})\b(?!\s*[\d.])/g, '$1$2');
  return fixed;
}

/**
 * Check if a raw number string possesses formatted monetary characteristics (e.g. 376,120 or 376.120 or 12.50).
 */
export function isFormattedMonetary(rawStr: string): boolean {
  return /^\d{1,3}(?:[.,]\d{3})+$/.test(rawStr) || /^\d{1,3}(?:,\d{3})*\.\d{2}$/.test(rawStr) || /^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(rawStr);
}

/**
 * Parse numeric currency strings taking Vietnamese vs English decimal/thousand conventions into account.
 */
export function parseReceiptAmount(amountStr: string, isVNDContext = true): number | null {
  if (!amountStr) return null;

  let clean = amountStr.replace(/[Oo]/g, '0');
  clean = clean.replace(/(\d)[lI](\d)/g, '$11$2');

  // Strip currency prefixes/suffixes
  clean = clean.replace(/[^0-9.,]/g, '').trim();
  if (!clean) return null;

  // Multiple dots: 1.250.000 or 80.000 (VND thousands)
  if (/^\d{1,3}(\.\d{3})+$/.test(clean)) {
    return parseInt(clean.replace(/\./g, ''), 10);
  }

  // Multiple commas: 1,250,000 or 80,000 (English thousands / VND comma thousands)
  if (/^\d{1,3}(,\d{3})+$/.test(clean)) {
    return parseInt(clean.replace(/,/g, ''), 10);
  }

  // English format: 1,250.50 or 80.00
  if (/^\d{1,3}(,\d{3})*\.\d{1,2}$/.test(clean)) {
    return parseFloat(clean.replace(/,/g, ''));
  }

  // European / Vietnamese format: 1.250,50
  if (/^\d{1,3}(\.\d{3})*,\d{1,2}$/.test(clean)) {
    return parseFloat(clean.replace(/\./g, '').replace(',', '.'));
  }

  // Single dot: 80.000 vs 80.00
  if (/^\d+\.\d+$/.test(clean)) {
    const parts = clean.split('.');
    if (parts[1].length === 3) {
      return parseInt(clean.replace(/\./g, ''), 10);
    }
    if (parts[1].length <= 2) {
      if (isVNDContext && parseInt(parts[0], 10) < 1000 && parseInt(parts[1], 10) === 0) {
        return parseFloat(clean);
      }
      return parseFloat(clean);
    }
  }

  // Single comma: 80,000 vs 80,00
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
 * Extract date and time from receipt text.
 */
export function extractDate(lines: string[]): { date: Date | null; confidence: 'high' | 'medium' | 'low' | 'none' } {
  const candidates: Array<{ date: Date; confidence: 'high' | 'medium' | 'low' }> = [];

  for (const line of lines) {
    let hours = 12;
    let minutes = 0;
    const timeMatch = line.match(/\b([0-2]?[0-9]):([0-5][0-9])(?::([0-5][0-9]))?\b/);
    if (timeMatch) {
      const h = parseInt(timeMatch[1], 10);
      const m = parseInt(timeMatch[2], 10);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        hours = h;
        minutes = m;
      }
    }

    // 1. DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const dmyMatch = line.match(/\b([0-3]?[0-9])[\/\-.]([0-1]?[0-9])[\/\-.](20\d{2})\b/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10) - 1;
      const year = parseInt(dmyMatch[3], 10);
      if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
        const d = new Date(Date.UTC(year, month, day, hours, minutes, 0));
        candidates.push({ date: d, confidence: 'high' });
      }
    }

    // 2. YYYY-MM-DD or YYYY/MM/DD
    const ymdMatch = line.match(/\b(20\d{2})[\/\-.]([0-1]?[0-9])[\/\-.]([0-3]?[0-9])\b/);
    if (ymdMatch) {
      const year = parseInt(ymdMatch[1], 10);
      const month = parseInt(ymdMatch[2], 10) - 1;
      const day = parseInt(ymdMatch[3], 10);
      if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
        const d = new Date(Date.UTC(year, month, day, hours, minutes, 0));
        candidates.push({ date: d, confidence: 'high' });
      }
    }

    // 3. DD Month YYYY (e.g. 24 Aug 2026 or 24 Thg 8 2026)
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
        candidates.push({ date: new Date(Date.UTC(year, month, day, hours, minutes, 0)), confidence: 'high' });
      }
    }

    // 4. Vietnamese full date format: "Ngày DD tháng MM năm YYYY"
    const vnFullDate = line.match(/(?:ngày|ngay)\s+(\d{1,2})\s+(?:tháng|thang|th)\s+(\d{1,2})\s+(?:năm|nam)\s+(20\d{2})/i);
    if (vnFullDate) {
      const day = parseInt(vnFullDate[1], 10);
      const month = parseInt(vnFullDate[2], 10) - 1;
      const year = parseInt(vnFullDate[3], 10);
      if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
        candidates.push({ date: new Date(Date.UTC(year, month, day, hours, minutes, 0)), confidence: 'high' });
      }
    }

    // 5. DD-MM-YY (short year)
    const dmyShort = line.match(/\b([0-3]?[0-9])[\/\-.]([0-1]?[0-9])[\/\-.](\d{2})\b/);
    if (dmyShort && !dmyMatch) {
      const day = parseInt(dmyShort[1], 10);
      const month = parseInt(dmyShort[2], 10) - 1;
      const year = 2000 + parseInt(dmyShort[3], 10);
      if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
        candidates.push({ date: new Date(Date.UTC(year, month, day, hours, minutes, 0)), confidence: 'medium' });
      }
    }
  }

  if (candidates.length === 0) return { date: null, confidence: 'none' };

  const confOrder = { high: 3, medium: 2, low: 1 };
  candidates.sort((a, b) => confOrder[b.confidence] - confOrder[a.confidence]);
  return { date: candidates[0].date, confidence: candidates[0].confidence };
}

/**
 * Extract merchant name from header lines.
 */
export function extractMerchant(lines: string[]): { merchant: string | null; confidence: 'high' | 'medium' | 'low' | 'none' } {
  const candidateLines: Array<{ text: string; score: number }> = [];

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i].trim();
    if (!line || line.length < 2) continue;

    if (HEADER_IGNORE_REGEX.test(line)) continue;
    if (line.includes('===') || line.includes('---') || line.includes('***')) continue;
    if (/^\d+$/.test(line)) continue;

    const digitRatio = (line.match(/\d/g) || []).length / line.length;
    if (digitRatio > 0.5) continue;
    if (/^\d+.*,.*\d+/.test(line) && line.length > 20) continue;
    if (/^(?:\+?84|0)\d{9,10}$/.test(line.replace(/[\s\-().]/g, ''))) continue;

    let score = 0;
    score += Math.max(0, 10 - i);
    const alphaRatio = (line.replace(/[^a-zA-ZÀ-ỹ]/g, '').length) / line.length;
    score += alphaRatio * 10;
    if (line.length >= 3 && line.length <= 50) score += 5;
    if (/^[A-ZÀ-Ỹ]/.test(line)) score += 3;
    if (/[A-ZÀ-Ỹ]{2,}/.test(line)) score += 2;

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
 * Extract line items from the receipt text with protection against barcode/code prefixes and summary labels.
 */
export function extractLineItems(lines: string[], isVND: boolean): ExtractedReceiptItem[] {
  const items: ExtractedReceiptItem[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prevLine = i > 0 ? lines[i - 1] : '';
    const nextLine = i < lines.length - 1 ? lines[i + 1] : '';

    if (
      HEADER_IGNORE_REGEX.test(line) ||
      GRAND_TOTAL_REGEX.test(line) ||
      PURCHASE_VALUE_REGEX.test(line) ||
      PAYMENT_KEYWORDS_REGEX.test(line) ||
      TOTAL_ITEMS_COUNT_REGEX.test(line) ||
      CASH_GIVEN_REGEX.test(line) ||
      CHANGE_REGEX.test(line) ||
      SUBTOTAL_REGEX.test(line) ||
      DISCOUNT_REGEX.test(line) ||
      TAX_REGEX.test(line) ||
      ITEM_BREAKDOWN_REGEX.test(line) ||
      DATE_LINE_REGEX.test(line) ||
      DATE_FORMAT_REGEX.test(line)
    ) {
      continue;
    }

    if (line.length < 3 || line.includes('===') || line.includes('---')) continue;

    // Match numbers on the line
    const amounts = line.match(/\b\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\b/g);
    if (amounts && amounts.length > 0) {
      const lastAmountStr = amounts[amounts.length - 1];
      const parsedTotalPrice = parseReceiptAmount(lastAmountStr, isVND);

      let prefix = line.substring(0, line.lastIndexOf(lastAmountStr)).trim();

      // Strip leading product barcode / item ID digits (e.g. "324583 Banh mi" -> "Banh mi")
      prefix = prefix.replace(/^\s*\d{4,}\s+/, '');
      const desc = prefix.replace(/[0-9.,]+$/, '').trim();

      // Ignore noise descriptions like "1 4 Ệ_...wam" or single letter junk
      const alphaCount = (desc.match(/[a-zA-ZÀ-ỹ]/g) || []).length;
      if (alphaCount < 2 || desc.includes('...') || desc.includes('___')) continue;
      if (/^[0-9\s]{2,}[^a-zA-ZÀ-ỹ0-9]/.test(prefix)) continue;

      if (desc.length >= 2 && parsedTotalPrice !== null && parsedTotalPrice > 0) {
        let qty: number | null = 1;
        const qtyMatch = prefix.match(/\b([1-9]\d*)\s*[xX]\b/) || prefix.match(/\b[xX]\s*([1-9]\d*)\b/);
        if (qtyMatch) {
          qty = parseInt(qtyMatch[1], 10);
        }

        let unitPrice = parsedTotalPrice;
        if (amounts.length >= 2) {
          const possibleUnitPrice = parseReceiptAmount(amounts[0], isVND);
          if (possibleUnitPrice !== null && possibleUnitPrice > 0 && possibleUnitPrice !== parsedTotalPrice) {
            unitPrice = possibleUnitPrice;
          }
        } else if (qty && qty > 1) {
          unitPrice = parsedTotalPrice / qty;
        }

        items.push({
          description: desc,
          quantity: qty,
          unitPrice,
          totalPrice: parsedTotalPrice,
        });
      }
    }
  }

  return items;
}

/**
 * Enhanced semantic candidate extraction, multi-line neighborhood search, arithmetic validation, and conflict resolution.
 */
export function resolveReceiptTotal(
  lines: string[],
  items: ExtractedReceiptItem[],
  isVND: boolean
): {
  totalAmount: number | null;
  confidence: FieldConfidence;
  hasConflict: boolean;
  uncertaintyWarning: string | null;
  reasons: string[];
  candidates: ScoredTotalCandidate[];
} {
  const candidates: ScoredTotalCandidate[] = [];

  let subtotalAmount: number | null = null;
  let taxAmount: number | null = null;
  let discountAmount: number | null = null;
  let cashGivenAmount: number | null = null;
  let changeAmount: number | null = null;

  // 1. Scan lines for semantic amounts and multi-line total associations
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prevLine = i > 0 ? lines[i - 1] : '';
    const nextLine = i < lines.length - 1 ? lines[i + 1] : '';
    const positionRatio = i / Math.max(lines.length - 1, 1);

    if (ITEM_BREAKDOWN_REGEX.test(line)) {
      continue;
    }

    const amounts = line.match(/\b\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\b/g);
    if (!amounts || amounts.length === 0) continue;

    // Check all numbers found on the line as candidate amounts
    for (let aIdx = 0; aIdx < amounts.length; aIdx++) {
      const rawStr = amounts[aIdx];
      const parsedAmount = parseReceiptAmount(rawStr, isVND);
      if (parsedAmount === null || parsedAmount <= 0) continue;

      const isLastOnLine = aIdx === amounts.length - 1;
      const formatted = isFormattedMonetary(rawStr);

      // Handle explicit negative/subordinate semantic roles
      if (CHANGE_REGEX.test(line) && isLastOnLine) {
        changeAmount = parsedAmount;
        candidates.push({
          amount: parsedAmount,
          rawString: rawStr,
          sourceLine: line,
          lineIndex: i,
          role: 'change',
          score: -50,
          reasons: ['Change returned amount (-50)'],
        });
        continue;
      }

      if (CASH_GIVEN_REGEX.test(line) && !GRAND_TOTAL_REGEX.test(line) && isLastOnLine) {
        cashGivenAmount = parsedAmount;
        candidates.push({
          amount: parsedAmount,
          rawString: rawStr,
          sourceLine: line,
          lineIndex: i,
          role: 'cash_given',
          score: -50,
          reasons: ['Cash tendered amount (-50)'],
        });
        continue;
      }

      if (TOTAL_ITEMS_COUNT_REGEX.test(line)) {
        candidates.push({
          amount: parsedAmount,
          rawString: rawStr,
          sourceLine: line,
          lineIndex: i,
          role: 'item_count',
          score: -60,
          reasons: ['Total item quantity / count label (-60)'],
        });
        continue;
      }

      if (SUBTOTAL_REGEX.test(line) && !GRAND_TOTAL_REGEX.test(line) && isLastOnLine) {
        subtotalAmount = parsedAmount;
        candidates.push({
          amount: parsedAmount,
          rawString: rawStr,
          sourceLine: line,
          lineIndex: i,
          role: 'subtotal',
          score: 15,
          reasons: ['Subtotal line'],
        });
        continue;
      }

      if (DISCOUNT_REGEX.test(line) && !GRAND_TOTAL_REGEX.test(line) && isLastOnLine) {
        discountAmount = parsedAmount;
        candidates.push({
          amount: parsedAmount,
          rawString: rawStr,
          sourceLine: line,
          lineIndex: i,
          role: 'discount',
          score: -30,
          reasons: ['Discount line (-30)'],
        });
        continue;
      }

      if (TAX_REGEX.test(line) && !GRAND_TOTAL_REGEX.test(line) && isLastOnLine) {
        taxAmount = parsedAmount;
        candidates.push({
          amount: parsedAmount,
          rawString: rawStr,
          sourceLine: line,
          lineIndex: i,
          role: 'tax',
          score: -30,
          reasons: ['Tax line (-30)'],
        });
        continue;
      }

      // Check Grand Total, Purchase Value, or Payment labels (same line or neighboring lines)
      let role: SemanticTotalRole = 'fallback';
      let score = 10;
      const reasons: string[] = [];

      // Same-line label matches
      if (GRAND_TOTAL_REGEX.test(line)) {
        role = 'grand_total';
        score += 40;
        reasons.push('Grand Total keyword match (+40)');
      } else if (PURCHASE_VALUE_REGEX.test(line)) {
        role = 'purchase_value';
        score += 30;
        reasons.push('Purchase value keyword match (+30)');
      } else if (PAYMENT_KEYWORDS_REGEX.test(line)) {
        role = 'payment_amount';
        score += 25;
        reasons.push('Payment method keyword match (+25)');
      }
      // Multi-line neighborhood label association (e.g. Label on prev/next line, value on current line)
      else if (GRAND_TOTAL_REGEX.test(prevLine) || GRAND_TOTAL_REGEX.test(nextLine)) {
        role = 'grand_total';
        score += 35;
        reasons.push(`Adjacent line Grand Total label match (+35)`);
      } else if (PURCHASE_VALUE_REGEX.test(prevLine) || PURCHASE_VALUE_REGEX.test(nextLine)) {
        role = 'purchase_value';
        score += 28;
        reasons.push(`Adjacent line Purchase Value label match (+28)`);
      } else if (PAYMENT_KEYWORDS_REGEX.test(prevLine) || PAYMENT_KEYWORDS_REGEX.test(nextLine)) {
        role = 'payment_amount';
        score += 25;
        reasons.push(`Adjacent line Payment label match (+25)`);
      }

      // Position scoring
      if (positionRatio > 0.5) {
        score += 10;
        reasons.push('Bottom half position (+10)');
      }
      if (positionRatio > 0.75) {
        score += 10;
        reasons.push('Bottom quartile position (+10)');
      }

      // Monetary formatting bonus / noise penalty
      if (formatted) {
        score += isVND ? 30 : 15;
        reasons.push(`Formatted monetary pattern '${rawStr}' (+${isVND ? 30 : 15})`);
      } else if (isVND) {
        // Severe penalty for tiny unformatted integers in VND (e.g. 1, 4, 23)
        if (parsedAmount < 1000) {
          score -= 60;
          reasons.push(`Unformatted tiny integer < 1000 VND (-60)`);
        }
        // Penalty for isolated barcode/product code strings (plain 5+ digits)
        if (/^\d{5,}$/.test(rawStr)) {
          score -= 40;
          reasons.push(`Unformatted plain integer / barcode pattern (-40)`);
        }
      }

      // Prefer the last number on a line over intermediate quantities
      if (isLastOnLine && amounts.length > 1) {
        score += 10;
        reasons.push('Last number on line (+10)');
      }

      candidates.push({
        amount: parsedAmount,
        rawString: rawStr,
        sourceLine: line,
        lineIndex: i,
        role,
        score,
        reasons,
      });
    }
  }

  // 2. Arithmetic Cross-Validation
  let hasArithmeticProof = false;

  // A. Check Subtotal + Tax - Discount (ONLY if tax or discount explicitly exists)
  if (subtotalAmount !== null && (taxAmount !== null || discountAmount !== null)) {
    const netCalculated = subtotalAmount + (taxAmount || 0) - (discountAmount || 0);
    if (netCalculated > 0) {
      for (const c of candidates) {
        if (Math.abs(c.amount - netCalculated) < 0.01 && c.role !== 'subtotal') {
          c.score += 45;
          hasArithmeticProof = true;
          c.reasons.push(`Subtotal + Tax - Discount arithmetic match (${subtotalAmount} + ${taxAmount || 0} - ${discountAmount || 0} = ${netCalculated}) (+45)`);
        }
      }
    }
  }

  // B. Check Cash Given - Change
  if (cashGivenAmount !== null && changeAmount !== null) {
    const netPaid = cashGivenAmount - changeAmount;
    if (netPaid > 0) {
      for (const c of candidates) {
        if (Math.abs(c.amount - netPaid) < 0.01 && c.role !== 'cash_given' && c.role !== 'change') {
          c.score += 45;
          hasArithmeticProof = true;
          c.reasons.push(`Cash - Change arithmetic match (${cashGivenAmount} - ${changeAmount} = ${netPaid}) (+45)`);
        }
      }
    }
  }

  // C. Line-Item Sum Arithmetic Validation
  let lineItemSum = 0;
  if (items.length >= 2) {
    lineItemSum = items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
    lineItemSum = isVND ? Math.round(lineItemSum) : Math.round(lineItemSum * 100) / 100;
  }

  if (lineItemSum > 0) {
    const hasSeparateTax = taxAmount !== null && taxAmount > 0;
    const hasSeparateDiscount = discountAmount !== null && discountAmount > 0;

    if (!hasSeparateTax && !hasSeparateDiscount) {
      candidates.push({
        amount: lineItemSum,
        rawString: lineItemSum.toString(),
        sourceLine: `Arithmetic sum of ${items.length} line items`,
        lineIndex: lines.length,
        role: 'line_item_sum',
        score: 50,
        reasons: [`Arithmetic sum of line items (${lineItemSum}) (+50)`],
      });

      for (const c of candidates) {
        if (Math.abs(c.amount - lineItemSum) < 0.01 && c.role !== 'line_item_sum') {
          c.score += 50;
          hasArithmeticProof = true;
          c.reasons.push(`Exact match with line-item arithmetic sum ${lineItemSum} (+50)`);
        }
      }
    }
  }

  // Filter valid positive candidates (strictly exclude negative roles and item count)
  const validCandidates = candidates.filter(
    (c) => c.role !== 'cash_given' && c.role !== 'change' && c.role !== 'discount' && c.role !== 'tax' && c.role !== 'item_count' && c.score > 0
  );

  if (validCandidates.length === 0) {
    return {
      totalAmount: null,
      confidence: 'none',
      hasConflict: false,
      uncertaintyWarning: 'No valid total candidates found',
      reasons: ['No valid total candidates found'],
      candidates,
    };
  }

  // 3. Candidate Clustering and Agreement Boosting
  for (const c of validCandidates) {
    const exactMatches = validCandidates.filter((other) => other !== c && Math.abs(other.amount - c.amount) < 0.01);
    for (const match of exactMatches) {
      c.score += 20;
      c.reasons.push(`Agreement with '${match.sourceLine}' (+20)`);
    }
  }

  // 4. OCR Confusable Numbers & Disambiguation
  for (const c of validCandidates) {
    for (const other of validCandidates) {
      if (c !== other && areNumericallyConfusable(c.amount, other.amount)) {
        const cHasPayment = validCandidates.some((v) => Math.abs(v.amount - c.amount) < 0.01 && v.role === 'payment_amount');
        const cHasArithmetic = lineItemSum > 0 && Math.abs(c.amount - lineItemSum) < 0.01;
        const otherHasPayment = validCandidates.some((v) => Math.abs(v.amount - other.amount) < 0.01 && v.role === 'payment_amount');
        const otherHasArithmetic = lineItemSum > 0 && Math.abs(other.amount - lineItemSum) < 0.01;

        if ((cHasPayment || cHasArithmetic) && !otherHasPayment && !otherHasArithmetic) {
          c.score += 35;
          c.reasons.push(`Payment / arithmetic authority disambiguated over printed OCR confusion (+35)`);
        }
      }
    }
  }

  // Sort valid candidates by score descending
  validCandidates.sort((a, b) => b.score - a.score);
  const bestCandidate = validCandidates[0];

  // If even the best candidate is very weak (< 20), do not fabricate
  if (bestCandidate.score < 20) {
    return {
      totalAmount: null,
      confidence: 'low',
      hasConflict: false,
      uncertaintyWarning: 'Amount detected with uncertainty — please verify.',
      reasons: ['Candidate score below minimum confidence threshold'],
      candidates,
    };
  }

  // 5. Detect Conflicting Candidates & Numeric Confusion
  const competingCandidates = validCandidates.filter(
    (c) => Math.abs(c.amount - bestCandidate.amount) >= 0.01 && c.score > 25
  );

  let hasConflict = false;
  let hasConfusableConflict = false;
  let uncertaintyWarning: string | null = null;

  if (competingCandidates.length > 0) {
    hasConflict = true;
    for (const comp of competingCandidates) {
      if (areNumericallyConfusable(comp.amount, bestCandidate.amount)) {
        hasConfusableConflict = true;
        break;
      }
    }
  }

  // 6. Confidence Assignment
  let confidence: FieldConfidence = 'low';

  const exactAgreements = validCandidates.filter((c) => Math.abs(c.amount - bestCandidate.amount) < 0.01).length;
  const matchesLineItemSum = lineItemSum > 0 && Math.abs(bestCandidate.amount - lineItemSum) < 0.01;

  if (bestCandidate.score >= 70 || hasArithmeticProof) {
    confidence = 'high';
  } else if (exactAgreements >= 2 && !hasConfusableConflict) {
    confidence = 'high';
  } else if (matchesLineItemSum && exactAgreements >= 1) {
    confidence = 'high';
  } else if (bestCandidate.score >= 35) {
    confidence = 'medium';
  } else {
    confidence = 'low';
  }

  if (hasConfusableConflict) {
    uncertaintyWarning = 'Amount detected with uncertainty — please verify.';
    if (!matchesLineItemSum && !hasArithmeticProof && exactAgreements < 3) {
      confidence = 'medium';
    }
  } else if (hasConflict && confidence !== 'high') {
    uncertaintyWarning = 'Amount detected with uncertainty — please verify.';
  }

  return {
    totalAmount: bestCandidate.amount,
    confidence,
    hasConflict,
    uncertaintyWarning,
    reasons: bestCandidate.reasons,
    candidates,
  };
}

/**
 * Main receipt data extractor with improved multilingual understanding and validation.
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
  const hasVnKeywords = /\b(hoá đơn|hóa đơn|phiếu|thanh toán|thanh toan|tổng cộng|tong cong|thành tiền|thanh tien|tiền mặt|tien mat|cà phê|ca phe|quán|quan|bán hàng|ban hang|cửa hàng|cua hang|giá trị mua|gia tri mua|siêu thị|sieu thi|fujimart|momo|tiền khách trả|tien khach tra)\b/i.test(normalizedText);
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

  // 5. Line Item Extraction
  const extractedItems = extractLineItems(lines, isVND);

  // 6. Total Amount Extraction & Consistency Validation
  const {
    totalAmount,
    confidence: amountConfidence,
    uncertaintyWarning,
  } = resolveReceiptTotal(lines, extractedItems, isVND);

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

  // 8. Overall Confidence Score
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
    amountUncertaintyWarning: uncertaintyWarning,
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
