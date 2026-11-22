-- 0008_finance: expenses, termination date (for churn), monthly report log

ALTER TABLE "customers" ADD COLUMN "terminated_at" TIMESTAMPTZ(6);
-- Customers already terminated before this migration have no date; use their last change as best guess.
UPDATE "customers" SET "terminated_at" = "updated_at" WHERE "status" = 'TERMINATED';

CREATE TABLE "expenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "spent_on" DATE NOT NULL,
    "category" TEXT NOT NULL,
    "amount_poisha" BIGINT NOT NULL,
    "payee" TEXT,
    "note" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "expenses_amount_positive" CHECK ("amount_poisha" > 0),
    CONSTRAINT "expenses_category_valid" CHECK ("category" IN
      ('SALARY','BANDWIDTH','RENT','ELECTRICITY','EQUIPMENT','TRANSPORT','OTHER')),
    CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id")
);
CREATE INDEX "expenses_spent_on_idx" ON "expenses" ("spent_on");

-- One row per month whose summary SMS went to the owner, so a restart never sends it twice.
CREATE TABLE "report_runs" (
    "period" TEXT NOT NULL,
    "sent_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "report_runs_pkey" PRIMARY KEY ("period")
);
