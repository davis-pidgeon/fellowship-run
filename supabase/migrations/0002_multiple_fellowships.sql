-- supabase/migrations/0002_multiple_fellowships.sql
begin;

alter table fellowship
  add column start_date date not null default '2026-07-01',
  add column allowed_activity_types text[] not null default '{Run,TrailRun,VirtualRun,Walk,Hike}',
  add column strava_client_id text,
  add column strava_client_secret text;

create table fellowship_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  fellowship_id uuid not null references fellowship(id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (user_id, fellowship_id)
);
create index fellowship_members_user_idx on fellowship_members(user_id);
create index fellowship_members_fellowship_idx on fellowship_members(fellowship_id);
alter table fellowship_members enable row level security;

-- Carry every existing single-fellowship membership into the new join table.
insert into fellowship_members (user_id, fellowship_id, joined_at)
select id, fellowship_id, created_at from users;

alter table users
  add column is_admin boolean not null default false,
  add column strava_client_id text,
  add column strava_client_secret text;

-- sport_type was never stored before this migration (the sync handler filtered
-- to foot-travel types and discarded the field). Every historical activity was
-- imported under that same foot-travel filter, so 'Run' is a safe backfill: it
-- only matters if a fellowship's allowed_activity_types is narrowed below the
-- full foot-travel set, which the migrated fellowship below is not.
alter table activities add column sport_type text not null default 'Run';

alter table milestone_awards drop constraint milestone_awards_scope_user_id_landmark_id_key;
alter table milestone_awards add constraint milestone_awards_scope_user_id_fellowship_id_landmark_id_key
  unique (scope, user_id, fellowship_id, landmark_id);

commit;

-- ── Manual follow-up ──────────────────────────────────────────────────────
-- Check your deployed JOURNEY_START_DATE env var (Vercel → Project Settings).
-- If it is anything other than 2026-07-01, run this so no one's progress
-- resets (start_date defaulted to 2026-07-01 above for every fellowship,
-- including the pre-existing one):
--
-- update fellowship set start_date = '<your JOURNEY_START_DATE value>'
--   where id = (select id from fellowship order by created_at limit 1);
--
-- Then make yourself admin (find your user id from the `users` table first):
--
-- update users set is_admin = true where id = '<your user id>';
