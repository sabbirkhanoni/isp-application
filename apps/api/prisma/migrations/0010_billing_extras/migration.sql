-- Phase 15: invoice lines, one-time charges, monthly discount, join date, moved payments.

CREATE TYPE "invoice_line_kind" AS ENUM ('PACKAGE', 'DISCOUNT', 'ONE_TIME', 'PRORATION');
CREATE TYPE "charge_status" AS ENUM ('PENDING', 'BILLED', 'CANCELLED');

CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoice_id" UUID NOT NULL,
    "kind" "invoice_line_kind" NOT NULL,
    "description" TEXT NOT NULL,
    -- Signed: charges are positive, discounts negative.
    "amount_poisha" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoice_lines_invoice_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE
);
CREATE INDEX "invoice_lines_invoice_id_idx" ON "invoice_lines"("invoice_id");

-- Existing invoices get one PACKAGE line equal to their amount, so every invoice has lines.
INSERT INTO "invoice_lines" ("invoice_id", "kind", "description", "amount_poisha")
SELECT "id", 'PACKAGE', 'Internet', "amount_poisha" FROM "invoices";

CREATE TABLE "charges" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    -- Signed: positive = extra charge, negative = one-time discount.
    "amount_poisha" BIGINT NOT NULL,
    "status" "charge_status" NOT NULL DEFAULT 'PENDING',
    "invoice_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "charges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "charges_amount_check" CHECK ("amount_poisha" <> 0),
    CONSTRAINT "charges_customer_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id"),
    CONSTRAINT "charges_invoice_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id"),
    CONSTRAINT "charges_creator_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id")
);
CREATE INDEX "charges_customer_status_idx" ON "charges"("customer_id", "status");

ALTER TABLE "subscriptions"
    ADD COLUMN "monthly_discount_poisha" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN "discount_note" TEXT,
    ADD CONSTRAINT "subscriptions_discount_check" CHECK ("monthly_discount_poisha" >= 0);

-- Day the customer joined; NULL for customers loaded by the import (they are billed a full month).
ALTER TABLE "customers" ADD COLUMN "joined_on" DATE;

ALTER TABLE "payments"
    ADD COLUMN "moved_from_customer_id" UUID,
    ADD COLUMN "moved_at" TIMESTAMPTZ(6),
    ADD CONSTRAINT "payments_moved_from_fkey" FOREIGN KEY ("moved_from_customer_id") REFERENCES "customers"("id");
