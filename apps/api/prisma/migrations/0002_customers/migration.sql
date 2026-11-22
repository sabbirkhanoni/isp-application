-- 0002_customers: packages, customers, subscriptions, leads

CREATE TYPE "connection_type" AS ENUM ('PPPOE', 'DHCP', 'STATIC', 'HOTSPOT');
CREATE TYPE "activation_policy" AS ENUM ('ACTIVATE_NOW', 'AFTER_FIRST_PAYMENT', 'MANUAL');
CREATE TYPE "customer_status" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED', 'TERMINATED');
CREATE TYPE "lead_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "packages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "speed_mbps" INTEGER NOT NULL,
    "monthly_price_poisha" BIGINT NOT NULL,
    "ppp_profile" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "packages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "packages_speed_check" CHECK ("speed_mbps" > 0),
    CONSTRAINT "packages_price_check" CHECK ("monthly_price_poisha" >= 0)
);
CREATE UNIQUE INDEX "packages_name_key" ON "packages"("name");

CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_code" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "alt_phone" TEXT,
    "address" TEXT NOT NULL,
    "area" TEXT,
    "note" TEXT,
    "status" "customer_status" NOT NULL DEFAULT 'PENDING_ACTIVATION',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);
-- Customer IDs are unique ignoring case ("Acme-01" and "ACME-01" are the same customer).
CREATE UNIQUE INDEX "customers_customer_code_lower_key" ON "customers"(lower("customer_code"));
CREATE INDEX "customers_phone_idx" ON "customers"("phone");
CREATE INDEX "customers_status_idx" ON "customers"("status");

CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "connection_type" "connection_type" NOT NULL,
    "pppoe_username" TEXT,
    "router_id" UUID,
    "activation_policy" "activation_policy" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscriptions_pppoe_check" CHECK ("connection_type" <> 'PPPOE' OR "pppoe_username" IS NOT NULL)
);
CREATE UNIQUE INDEX "subscriptions_customer_id_key" ON "subscriptions"("customer_id");
CREATE INDEX "subscriptions_package_id_idx" ON "subscriptions"("package_id");
CREATE UNIQUE INDEX "subscriptions_pppoe_username_lower_key"
    ON "subscriptions"(lower("pppoe_username")) WHERE "pppoe_username" IS NOT NULL;

CREATE TABLE "leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "full_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "area" TEXT,
    "requested_package_id" UUID,
    "connection_type" "connection_type" NOT NULL DEFAULT 'PPPOE',
    "note" TEXT,
    "status" "lead_status" NOT NULL DEFAULT 'PENDING',
    "reject_reason" TEXT,
    "created_by" UUID NOT NULL,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "customer_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "leads_customer_id_key" ON "leads"("customer_id");
CREATE INDEX "leads_status_created_at_idx" ON "leads"("status", "created_at");
CREATE INDEX "leads_created_by_idx" ON "leads"("created_by");

ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_package_id_fkey"
    FOREIGN KEY ("package_id") REFERENCES "packages"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_requested_package_id_fkey"
    FOREIGN KEY ("requested_package_id") REFERENCES "packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_reviewed_by_fkey"
    FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Source of generated customer codes (only used when no existing code is supplied).
CREATE SEQUENCE "customer_code_seq" START 1;
