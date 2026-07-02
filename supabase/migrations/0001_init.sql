create extension if not exists "pgcrypto";

create table fellowship (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_token text not null unique,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  strava_athlete_id bigint not null unique,
  display_name text not null,
  avatar_url text,
  chosen_character text,
  fellowship_id uuid not null references fellowship(id) on delete cascade,
  strava_access_token text not null,
  strava_refresh_token text not null,
  token_expires_at timestamptz not null,
  last_sync_at timestamptz,
  total_miles double precision not null default 0,
  created_at timestamptz not null default now()
);

create table activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  strava_activity_id bigint not null unique,
  distance_miles double precision not null,
  run_date timestamptz not null,
  name text not null,
  imported_at timestamptz not null default now()
);

create table milestone_awards (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('user', 'fellowship')),
  user_id uuid references users(id) on delete cascade,
  fellowship_id uuid not null references fellowship(id) on delete cascade,
  landmark_id text not null,
  achieved_at timestamptz not null default now(),
  unique (scope, user_id, landmark_id)
);

create index activities_user_idx on activities(user_id);
create index users_fellowship_idx on users(fellowship_id);
