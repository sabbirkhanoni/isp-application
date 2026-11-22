-- 0007_provisioning: PPPoE password for router provisioning, OLT/ONU details, router secret snapshot

ALTER TABLE "subscriptions"
    ADD COLUMN "pppoe_password_enc" TEXT,
    ADD COLUMN "pppoe_password_verified" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "olt_name" TEXT,
    ADD COLUMN "pon_port" TEXT,
    ADD COLUMN "onu_serial" TEXT;
CREATE INDEX "subscriptions_onu_serial_idx" ON "subscriptions" (lower("onu_serial"));

ALTER TABLE "routers" ADD COLUMN "secrets_synced_at" TIMESTAMPTZ(6);

-- What the router's PPP secret list looked like at the last refresh (used for the "compare" report).
CREATE TABLE "router_secrets" (
    "router_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "profile" TEXT,
    "disabled" BOOLEAN NOT NULL,
    CONSTRAINT "router_secrets_pkey" PRIMARY KEY ("router_id", "name"),
    CONSTRAINT "router_secrets_router_id_fkey" FOREIGN KEY ("router_id") REFERENCES "routers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
