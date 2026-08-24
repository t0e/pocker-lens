import { describe, it, expect } from "vitest";
import { getAnalyticsPeriodBounds, AnalyticsQuerySchema } from "./index.js";

describe("Analytics Shared Contracts & Utilities", () => {
  it("validates AnalyticsQuerySchema properly", () => {
    const valid = AnalyticsQuerySchema.safeParse({
      timeRange: "current_month",
      month: "2026-08",
      currency: "VND",
    });
    expect(valid.success).toBe(true);

    const invalidMonth = AnalyticsQuerySchema.safeParse({
      month: "invalid-month",
    });
    expect(invalidMonth.success).toBe(false);
  });

  it("calculates current_month period bounds correctly in UTC", () => {
    const refDate = new Date(Date.UTC(2026, 7, 24, 12, 0, 0)); // Aug 24, 2026
    const { current, previous } = getAnalyticsPeriodBounds("current_month", undefined, undefined, undefined, refDate);

    expect(current.start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(current.end.toISOString()).toBe("2026-08-31T23:59:59.999Z");
    expect(current.label).toContain("August 2026");

    expect(previous).toBeDefined();
    expect(previous!.start.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(previous!.end.toISOString()).toBe("2026-07-31T23:59:59.999Z");
  });

  it("calculates custom month bounds correctly", () => {
    const { current, previous } = getAnalyticsPeriodBounds("custom", "2026-02");
    expect(current.start.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(current.end.toISOString()).toBe("2026-02-28T23:59:59.999Z");

    expect(previous!.start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(previous!.end.toISOString()).toBe("2026-01-31T23:59:59.999Z");
  });

  it("calculates leap year Feb month bounds correctly", () => {
    const { current } = getAnalyticsPeriodBounds("custom", "2024-02");
    expect(current.start.toISOString()).toBe("2024-02-01T00:00:00.000Z");
    expect(current.end.toISOString()).toBe("2024-02-29T23:59:59.999Z");
  });

  it("calculates last_3_months bounds correctly", () => {
    const refDate = new Date(Date.UTC(2026, 7, 24)); // August 2026
    const { current, previous } = getAnalyticsPeriodBounds("last_3_months", undefined, undefined, undefined, refDate);
    expect(current.start.toISOString()).toBe("2026-06-01T00:00:00.000Z");
    expect(current.end.toISOString()).toBe("2026-08-31T23:59:59.999Z");
    expect(previous!.start.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(previous!.end.toISOString()).toBe("2026-05-31T23:59:59.999Z");
  });
});
