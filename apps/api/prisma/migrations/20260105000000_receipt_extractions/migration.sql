-- CreateTable
CREATE TABLE "receipt_extractions" (
    "id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "merchant" TEXT,
    "transaction_date" TIMESTAMP(3),
    "total_amount" DECIMAL(19,4),
    "currency" VARCHAR(3),
    "category_id" TEXT,
    "account_id" TEXT,
    "raw_text" TEXT NOT NULL,
    "detected_language" TEXT,
    "confidence" DECIMAL(5,2),
    "field_confidences" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipt_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_items" (
    "id" TEXT NOT NULL,
    "extraction_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2),
    "unit_price" DECIMAL(19,4),
    "total_price" DECIMAL(19,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receipt_extractions_receipt_id_key" ON "receipt_extractions"("receipt_id");

-- CreateIndex
CREATE INDEX "receipt_extractions_receipt_id_idx" ON "receipt_extractions"("receipt_id");

-- CreateIndex
CREATE INDEX "receipt_items_extraction_id_idx" ON "receipt_items"("extraction_id");

-- AddForeignKey
ALTER TABLE "receipt_extractions" ADD CONSTRAINT "receipt_extractions_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_extractions" ADD CONSTRAINT "receipt_extractions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_extractions" ADD CONSTRAINT "receipt_extractions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_items" ADD CONSTRAINT "receipt_items_extraction_id_fkey" FOREIGN KEY ("extraction_id") REFERENCES "receipt_extractions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
