-- supabase/migrations/0005_activity_multipliers.sql
-- Per-activity-type mileage multiplier for each fellowship, shaped { "Run": 2.5, "Ride": 0.1 }.
-- A type absent from the map (or an empty map) means multiplier 1.0, so existing
-- fellowships are unchanged.
alter table fellowship
  add column activity_multipliers jsonb not null default '{}'::jsonb;
