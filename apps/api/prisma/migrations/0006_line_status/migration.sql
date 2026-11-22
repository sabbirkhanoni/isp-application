-- 0006_line_status: last known PPPoE session state per router login, refreshed by the poller / agent
CREATE TABLE "line_status" (
    "router_id" UUID NOT NULL,
    "pppoe_username" TEXT NOT NULL,
    "online" BOOLEAN NOT NULL,
    "address" TEXT,
    "caller_id" TEXT,
    "session_started_at" TIMESTAMPTZ(6),
    "last_online_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "line_status_pkey" PRIMARY KEY ("router_id", "pppoe_username"),
    CONSTRAINT "line_status_router_id_fkey" FOREIGN KEY ("router_id") REFERENCES "routers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
