import { describe, it, expect } from 'vitest';
import {
  extractReceiptData,
  parseReceiptAmount,
  normalizeOCRText,
  fixOCRNumericConfusions,
  fixVNDAmountOCR,
  extractDate,
  extractMerchant,
} from './parser.js';

describe('Multilingual Receipt Parser (Phase 9 Enhanced)', () => {
  describe('OCR Text Normalization', () => {
    it('normalizes Unicode whitespace and repeated spaces', () => {
      const input = 'HIGHLANDS\u00A0COFFEE  45.000\u2003VNĐ';
      const result = normalizeOCRText(input);
      expect(result).toBe('HIGHLANDS COFFEE 45.000 VNĐ');
    });

    it('fixes OCR numeric confusions (O → 0)', () => {
      expect(fixOCRNumericConfusions('45.OOO')).toBe('45.000');
      expect(fixOCRNumericConfusions('1.25O.00O')).toBe('1.250.000');
      expect(fixOCRNumericConfusions('Price: 80O00')).toBe('Price: 80000');
    });

    it('fixes VND amount OCR variations', () => {
      expect(fixVNDAmountOCR('45 000')).toBe('45000');
      expect(fixVNDAmountOCR('1.250.000')).toBe('1.250.000');
    });
  });

  describe('Vietnamese and English Money Amount Parsing', () => {
    it('correctly parses Vietnamese dot-separated thousands (80.000 -> 80,000 VND)', () => {
      expect(parseReceiptAmount('80.000', true)).toBe(80000);
      expect(parseReceiptAmount('45.000 VNĐ', true)).toBe(45000);
      expect(parseReceiptAmount('1.250.000 VND', true)).toBe(1250000);
      expect(parseReceiptAmount('15.000.000 ₫', true)).toBe(15000000);
    });

    it('correctly parses English comma-separated thousands (80,000 -> 80000)', () => {
      expect(parseReceiptAmount('80,000', false)).toBe(80000);
      expect(parseReceiptAmount('1,250,000.00', false)).toBe(1250000);
      expect(parseReceiptAmount('$45.50', false)).toBe(45.5);
      expect(parseReceiptAmount('80.00', false)).toBe(80);
    });

    it('handles clean integers without separators', () => {
      expect(parseReceiptAmount('85000', true)).toBe(85000);
    });

    it('handles OCR confusion in amounts (O → 0, l → 1)', () => {
      expect(parseReceiptAmount('45.OOO', true)).toBe(45000);
      expect(parseReceiptAmount('1.25O.00O', true)).toBe(1250000);
    });
  });

  describe('Vietnamese Receipt Extraction', () => {
    const vnReceiptText = `
HIGHLANDS COFFEE
Đ/c: 123 Nguyen Hue, Quan 1, TP.HCM
MST: 0302829281
Ngày: 24/08/2026 14:30:15
Thu ngân: NV01

Cà phê sữa đá L     45.000
Bánh mì chả lụa     35.000

Tiền hàng:          80.000
VAT (10%):           8.000
TỔNG CỘNG:          88.000 VNĐ
Tiền khách đưa:    100.000
Tiền thối:          12.000

Cảm ơn quý khách!
    `;

    it('extracts merchant, date, total, currency, and line items accurately', () => {
      const result = extractReceiptData(vnReceiptText);

      expect(result.merchant).toBe('HIGHLANDS COFFEE');
      expect(result.detectedLanguage).toBe('vi');
      expect(result.currency).toBe('VND');
      expect(result.totalAmount).toBe(88000);
      expect(result.fieldConfidences.totalAmount).toBe('high');
      expect(result.suggestedCategoryName).toBe('Food & Drink');

      // Date check
      expect(result.transactionDate).toBeInstanceOf(Date);
      expect(result.transactionDate?.getUTCFullYear()).toBe(2026);
      expect(result.transactionDate?.getUTCMonth()).toBe(7); // August (0-indexed)
      expect(result.transactionDate?.getUTCDate()).toBe(24);

      // Line items
      expect(result.items.length).toBeGreaterThanOrEqual(2);
      expect(result.items[0].description).toContain('Cà phê');
      expect(result.items[0].totalPrice).toBe(45000);
    });

    it('distinguishes Total from Subtotal, Discount, Cash and Change', () => {
      const discountReceipt = `
WINMART SUPERMARKET
24-08-2026

Sữa chua Vinamilk    30.000
Bánh quy Cosy        40.000
Tạm tính:            70.000
Giảm giá:            10.000
THÀNH TIỀN:          60.000 đ
Tiền mặt:           100.000
Tiền trả lại:        40.000
      `;

      const result = extractReceiptData(discountReceipt);
      expect(result.merchant).toBe('WINMART SUPERMARKET');
      expect(result.totalAmount).toBe(60000); // 60,000 after discount, NOT 70,000 or 100,000
      expect(result.currency).toBe('VND');
      expect(result.suggestedCategoryName).toBe('Groceries');
    });
  });

  describe('English Receipt Extraction', () => {
    const enReceiptText = `
STARBUCKS COFFEE
456 Market Street, San Francisco, CA
Date: 2026-08-24

Caramel Macchiato     6.50
Blueberry Muffin      4.25

SUBTOTAL             10.75
TAX (8.5%)            0.91
TOTAL                11.66 USD
CASH                 20.00
CHANGE                8.34

Thank you for your visit!
    `;

    it('extracts English receipt details properly', () => {
      const result = extractReceiptData(enReceiptText);

      expect(result.merchant).toBe('STARBUCKS COFFEE');
      expect(result.detectedLanguage).toBe('en');
      expect(result.currency).toBe('USD');
      expect(result.totalAmount).toBe(11.66);
      expect(result.suggestedCategoryName).toBe('Food & Drink');

      expect(result.transactionDate).toBeInstanceOf(Date);
      expect(result.transactionDate?.getUTCFullYear()).toBe(2026);
      expect(result.transactionDate?.getUTCMonth()).toBe(7);
      expect(result.transactionDate?.getUTCDate()).toBe(24);
    });
  });

  describe('Partial & Fallback Extraction', () => {
    it('handles partial receipts gracefully without fabrication', () => {
      const poorText = `
Unknown Store
Some unreadable text
Amount: 150.000
      `;

      const result = extractReceiptData(poorText);
      expect(result.merchant).toBe('Unknown Store');
      expect(result.totalAmount).toBe(150000);
      expect(result.fieldConfidences.transactionDate).toBe('none');
      expect(result.transactionDate).toBeNull();
    });

    it('handles empty text gracefully', () => {
      const result = extractReceiptData('');
      expect(result.merchant).toBeNull();
      expect(result.totalAmount).toBeNull();
      expect(result.confidence).toBe(0);
    });
  });

  describe('OCR-Confused Receipt (Simulated Poor Quality)', () => {
    it('handles OCR errors like O→0 in amounts', () => {
      const confusedReceipt = `
HIGHLANDS COFFEE
24/O8/2O26

Ca phe sua da        45.OOO
Banh mi cha lua      35.OOO

TONG CONG:          8O.OOO VNĐ
      `;

      const result = extractReceiptData(confusedReceipt);
      expect(result.merchant).toBe('HIGHLANDS COFFEE');
      // The parser should fix O→0 in numeric contexts
      expect(result.totalAmount).toBe(80000);
      expect(result.currency).toBe('VND');
    });
  });

  describe('Date Detection', () => {
    it('extracts DD/MM/YYYY format', () => {
      const lines = ['Date: 24/08/2026'];
      const { date, confidence } = extractDate(lines);
      expect(date).toBeInstanceOf(Date);
      expect(date?.getUTCFullYear()).toBe(2026);
      expect(date?.getUTCMonth()).toBe(7);
      expect(date?.getUTCDate()).toBe(24);
      expect(confidence).toBe('high');
    });

    it('extracts YYYY-MM-DD format', () => {
      const lines = ['2026-08-24'];
      const { date, confidence } = extractDate(lines);
      expect(date).toBeInstanceOf(Date);
      expect(date?.getUTCFullYear()).toBe(2026);
      expect(date?.getUTCMonth()).toBe(7);
      expect(date?.getUTCDate()).toBe(24);
      expect(confidence).toBe('high');
    });

    it('extracts Vietnamese full date format', () => {
      const lines = ['Ngày 24 tháng 8 năm 2026'];
      const { date, confidence } = extractDate(lines);
      expect(date).toBeInstanceOf(Date);
      expect(date?.getUTCFullYear()).toBe(2026);
      expect(date?.getUTCMonth()).toBe(7);
      expect(date?.getUTCDate()).toBe(24);
      expect(confidence).toBe('high');
    });

    it('extracts DD/MM/YY short format', () => {
      const lines = ['24/08/26'];
      const { date, confidence } = extractDate(lines);
      expect(date).toBeInstanceOf(Date);
      expect(date?.getUTCFullYear()).toBe(2026);
      expect(confidence).toBe('medium');
    });

    it('returns none for text without dates', () => {
      const lines = ['No date here'];
      const { date, confidence } = extractDate(lines);
      expect(date).toBeNull();
      expect(confidence).toBe('none');
    });
  });

  describe('Merchant Detection', () => {
    it('extracts merchant from first non-header line', () => {
      const lines = ['HIGHLANDS COFFEE', 'Đ/c: 123 Nguyen Hue', 'MST: 0302829281'];
      const { merchant, confidence } = extractMerchant(lines);
      expect(merchant).toBe('HIGHLANDS COFFEE');
      expect(confidence).toBe('high');
    });

    it('skips header-like lines and picks merchant', () => {
      const lines = ['RECEIPT', 'INVOICE', 'HÓA ĐƠN', 'STARBUCKS', '123 Main St'];
      const { merchant } = extractMerchant(lines);
      expect(merchant).toBe('STARBUCKS');
    });

    it('skips number-only lines', () => {
      const lines = ['001', '12345', 'HIGHLANDS COFFEE'];
      const { merchant } = extractMerchant(lines);
      expect(merchant).toBe('HIGHLANDS COFFEE');
    });

    it('skips phone number lines', () => {
      const lines = ['0912345678', 'HIGHLANDS COFFEE'];
      const { merchant } = extractMerchant(lines);
      expect(merchant).toBe('HIGHLANDS COFFEE');
    });
  });

  describe('Total Detection Scoring', () => {
    it('prefers TỔNG CỘNG over generic TOTAL', () => {
      const receipt = `
Store Name
Tạm tính: 80.000
TỔNG CỘNG: 88.000 đ
CASH: 100.000
      `;
      const result = extractReceiptData(receipt);
      expect(result.totalAmount).toBe(88000);
    });

    it('does not pick SUBTOTAL as total', () => {
      const receipt = `
Store Name
SUBTOTAL: 100.000
TAX: 10.000
TOTAL: 110.000
      `;
      const result = extractReceiptData(receipt);
      expect(result.totalAmount).toBe(110000);
    });

    it('does not pick CASH as total', () => {
      const receipt = `
Store Name
TOTAL: 50.000
CASH: 100.000
CHANGE: 50.000
      `;
      const result = extractReceiptData(receipt);
      expect(result.totalAmount).toBe(50000);
    });

    it('uses agreement between total and payment lines to select correct amount', () => {
      // Simulates OCR where Tổng cộng might be uncertain but Momo confirms
      const receipt = `
SIEU THI FUJIMART
Ngay: 22/08/2026

Cherryducers        520.000
Sua chua             35.000
Banh                 21.120

Tong cong           376.120
Momo                376.120
Gia tri mua         376.120
      `;
      const result = extractReceiptData(receipt);
      // 376120 should be selected because it appears in 3 lines (agreement)
      // vs 520000 which only appears once (unit price)
      expect(result.totalAmount).toBe(376120);
    });

    it('does not use largest number as total when unit prices are present', () => {
      const receipt = `
Store
Cherries (1kg)     520.000
Milk                 35.000
TOTAL              376.120
      `;
      const result = extractReceiptData(receipt);
      // 520000 is a unit price, not the total
      expect(result.totalAmount).toBe(376120);
    });

    it('handles OCR-uncertain total with payment confirmation', () => {
      // OCR reads 378,120 for Tổng cộng but Momo says 376,120
      const receipt = `
SIEU THI FUJIMART
Tong cong           378.120
Momo                376.120
      `;
      const result = extractReceiptData(receipt);
      // Payment line confirms 376120
      expect(result.totalAmount).toBe(376120);
    });
  });

  describe('Line Items', () => {
    it('extracts line items with quantity patterns', () => {
      const receipt = `
COFFEE SHOP
24/08/2026

Cà phê x 2          90.000
Bánh mì             35.000

TỔNG CỘNG:         125.000 VNĐ
      `;
      const result = extractReceiptData(receipt);
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      const coffeeItem = result.items.find((i) => i.description.includes('Cà phê'));
      if (coffeeItem) {
        expect(coffeeItem.quantity).toBe(2);
      }
    });
  });

  describe('Mixed Language Receipt', () => {
    it('handles receipt with both Vietnamese and English', () => {
      const receipt = `
HIGH LANDS COFFEE
24/08/2026

Cà phê sữa đá      45.000
Iced Latte          55.000

SUBTOTAL:          100.000
TỔNG CỘNG:        100.000 VNĐ
      `;
      const result = extractReceiptData(receipt);
      expect(result.merchant).toBe('HIGH LANDS COFFEE');
      expect(result.totalAmount).toBe(100000);
      expect(result.currency).toBe('VND');
    });
  });

  describe('Post-OCR Understanding & Conflict Resolution (Real-world cases)', () => {
    it('resolves conflicting OCR totals using line-item arithmetic and independent fields (Synthetic Fujimart)', () => {
      // Real-world failure pattern:
      // Tổng cộng: 378,120 (OCR misread 6 as 8)
      // +Momo: 378,120 (copied/confused OCR reading)
      // Giá trị mua: 376,120 (independent field)
      // Line items sum: 17500+55000+29160+20000+123760+8500+56300+47000+18900 = 376,120
      const syntheticFujimart = `
SIEU THI FUJIMART
Dia chi: Hoan Kiem, Ha Noi
Ngay hoa don: 22/08/2026-17:54

Banh mi               17.500
Sua tuoi              55.000
Tra sua               29.160
Nuoc khoang           20.000
Cherry 520.000       123.760
Keo                    8.500
Mi tom                56.300
Kem                   47.000
Giay                  18.900

Tong cong: 378.120
Tien khach tra:
+Momo: 378.120
Gia tri mua: 376.120
      `;

      const result = extractReceiptData(syntheticFujimart);

      expect(result.merchant).toBe('SIEU THI FUJIMART');
      expect(result.totalAmount).toBe(376120);
      expect(result.currency).toBe('VND');
      expect(result.transactionDate).toBeInstanceOf(Date);
      expect(result.transactionDate?.getUTCFullYear()).toBe(2026);
      expect(result.transactionDate?.getUTCMonth()).toBe(7); // August
      expect(result.transactionDate?.getUTCDate()).toBe(22);
      expect(result.transactionDate?.getUTCHours()).toBe(17);
      expect(result.transactionDate?.getUTCMinutes()).toBe(54);
      expect(result.items.length).toBe(9);
    });

    it('Test A: correctly selects total using Cash and Change arithmetic validation', () => {
      const receipt = `
MINI MART
TOTAL       150.000
Cash        200.000
Change       50.000
      `;
      const result = extractReceiptData(receipt);
      expect(result.totalAmount).toBe(150000);
      expect(result.fieldConfidences.totalAmount).toBe('high');
    });

    it('Test B: correctly ignores unit price in favor of item total and receipt total', () => {
      const receipt = `
SUPERMARKET
Unit price  520.000
Line total  123.760
TOTAL       376.120
      `;
      const result = extractReceiptData(receipt);
      expect(result.totalAmount).toBe(376120);
    });

    it('Test C: sets uncertainty warning when OCR totals conflict without line-item arithmetic', () => {
      const receipt = `
STORE
Tong cong    378.120
Gia tri mua  376.120
      `;
      const result = extractReceiptData(receipt);
      expect(result.fieldConfidences.amountUncertaintyWarning).toBe(
        'Amount detected with uncertainty — please verify.'
      );
      expect(result.fieldConfidences.totalAmount).not.toBe('high');
    });

    it('Test D: assigns HIGH confidence when all candidate fields agree', () => {
      const receipt = `
SUPERMARKET
Tong cong    376.120
MoMo         376.120
Gia tri mua  376.120
      `;
      const result = extractReceiptData(receipt);
      expect(result.totalAmount).toBe(376120);
      expect(result.fieldConfidences.totalAmount).toBe('high');
      expect(result.fieldConfidences.amountUncertaintyWarning).toBeNull();
    });

    it('Regression: handles isolated OCR noise and item counts without mistaking them for total', () => {
      const noisyReceipt = `
SIEU THI FUJIMART
Dia chi: Ha Noi
Ngay: 22/08/2026 17:54

324583 Banh mi               17.500
327788 Sua tuoi              55.000
Tra sua                      29.160
Nuoc khoang                  20.000
Cherry 520.000              123.760
Keo                           8.500
Mi tom                       56.300
Kem                          47.000
Giay                         18.900

Tổngsố 023 :1
1 4 Ệ_...wam 376,120
Tiền khách trả (VND):
      `;
      const result = extractReceiptData(noisyReceipt);
      expect(result.merchant).toBe('SIEU THI FUJIMART');
      expect(result.totalAmount).toBe(376120);
      expect(result.currency).toBe('VND');
    });

    it('Multi-line A: handles label on separate line before total amount', () => {
      const receipt = `
STORE
Tổng cộng:
376,120
      `;
      const result = extractReceiptData(receipt);
      expect(result.totalAmount).toBe(376120);
    });

    it('Multi-line B: handles dot separator with VNĐ suffix', () => {
      const receipt = `
STORE
Tổng cộng 376.120 VNĐ
      `;
      const result = extractReceiptData(receipt);
      expect(result.totalAmount).toBe(376120);
    });

    it('Multi-line C: distinguishes item count line from total amount line', () => {
      const receipt = `
STORE
Tổng số: 1
Tổng cộng: 376,120
      `;
      const result = extractReceiptData(receipt);
      expect(result.totalAmount).toBe(376120);
    });

    it('Multi-line D: ignores unit price in favor of receipt total', () => {
      const receipt = `
STORE
Unit Price 520,000
Total 376,120
      `;
      const result = extractReceiptData(receipt);
      expect(result.totalAmount).toBe(376120);
    });

    it('Multi-line E: handles payment method line preceding total amount', () => {
      const receipt = `
STORE
Tiền khách trả (VND):
376,120
      `;
      const result = extractReceiptData(receipt);
      expect(result.totalAmount).toBe(376120);
      expect(result.currency).toBe('VND');
    });

    it('Corrupted F: does not fabricate a total when text contains corrupted total characters', () => {
      const receipt = `
STORE
Tổng cộng ???
      `;
      const result = extractReceiptData(receipt);
      expect(result.totalAmount).toBeNull();
      expect(result.fieldConfidences.totalAmount).toBe('none');
    });
  });
});
