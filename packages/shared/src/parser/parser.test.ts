import { describe, it, expect, beforeEach } from 'vitest';
import { RuleBasedParser } from './rule-based.js';
import { ParserUserContext } from './types.js';

describe('Natural Language RuleBasedParser', () => {
  let parser: RuleBasedParser;
  let userContext: ParserUserContext;

  beforeEach(() => {
    parser = new RuleBasedParser();
    userContext = {
      accounts: [
        {
          id: 'acc_vcb',
          name: 'Vietcombank',
          type: 'bank',
          currency: 'VND',
          isDefault: true,
          isArchived: false,
        },
        {
          id: 'acc_cash',
          name: 'Cash',
          type: 'cash',
          currency: 'VND',
          isDefault: false,
          isArchived: false,
        },
        {
          id: 'acc_usd_bank',
          name: 'Chase Checking',
          type: 'bank',
          currency: 'USD',
          isDefault: false,
          isArchived: false,
        },
      ],
      categories: [
        {
          id: 'cat_food',
          name: 'Food & Drink',
          type: 'expense',
          icon: 'utensils',
          isSystem: true,
        },
        {
          id: 'cat_transport',
          name: 'Transport',
          type: 'expense',
          icon: 'car',
          isSystem: true,
        },
        {
          id: 'cat_salary',
          name: 'Salary',
          type: 'income',
          icon: 'banknote',
          isSystem: true,
        },
        {
          id: 'cat_coffee',
          name: 'Specialty Coffee',
          type: 'expense',
          icon: 'utensils',
          isSystem: false,
        },
      ],
      preferredCurrency: 'VND',
    };
  });

  describe('Amount Parsing (Section 30)', () => {
    const testCases = [
      { input: '85k', expected: '85000' },
      { input: '85,000', expected: '85000' },
      { input: '85000', expected: '85000' },
      { input: '2m', expected: '2000000' },
      { input: '2tr', expected: '2000000' },
      { input: '2 triệu', expected: '2000000' },
      { input: '80 nghìn', expected: '80000' },
      { input: '80 ngàn', expected: '80000' },
      { input: '1500.50', expected: '1500.50' },
      { input: '3.5tr', expected: '3500000' },
    ];

    testCases.forEach(({ input, expected }) => {
      it(`parses amount "${input}" into "${expected}"`, () => {
        const result = parser.parse(`Lunch ${input} cash`, userContext);
        expect(result.parsed.amount).toBe(expected);
      });
    });
  });

  describe('English Input Parsing (Section 31)', () => {
    it('parses "Lunch 85k cash"', () => {
      const result = parser.parse('Lunch 85k cash', userContext);
      expect(result.parsed.type).toBe('expense');
      expect(result.parsed.amount).toBe('85000');
      expect(result.parsed.currency).toBe('VND');
      expect(result.parsed.categoryName).toBe('Food & Drink');
      expect(result.parsed.accountName).toBe('Cash');
      expect(result.parsed.confidence.overall).toBeGreaterThanOrEqual(0.85);
    });

    it('parses "Coffee 45k"', () => {
      const result = parser.parse('Coffee 45k', userContext);
      expect(result.parsed.type).toBe('expense');
      expect(result.parsed.amount).toBe('45000');
      expect(result.parsed.categoryName).toBe('Food & Drink');
      expect(result.parsed.accountId).toBe('acc_vcb'); // Falls back to default account
    });

    it('parses "Salary 32m to Vietcombank"', () => {
      const result = parser.parse('Salary 32m to Vietcombank', userContext);
      expect(result.parsed.type).toBe('income');
      expect(result.parsed.amount).toBe('32000000');
      expect(result.parsed.categoryName).toBe('Salary');
      expect(result.parsed.accountId).toBe('acc_vcb');
    });

    it('parses "Transfer 2m from Vietcombank to Cash"', () => {
      const result = parser.parse('Transfer 2m from Vietcombank to Cash', userContext);
      expect(result.parsed.type).toBe('transfer');
      expect(result.parsed.amount).toBe('2000000');
      expect(result.parsed.accountId).toBe('acc_vcb');
      expect(result.parsed.transferAccountId).toBe('acc_cash');
    });
  });

  describe('Vietnamese Input Parsing (Section 32)', () => {
    it('parses "ăn trưa 80k tiền mặt"', () => {
      const result = parser.parse('ăn trưa 80k tiền mặt', userContext);
      expect(result.parsed.type).toBe('expense');
      expect(result.parsed.amount).toBe('80000');
      expect(result.parsed.categoryName).toBe('Food & Drink');
      expect(result.parsed.accountId).toBe('acc_cash');
    });

    it('parses "cà phê 45k"', () => {
      const result = parser.parse('cà phê 45k', userContext);
      expect(result.parsed.type).toBe('expense');
      expect(result.parsed.amount).toBe('45000');
      expect(result.parsed.categoryName).toBe('Food & Drink');
    });

    it('parses "nhận lương 32tr vào Vietcombank"', () => {
      const result = parser.parse('nhận lương 32tr vào Vietcombank', userContext);
      expect(result.parsed.type).toBe('income');
      expect(result.parsed.amount).toBe('32000000');
      expect(result.parsed.categoryName).toBe('Salary');
      expect(result.parsed.accountId).toBe('acc_vcb');
    });

    it('parses "chuyển 2tr từ Vietcombank sang tiền mặt"', () => {
      const result = parser.parse('chuyển 2tr từ Vietcombank sang tiền mặt', userContext);
      expect(result.parsed.type).toBe('transfer');
      expect(result.parsed.amount).toBe('2000000');
      expect(result.parsed.accountId).toBe('acc_vcb');
      expect(result.parsed.transferAccountId).toBe('acc_cash');
    });
  });

  describe('Ambiguity and User Isolation (Sections 33, 34)', () => {
    it('requires confirmation when amount is missing', () => {
      const result = parser.parse('Lunch with friends at Highlands', userContext);
      expect(result.parsed.amount).toBeNull();
      expect(result.requiresConfirmation).toBe(true);
    });

    it('never resolves another user’s account not in userContext', () => {
      // User B has account "SecretOffshoreBank"
      const result = parser.parse('Lunch 80k SecretOffshoreBank', userContext);
      expect(result.parsed.accountName).not.toBe('SecretOffshoreBank');
      // Should fallback to default account with lower confidence or leave unassigned
      expect(result.parsed.accountId).toBe('acc_vcb');
    });
  });
});
