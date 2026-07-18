-- supabase/migrations/0003_drop_legacy_fellowship_columns.sql
-- Run this ONLY after the new application code (which reads fellowship_members
-- and computes mileage live) is deployed and confirmed working. Until then,
-- the old code path still depends on these two columns.
alter table users drop column fellowship_id;
alter table users drop column total_miles;
