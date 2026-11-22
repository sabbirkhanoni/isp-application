-- Phase 13: per-user extra permissions (on top of the role).
ALTER TABLE users ADD COLUMN extra_permissions text[] NOT NULL DEFAULT '{}';
