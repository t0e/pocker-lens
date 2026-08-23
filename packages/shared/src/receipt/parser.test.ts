import { describe, it, expect } from 'vitest';
import { extractReceiptData, parseReceiptAmount } from './parser.js';

describe('Multilingual Receipt Parser (Phase 6)', () => {
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
});
