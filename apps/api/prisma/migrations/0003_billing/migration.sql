-- 0003_billing: invoices, payments, allocations, customer credit, SMS outbox

CREATE TYPE "invoice_status" AS ENUM ('ISSUED', 'PARTIALLY_PAID', 'PAID', 'VOID');
CREATE TYPE "payment_method" AS ENUM ('CASH', 'BKASH');
CREATE TYPE "payment_status" AS ENUM ('POSTED', 'REVERSED');
CREATE TYPE "sms_type" AS ENUM ('REMINDER_D2', 'REMINDER_D1', 'PAYMENT_RECEIVED');
CREATE TYPE "sms_status" AS ENUM ('PENDING', 'SENT', 'FAILED', 'CANCELLED');

ALTER TABLE "customers"
    ADD COLUMN "credit_poisha" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN "sms_opt_out" BOOLEAN NOT NULL DEFAULT false,
    ADD CONSTRAINT "customers_credit_check" CHECK ("credit_poisha" >= 0);

CREATE TABLE "invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_number" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "period" DATE NOT NULL,
    "amount_poisha" BIGINT NOT NULL,
    "paid_poisha" BIGINT NOT NULL DEFAULT 0,
    "credit_applied_poisha" BIGINT NOT NULL DEFAULT 0,
    "due_date" DATE NOT NULL,
    "status" "invoice_status" NOT NULL DEFAULT 'ISSUED',
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoices_amount_check" CHECK ("amount_poisha" >= 0),
    CONSTRAINT "invoices_paid_check" CHECK ("paid_poisha" >= 0 AND "paid_poisha" <= "amount_poisha")
);
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");
CREATE UNIQUE INDEX "invoices_customer_id_period_key" ON "invoices"("customer_id", "period");
CREATE INDEX "invoices_status_due_date_idx" ON "invoices"("status", "due_date");
CREATE INDEX "invoices_period_idx" ON "invoices"("period");

CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receipt_number" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "amount_poisha" BIGINT NOT NULL,
    "credit_poisha" BIGINT NOT NULL DEFAULT 0,
    "method" "payment_method" NOT NULL,
    "bkash_trx_id" TEXT,
    "status" "payment_status" NOT NULL DEFAULT 'POSTED',
    "note" TEXT,
    "received_by" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "reversed_at" TIMESTAMPTZ(6),
    "reversed_by" UUID,
    "reverse_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payments_amount_check" CHECK ("amount_poisha" > 0),
    CONSTRAINT "payments_credit_check" CHECK ("credit_poisha" >= 0 AND "credit_poisha" <= "amount_poisha"),
    CONSTRAINT "payments_bkash_check" CHECK ("method" <> 'BKASH' OR "bkash_trx_id" IS NOT NULL)
);
CREATE UNIQUE INDEX "payments_receipt_number_key" ON "payments"("receipt_number");
-- A bKash transaction can pay only once, even if the first record was later reversed (prevents re-use of a receipt).
CREATE UNIQUE INDEX "payments_bkash_trx_id_key" ON "payments"("bkash_trx_id") WHERE "bkash_trx_id" IS NOT NULL;
CREATE INDEX "payments_customer_id_received_at_idx" ON "payments"("customer_id", "received_at");
CREATE INDEX "payments_received_at_idx" ON "payments"("received_at");

CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount_poisha" BIGINT NOT NULL,
    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_allocations_amount_check" CHECK ("amount_poisha" > 0)
);
CREATE INDEX "payment_allocations_payment_id_idx" ON "payment_allocations"("payment_id");
CREATE INDEX "payment_allocations_invoice_id_idx" ON "payment_allocations"("invoice_id");

CREATE TABLE "sms_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "sms_type" NOT NULL,
    "customer_id" UUID NOT NULL,
    "invoice_id" UUID,
    "payment_id" UUID,
    "phone" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "sms_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "scheduled_for" TIMESTAMPTZ(6) NOT NULL,
    "sent_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id")
);
-- At most one message per (invoice, type) and per (payment, type): restarts and retries can never double-send.
CREATE UNIQUE INDEX "sms_messages_invoice_type_key" ON "sms_messages"("invoice_id", "type") WHERE "invoice_id" IS NOT NULL;
CREATE UNIQUE INDEX "sms_messages_payment_type_key" ON "sms_messages"("payment_id", "type") WHERE "payment_id" IS NOT NULL;
CREATE INDEX "sms_messages_status_scheduled_for_idx" ON "sms_messages"("status", "scheduled_for");

ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_fkey"
    FOREIGN KEY ("received_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payments" ADD CONSTRAINT "payments_reversed_by_fkey"
    FOREIGN KEY ("reversed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_payment_id_fkey"
    FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE SEQUENCE "receipt_seq" START 1;
