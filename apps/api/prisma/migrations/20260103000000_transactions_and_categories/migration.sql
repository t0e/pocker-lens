-- CreateEnum
CREATE TYPE "CategoryType" AS ENUM ('expense', 'income');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('expense', 'income', 'transfer');

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "type" "CategoryType" NOT NULL,
    "icon" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "account_id" TEXT NOT NULL,
    "transfer_account_id" TEXT,
    "category_id" TEXT,
    "amount" DECIMAL(19,4) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "transaction_date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "merchant" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "categories_user_id_idx" ON "categories"("user_id");

-- CreateIndex
CREATE INDEX "categories_type_idx" ON "categories"("type");

-- CreateIndex
CREATE INDEX "transactions_user_id_idx" ON "transactions"("user_id");

-- CreateIndex
CREATE INDEX "transactions_account_id_idx" ON "transactions"("account_id");

-- CreateIndex
CREATE INDEX "transactions_transfer_account_id_idx" ON "transactions"("transfer_account_id");

-- CreateIndex
CREATE INDEX "transactions_category_id_idx" ON "transactions"("category_id");

-- CreateIndex
CREATE INDEX "transactions_transaction_date_idx" ON "transactions"("transaction_date");

-- CreateIndex
CREATE INDEX "transactions_user_id_transaction_date_idx" ON "transactions"("user_id", "transaction_date");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transfer_account_id_fkey" FOREIGN KEY ("transfer_account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default system categories
INSERT INTO "categories" ("id", "name", "type", "icon", "is_system", "is_archived", "created_at", "updated_at") VALUES
('cat_food', 'Food & Drink', 'expense', 'utensils', true, false, NOW(), NOW()),
('cat_groceries', 'Groceries', 'expense', 'shopping-cart', true, false, NOW(), NOW()),
('cat_transport', 'Transport', 'expense', 'car', true, false, NOW(), NOW()),
('cat_housing', 'Housing & Rent', 'expense', 'home', true, false, NOW(), NOW()),
('cat_shopping', 'Shopping', 'expense', 'shopping-bag', true, false, NOW(), NOW()),
('cat_entertainment', 'Entertainment', 'expense', 'film', true, false, NOW(), NOW()),
('cat_health', 'Health & Medical', 'expense', 'heart-pulse', true, false, NOW(), NOW()),
('cat_education', 'Education', 'expense', 'book-open', true, false, NOW(), NOW()),
('cat_utilities', 'Utilities & Bills', 'expense', 'zap', true, false, NOW(), NOW()),
('cat_travel', 'Travel & Vacation', 'expense', 'plane', true, false, NOW(), NOW()),
('cat_personal', 'Personal Care', 'expense', 'sparkles', true, false, NOW(), NOW()),
('cat_other_exp', 'Other Expense', 'expense', 'circle-ellipsis', true, false, NOW(), NOW()),
('cat_salary', 'Salary', 'income', 'banknote', true, false, NOW(), NOW()),
('cat_freelance', 'Freelance & Side Gig', 'income', 'briefcase', true, false, NOW(), NOW()),
('cat_bonus', 'Bonus', 'income', 'award', true, false, NOW(), NOW()),
('cat_investment', 'Investment & Dividends', 'income', 'trending-up', true, false, NOW(), NOW()),
('cat_gift', 'Gift', 'income', 'gift', true, false, NOW(), NOW()),
('cat_refund', 'Refund & Cashback', 'income', 'rotate-ccw', true, false, NOW(), NOW()),
('cat_other_inc', 'Other Income', 'income', 'plus-circle', true, false, NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;
