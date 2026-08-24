import { FastifyPluginAsync } from "fastify";
import {
  getFinancialSummary,
  getCashFlowTrends,
  getCategoryBreakdown,
  getMerchantBreakdown,
  getBiggestExpenses,
  getAccountActivity,
  getBudgetPerformance,
  getCommitmentsSummary,
  generateSpendingInsights,
} from "../services/analytics.js";
import { TimeRangeType, TimeRangeTypeSchema } from "@pocketlens/shared";

export const analyticsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("preHandler", fastify.authenticate);

  // 1. GET /analytics/summary
  fastify.get("/analytics/summary", async (request, reply) => {
    const query = request.query as {
      timeRange?: string;
      month?: string;
      startDate?: string;
      endDate?: string;
      currency?: string;
      reportingCurrency?: string;
    };
    const userId = request.user.id;

    const timeRange = (
      TimeRangeTypeSchema.safeParse(query.timeRange).success
        ? query.timeRange
        : "current_month"
    ) as TimeRangeType;

    const result = await getFinancialSummary(
      userId,
      timeRange,
      query.month,
      query.startDate,
      query.endDate,
      query.currency,
      query.reportingCurrency
    );

    return reply.send(result);
  });

  // 2. GET /analytics/trends
  fastify.get("/analytics/trends", async (request, reply) => {
    const query = request.query as {
      currency?: string;
      months?: string;
    };
    const userId = request.user.id;
    const currency = query.currency || "VND";
    const monthsCount = Math.min(Math.max(parseInt(query.months || "6", 10) || 6, 2), 24);

    const result = await getCashFlowTrends(userId, currency, monthsCount);
    return reply.send(result);
  });

  // 3. GET /analytics/categories
  fastify.get("/analytics/categories", async (request, reply) => {
    const query = request.query as {
      timeRange?: string;
      month?: string;
      startDate?: string;
      endDate?: string;
      currency?: string;
    };
    const userId = request.user.id;
    const currency = query.currency || "VND";
    const timeRange = (
      TimeRangeTypeSchema.safeParse(query.timeRange).success
        ? query.timeRange
        : "current_month"
    ) as TimeRangeType;

    const result = await getCategoryBreakdown(
      userId,
      timeRange,
      query.month,
      query.startDate,
      query.endDate,
      currency
    );

    return reply.send(result);
  });

  // 4. GET /analytics/merchants
  fastify.get("/analytics/merchants", async (request, reply) => {
    const query = request.query as {
      timeRange?: string;
      month?: string;
      startDate?: string;
      endDate?: string;
      currency?: string;
      limit?: string;
    };
    const userId = request.user.id;
    const currency = query.currency || "VND";
    const limit = Math.min(Math.max(parseInt(query.limit || "10", 10) || 10, 1), 50);
    const timeRange = (
      TimeRangeTypeSchema.safeParse(query.timeRange).success
        ? query.timeRange
        : "current_month"
    ) as TimeRangeType;

    const result = await getMerchantBreakdown(
      userId,
      timeRange,
      query.month,
      query.startDate,
      query.endDate,
      currency,
      limit
    );

    return reply.send(result);
  });

  // 5. GET /analytics/expenses/biggest
  fastify.get("/analytics/expenses/biggest", async (request, reply) => {
    const query = request.query as {
      timeRange?: string;
      month?: string;
      startDate?: string;
      endDate?: string;
      currency?: string;
      limit?: string;
    };
    const userId = request.user.id;
    const currency = query.currency || "VND";
    const limit = Math.min(Math.max(parseInt(query.limit || "10", 10) || 10, 1), 50);
    const timeRange = (
      TimeRangeTypeSchema.safeParse(query.timeRange).success
        ? query.timeRange
        : "current_month"
    ) as TimeRangeType;

    const result = await getBiggestExpenses(
      userId,
      timeRange,
      query.month,
      query.startDate,
      query.endDate,
      currency,
      limit
    );

    return reply.send(result);
  });

  // 6. GET /analytics/accounts
  fastify.get("/analytics/accounts", async (request, reply) => {
    const query = request.query as {
      timeRange?: string;
      month?: string;
      startDate?: string;
      endDate?: string;
      currency?: string;
      reportingCurrency?: string;
    };
    const userId = request.user.id;
    const timeRange = (
      TimeRangeTypeSchema.safeParse(query.timeRange).success
        ? query.timeRange
        : "current_month"
    ) as TimeRangeType;

    const result = await getAccountActivity(
      userId,
      timeRange,
      query.month,
      query.startDate,
      query.endDate,
      query.currency,
      query.reportingCurrency
    );

    return reply.send(result);
  });

  // 7. GET /analytics/budgets
  fastify.get("/analytics/budgets", async (request, reply) => {
    const query = request.query as {
      month?: string;
      currency?: string;
    };
    const userId = request.user.id;
    const currency = query.currency || "VND";

    const result = await getBudgetPerformance(userId, query.month, currency);
    return reply.send(result);
  });

  // 8. GET /analytics/subscriptions
  fastify.get("/analytics/subscriptions", async (request, reply) => {
    const query = request.query as {
      currency?: string;
    };
    const userId = request.user.id;
    const currency = query.currency || "VND";

    const result = await getCommitmentsSummary(userId, currency);
    return reply.send(result);
  });

  // 9. GET /analytics/insights
  fastify.get("/analytics/insights", async (request, reply) => {
    const query = request.query as {
      month?: string;
      currency?: string;
    };
    const userId = request.user.id;
    const currency = query.currency || "VND";

    const result = await generateSpendingInsights(userId, query.month, currency);
    return reply.send(result);
  });
};
