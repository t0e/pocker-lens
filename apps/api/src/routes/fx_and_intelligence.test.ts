import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildApp } from "../app.js";
import { prisma } from "../db/client.js";
import * as authService from "../auth/service.js";
import { categorizationService } from "../services/categorization.js";
import { duplicateDetectionService } from "../services/duplicates.js";
import { dataQualityService } from "../services/dataQuality.js";
import { fxService } from "../services/fx.js";

describe("Phase 9: FX & Smart Intelligence Routes", () => {
  let app: ReturnType<typeof buildApp>;

  const userA = {
    id: "user_A_id",
    email: "userA@example.com",
    displayName: "User A",
    reportingCurrency: "VND",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    app = buildApp();
    vi.spyOn(authService, "validateSession").mockResolvedValue(userA as any);
  });

  describe("Exchange Rates & FX Service", () => {
    it("GET /fx/rates returns rate for USD to VND", async () => {
      vi.spyOn(fxService, "getExchangeRate").mockResolvedValue({ rate: 25400, rateDate: "2026-08-24" });

      const res = await app.inject({
        method: "GET",
        url: "/fx/rates?baseCurrency=USD&quoteCurrency=VND",
        headers: { authorization: "Bearer fake-token" },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.baseCurrency).toBe("USD");
      expect(json.quoteCurrency).toBe("VND");
      expect(json.rate).toBe(25400);
    });

    it("GET /fx/rates returns 404 when rate is unavailable", async () => {
      vi.spyOn(fxService, "getExchangeRate").mockResolvedValue(null);

      const res = await app.inject({
        method: "GET",
        url: "/fx/rates?baseCurrency=USD&quoteCurrency=XYZ",
        headers: { authorization: "Bearer fake-token" },
      });

      expect(res.statusCode).toBe(404);
    });

    it("GET /fx/reporting-currency returns current reporting currency", async () => {
      vi.spyOn(prisma.user, "findUnique").mockResolvedValue(userA as any);

      const res = await app.inject({
        method: "GET",
        url: "/fx/reporting-currency",
        headers: { authorization: "Bearer fake-token" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().reportingCurrency).toBe("VND");
    });

    it("POST /fx/reporting-currency updates user preference", async () => {
      vi.spyOn(prisma.user, "update").mockResolvedValue({ ...userA, reportingCurrency: "USD" } as any);

      const res = await app.inject({
        method: "POST",
        url: "/fx/reporting-currency",
        headers: { authorization: "Bearer fake-token" },
        payload: { reportingCurrency: "USD" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().reportingCurrency).toBe("USD");
    });

    it("POST /fx/reporting-currency rejects unsupported currency codes", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/fx/reporting-currency",
        headers: { authorization: "Bearer fake-token" },
        payload: { reportingCurrency: "FOOBAR" },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("Smarter Categorization Endpoints", () => {
    it("POST /categories/suggest returns category prediction and confidence", async () => {
      vi.spyOn(categorizationService, "suggestCategory").mockResolvedValue({
        categoryId: "cat_food",
        categoryName: "Food & Drink",
        categoryIcon: "utensils",
        confidence: "HIGH",
        reason: "Matched user history for Highlands Coffee",
      });

      const res = await app.inject({
        method: "POST",
        url: "/categories/suggest",
        headers: { authorization: "Bearer fake-token" },
        payload: {
          merchant: "Highlands Coffee",
          description: "Afternoon Drink",
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.categoryId).toBe("cat_food");
      expect(json.confidence).toBe("HIGH");
    });
  });

  describe("Duplicate Detection Endpoints", () => {
    it("POST /transactions/check-duplicates returns detected duplicate candidates", async () => {
      vi.spyOn(duplicateDetectionService, "checkDuplicates").mockResolvedValue({
        hasDuplicate: true,
        highestConfidence: "EXACT",
        matches: [
          {
            existingTransactionId: "tx_123",
            confidence: "EXACT",
            score: 1.0,
            reason: "Exact match on amount and date",
            existingTransaction: {
              id: "tx_123",
              description: "Highlands Coffee",
              merchant: "Highlands Coffee",
              amount: 55000,
              currency: "VND",
              transactionDate: "2026-08-24T08:00:00.000Z",
              accountId: "acc_1",
              accountName: "Cash Wallet",
              categoryId: "cat_food",
            },
          },
        ],
      });

      const res = await app.inject({
        method: "POST",
        url: "/transactions/check-duplicates",
        headers: { authorization: "Bearer fake-token" },
        payload: {
          accountId: "acc_1",
          amount: 55000,
          currency: "VND",
          transactionDate: "2026-08-24T08:00:00.000Z",
          description: "Highlands Coffee",
          merchant: "Highlands Coffee",
          type: "EXPENSE",
        },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.hasDuplicate).toBe(true);
      expect(json.highestConfidence).toBe("EXACT");
    });
  });

  describe("Data Quality Report Endpoint", () => {
    it("GET /analytics/data-quality returns quality metrics and uncategorized items", async () => {
      vi.spyOn(dataQualityService, "getReport").mockResolvedValue({
        uncategorizedCount: 3,
        potentialDuplicatesCount: 1,
        pendingReceiptsCount: 2,
        uncategorizedTransactions: [
          {
            id: "tx_999",
            description: "Coffee",
            merchant: "Highlands",
            amount: 55000,
            currency: "VND",
            transactionDate: "2026-08-24T08:00:00.000Z",
            accountId: "acc_1",
            accountName: "Checking",
            suggestedCategory: {
              categoryId: "cat_food",
              categoryName: "Food & Drink",
              categoryIcon: "utensils",
              confidence: "HIGH",
              reason: "User history",
            },
          },
        ],
      });

      const res = await app.inject({
        method: "GET",
        url: "/analytics/data-quality",
        headers: { authorization: "Bearer fake-token" },
      });

      expect(res.statusCode).toBe(200);
      const json = res.json();
      expect(json.uncategorizedCount).toBe(3);
      expect(json.potentialDuplicatesCount).toBe(1);
      expect(json.pendingReceiptsCount).toBe(2);
      expect(json.uncategorizedTransactions[0].suggestedCategory?.confidence).toBe("HIGH");
    });
  });
});