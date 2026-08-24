-- AlterTable User add reporting_currency
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "reporting_currency" VARCHAR(3) NOT NULL DEFAULT 'VND';

-- CreateTable ExchangeRate
CREATE TABLE IF NOT EXISTS "exchange_rates" (
    "id" TEXT NOT NULL,
    "base_currency" VARCHAR(3) NOT NULL,
    "quote_currency" VARCHAR(3) NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "rate_date" DATE NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'default',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "exchange_rates_base_currency_quote_currency_rate_date_provider_key" ON "exchange_rates"("base_currency", "quote_currency", "rate_date", "provider");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exchange_rates_base_currency_quote_currency_rate_date_idx" ON "exchange_rates"("base_currency", "quote_currency", "rate_date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "exchange_rates_rate_date_idx" ON "exchange_rates"("rate_date");
