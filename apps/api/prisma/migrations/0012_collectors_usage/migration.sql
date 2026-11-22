-- Phase 17: assigned collectors with monthly targets, and per-customer traffic usage.
ALTER TABLE customers ADD COLUMN collector_id uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX customers_collector_id_idx ON customers (collector_id);

CREATE TABLE collection_targets (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period date NOT NULL,
  target_poisha bigint NOT NULL CHECK (target_poisha > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, period)
);

-- Last byte counters seen for the current session, so the next poll can add only the difference.
ALTER TABLE line_status ADD COLUMN rx_bytes bigint, ADD COLUMN tx_bytes bigint;

CREATE TABLE usage_daily (
  router_id uuid NOT NULL REFERENCES routers(id) ON DELETE CASCADE,
  pppoe_username text NOT NULL,
  day date NOT NULL,
  download_bytes bigint NOT NULL DEFAULT 0,
  upload_bytes bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (router_id, pppoe_username, day)
);
CREATE INDEX usage_daily_day_idx ON usage_daily (day);
