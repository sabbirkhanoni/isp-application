-- Phase "OLT": optical power of every ONU, read from the OLT over SNMP.
CREATE TABLE olts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  brand          text NOT NULL,
  host           text NOT NULL,
  snmp_port      integer NOT NULL DEFAULT 161,
  community_enc  text NOT NULL,
  rx_oid         text,
  id_oid         text,
  divisor        integer,
  is_active      boolean NOT NULL DEFAULT true,
  last_polled_at timestamptz,
  last_error     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX olts_name_lower_key ON olts (lower(name));

CREATE TABLE onu_signals (
  olt_id     uuid NOT NULL REFERENCES olts (id) ON DELETE CASCADE,
  onu_index  text NOT NULL,
  onu_key    text NOT NULL,
  rx_dbm     numeric(6,2) NOT NULL,
  alerted    boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (olt_id, onu_index)
);
CREATE INDEX onu_signals_key_idx ON onu_signals (onu_key);
CREATE INDEX onu_signals_rx_idx ON onu_signals (rx_dbm);
