-- Phase "Free / VIP line": mosque, madrasa, office or family connections that are never billed or suspended.
ALTER TABLE customers ADD COLUMN is_free boolean NOT NULL DEFAULT false;
