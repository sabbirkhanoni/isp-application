-- 0004_bkash: statement import batches and the reconciliation queue

CREATE TYPE "bkash_tx_status" AS ENUM ('POSTED', 'VERIFIED', 'NEEDS_REVIEW', 'ASSIGNED', 'IGNORED');
CREATE TYPE "bkash_review_reason" AS ENUM ('NO_REFERENCE_MATCH', 'PHONE_SUGGESTION', 'AMOUNT_MISMATCH');

CREATE TABLE "bkash_import_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "file_name" TEXT NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "total_rows" INTEGER NOT NULL,
    "posted_count" INTEGER NOT NULL,
    "verified_count" INTEGER NOT NULL,
    "review_count" INTEGER NOT NULL,
    "duplicate_count" INTEGER NOT NULL,
    "invalid_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bkash_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bkash_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "trx_id" TEXT NOT NULL,
    "amount_poisha" BIGINT NOT NULL,
    "sender_phone" TEXT,
    "reference" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "bkash_tx_status" NOT NULL,
    "review_reason" "bkash_review_reason",
    "suggested_customer_id" UUID,
    "customer_id" UUID,
    "payment_id" UUID,
    "batch_id" UUID NOT NULL,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "ignore_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "bkash_transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bkash_transactions_amount_check" CHECK ("amount_poisha" > 0)
);
-- A bKash transaction exists at most once in the system, no matter how many times a statement is uploaded.
CREATE UNIQUE INDEX "bkash_transactions_trx_id_key" ON "bkash_transactions"("trx_id");
CREATE UNIQUE INDEX "bkash_transactions_payment_id_key" ON "bkash_transactions"("payment_id") WHERE "payment_id" IS NOT NULL;
CREATE INDEX "bkash_transactions_status_occurred_at_idx" ON "bkash_transactions"("status", "occurred_at");
CREATE INDEX "bkash_transactions_batch_id_idx" ON "bkash_transactions"("batch_id");

ALTER TABLE "bkash_import_batches" ADD CONSTRAINT "bkash_import_batches_uploaded_by_fkey"
    FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bkash_transactions" ADD CONSTRAINT "bkash_transactions_batch_id_fkey"
    FOREIGN KEY ("batch_id") REFERENCES "bkash_import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bkash_transactions" ADD CONSTRAINT "bkash_transactions_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bkash_transactions" ADD CONSTRAINT "bkash_transactions_suggested_customer_id_fkey"
    FOREIGN KEY ("suggested_customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bkash_transactions" ADD CONSTRAINT "bkash_transactions_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bkash_transactions" ADD CONSTRAINT "bkash_transactions_resolved_by_fkey"
    FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
