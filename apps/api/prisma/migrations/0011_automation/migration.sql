-- Phase 16: bulk SMS (owner-written messages to a chosen group of customers).
ALTER TYPE "sms_type" ADD VALUE IF NOT EXISTS 'BULK';
