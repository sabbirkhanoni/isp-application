-- 0005_network: routers, suspension state and the router job queue

CREATE TYPE "router_driver" AS ENUM ('REST', 'AGENT');
CREATE TYPE "network_job_status" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');
CREATE TYPE "suspend_reason" AS ENUM ('NON_PAYMENT', 'MANUAL');

CREATE TABLE "routers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "driver" "router_driver" NOT NULL,
    "host" TEXT,
    "port" INTEGER NOT NULL DEFAULT 443,
    "use_tls" BOOLEAN NOT NULL DEFAULT true,
    "allow_self_signed" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT,
    "password_enc" TEXT,
    "agent_token_hash" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "routers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "routers_name_key" ON "routers" (lower("name"));

ALTER TABLE "subscriptions"
    ADD CONSTRAINT "subscriptions_router_id_fkey" FOREIGN KEY ("router_id") REFERENCES "routers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "subscriptions_router_id_idx" ON "subscriptions" ("router_id");

ALTER TABLE "customers"
    ADD COLUMN "suspend_reason" "suspend_reason",
    ADD COLUMN "suspended_at" TIMESTAMPTZ(6);

-- A job means "make the router match this customer's current status". The status is read when the
-- job runs, so a stale job can never apply an outdated decision.
CREATE TABLE "network_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "router_id" UUID NOT NULL,
    "status" "network_job_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "run_after" TIMESTAMPTZ(6),
    "claimed_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "applied_state" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "network_jobs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "network_jobs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "network_jobs_router_id_fkey" FOREIGN KEY ("router_id") REFERENCES "routers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- At most one waiting job per customer: repeated changes collapse into one.
CREATE UNIQUE INDEX "network_jobs_one_pending_per_customer" ON "network_jobs" ("customer_id") WHERE "status" = 'PENDING';
CREATE INDEX "network_jobs_status_idx" ON "network_jobs" ("status", "created_at");
CREATE INDEX "network_jobs_router_idx" ON "network_jobs" ("router_id", "status");
