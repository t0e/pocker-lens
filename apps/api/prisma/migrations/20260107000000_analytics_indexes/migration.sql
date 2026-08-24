-- CreateIndex
CREATE INDEX "transactions_user_id_type_transaction_date_idx" ON "transactions"("user_id", "type", "transaction_date");

-- CreateIndex
CREATE INDEX "transactions_user_id_currency_transaction_date_idx" ON "transactions"("user_id", "currency", "transaction_date");

-- CreateIndex
CREATE INDEX "transactions_user_id_category_id_transaction_date_idx" ON "transactions"("user_id", "category_id", "transaction_date");

-- CreateIndex
CREATE INDEX "transactions_user_id_merchant_idx" ON "transactions"("user_id", "merchant");
