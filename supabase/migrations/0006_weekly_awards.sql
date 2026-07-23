-- supabase/migrations/0006_weekly_awards.sql
-- Locked weekly winners. Rows are written once by the finalize-weeks cron after
-- a week completes and are never updated (late backfills do not change history).
begin;

create table weekly_awards (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  scope text not null check (scope in ('global_pooled', 'global_percapita', 'member')),
  fellowship_id uuid not null references fellowship(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  metric_value double precision not null default 0,
  created_at timestamptz not null default now()
);

-- One member winner per fellowship per week.
create unique index weekly_awards_member_uniq
  on weekly_awards (week_start, fellowship_id)
  where scope = 'member';

-- Exactly one global winner per scope per week, regardless of fellowship.
create unique index weekly_awards_global_uniq
  on weekly_awards (week_start, scope)
  where scope in ('global_pooled', 'global_percapita');

create index weekly_awards_fellowship_idx on weekly_awards (fellowship_id);
create index weekly_awards_user_idx on weekly_awards (user_id);

alter table weekly_awards enable row level security;

commit;
