# Multiple Fellowships — Design Spec

**Date:** 2026-07-18
**Status:** Approved design, ready for implementation planning

## Summary

Today the app supports exactly one Fellowship: every user has a single
`fellowship_id`, one global Strava app, one global journey start date, and
one global allowed-activity filter (foot travel only). This adds support for
**multiple, independently-configured Fellowships**:

- A person can belong to multiple Fellowships at once (minimum one).
- Each Fellowship has its own start date, its own allowed Strava activity
  types (e.g. running-only vs. run+walk vs. cycling-only), and its own Strava
  API application (client ID/secret) — the last of these exists specifically
  to work around Strava's ~10-athlete cap per unapproved API application, by
  spreading the group across multiple registered apps.
- A new **admin screen**, visible only to the app owner, lets them create
  Fellowships and decide who belongs to which.
- The dashboard gains a **Fellowship switcher** (for people in more than one)
  and a **Global view** — everyone, across every Fellowship, shown as
  semi-transparent "ghost" markers on the shared map.

## Core Decisions

| Decision | Choice |
|---|---|
| Membership | Many-to-many — a user has ≥1 Fellowship, via a join table |
| Mileage scope | Per-Fellowship — miles count from that Fellowship's own `start_date`, not a global one |
| Mileage calculation | Computed live on read (`sum(activities)` filtered by date + type), no cached total |
| Admin access | `is_admin` boolean on the user's own row, set manually in the DB |
| Admin scope (v1) | Create/edit Fellowships (name, start date, activity types, Strava app); assign/remove members |
| New-member join | Unchanged invite-link flow, now surfaced per-Fellowship |
| Existing-member join | Admin adds them to another Fellowship directly — no new invite link |
| Global view access | Every logged-in user, not admin-only |
| Global view identity | One ghost marker **per Fellowship membership** — someone in 2 Fellowships shows twice |
| Activity types | Configurable per Fellowship from Strava's type list (Run, Trail Run, Virtual Run, Walk, Hike, Ride, Virtual Ride) |
| Strava API app | Configurable per Fellowship (client ID + secret); a user's token pair is permanently tied to whichever app they first authorized through |

## Data Model

### `fellowship` (extended)

Adds:
- `start_date date not null default '2026-07-01'`
- `allowed_activity_types text[] not null default '{Run,TrailRun,VirtualRun,Walk,Hike}'`
- `strava_client_id text not null`
- `strava_client_secret text not null` (encrypted, same scheme as user tokens)

### `fellowship_members` (new — replaces `users.fellowship_id`)

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null references users(id) on delete cascade`
- `fellowship_id uuid not null references fellowship(id) on delete cascade`
- `joined_at timestamptz not null default now()`
- `unique (user_id, fellowship_id)`

A user must have ≥1 row here at all times; enforced at the application layer
(the admin "remove member" action rejects removing someone's last
membership), not a DB constraint.

### `users` (changed)

- **Remove** `fellowship_id` (replaced by `fellowship_members`).
- **Remove** `total_miles` (cached total — replaced by live per-Fellowship
  computation; see below).
- **Add** `is_admin boolean not null default false`.
- **Add** `strava_client_id text not null` and `strava_client_secret text not
  null` (encrypted) — copied from whichever Fellowship's invite the user
  first joined through, at account-creation time. This is the app their
  Strava OAuth token pair belongs to, and it never changes afterward,
  regardless of which other Fellowships they're later added to.

### `activities` (changed)

- **Add** `sport_type text not null` — Strava's activity type (`Run`,
  `Ride`, `Hike`, etc.), previously fetched but discarded. Needed so
  per-Fellowship totals can filter by each Fellowship's allowed types.

### `milestone_awards` (bugfix)

- Fix the unique constraint from `(scope, user_id, landmark_id)` to
  `(scope, user_id, fellowship_id, landmark_id)`. The column already exists
  on this table but isn't part of the uniqueness check today — a latent bug
  that would silently drop a second Fellowship's landmark award for the same
  user/landmark once multi-Fellowship membership existed.

### Migration for the existing Fellowship

The current single `fellowship` row (and its members) must convert cleanly,
with **no visible change** for the current group:

1. Set its `start_date` to the current `JOURNEY_START_DATE` env value.
2. Set its `allowed_activity_types` to `{Run,TrailRun,VirtualRun,Walk,Hike}`
   (matches today's hardcoded `FOOT_TRAVEL_TYPES` filter).
3. Set its `strava_client_id`/`strava_client_secret` from the current
   `STRAVA_CLIENT_ID`/`STRAVA_CLIENT_SECRET` env values.
4. Insert one `fellowship_members` row per existing user.
5. Copy each existing user's Strava app credentials from the same env values
   onto their new `users.strava_client_id`/`strava_client_secret` columns.
6. Backfill `activities.sport_type` — not recoverable from stored data (type
   was never saved), so backfill as `'Run'` for all existing rows. This only
   affects historical filtering if the migrated Fellowship's
   `allowed_activity_types` were ever narrowed below what was originally
   imported; since it's set to the full existing foot-travel set in step 2,
   this is a safe default with no behavior change.
7. Drop `users.fellowship_id` and `users.total_miles` once the above is
   verified.

## Mileage & Milestone Computation

No cached totals anywhere. For a given Fellowship:

```
memberTotal(user, fellowship) =
  sum(activities.distance_miles)
  where activities.user_id = user.id
    and activities.sport_type = any(fellowship.allowed_activity_types)
    and activities.run_date >= fellowship.start_date
```

- **A user's position on that Fellowship's map** = `memberTotal(user, fellowship)`.
- **The Fellowship's pooled total** = sum of `memberTotal` across its members.
- **Personal milestone crossings** (Rivendell, etc.) are detected per
  Fellowship, by diffing `memberTotal` before/after a sync.
- **Fellowship-wide milestone crossings** are detected per Fellowship, by
  diffing the pooled total before/after a sync.
- Achievements, the Passport, and the leaderboard all read whichever
  Fellowship is currently selected — never a global/lifetime number.

## Strava Sync Flow (rewritten)

On tapping Sync, for the signed-in user:

1. Load all of the user's `fellowship_members` rows (with each Fellowship's
   `start_date` and `allowed_activity_types`).
2. Refresh the Strava access token if expired, using **the user's own**
   `strava_client_id`/`strava_client_secret` (not any Fellowship's).
3. Fetch floor = the **earliest** `start_date` across all the user's
   Fellowships.
4. Fetch activities from Strava since that floor, filtering to the **union**
   of `allowed_activity_types` across all the user's Fellowships. Store each
   activity's `sport_type`.
5. Insert new activities (existing `strava_activity_id` dedupe unchanged).
6. For each of the user's Fellowships: compute `memberTotal` before/after,
   detect personal landmark crossings, then compute the Fellowship's pooled
   total before/after and detect Fellowship-wide crossings. Upsert
   `milestone_awards` idempotently (now keyed correctly per Fellowship — see
   bugfix above).
7. Return all newly-earned badges from every Fellowship in one response,
   each tagged with its Fellowship name/id so the celebration modal can show
   which quest it belongs to.

## Admin Screen

New route `/admin`, server-side gated on `is_admin` (checked via session on
every admin API call — not just hidden client-side).

**Fellowships panel:**
- List: name, start date, member count, allowed activity types, invite link.
- Create: name, start date (defaults to 2026-07-01), allowed activity types
  (checklist), Strava client ID + secret.
- Edit: all of the above, post-creation.

**Members panel:**
- List of every user in the system and which Fellowship(s) they're in.
- Add any existing user to any Fellowship.
- Remove a user from a Fellowship — rejected with a clear error if it would
  leave them with zero Fellowships.

**New-member joining**, unchanged mechanism, now per-Fellowship: the
Fellowships panel's "Copy invite link" button is the entire flow for
onboarding someone brand new — they open the link, see "Join `<name>`"
(existing `Join.tsx`), authorize via that Fellowship's Strava app, and are
created with membership in that one Fellowship.

## Dashboard: Fellowship Switcher & Global View

- One Fellowship membership → dashboard behaves exactly as it does today.
- Multiple memberships → a switcher (defaulting to the earliest-joined
  Fellowship) lets the user pick which Fellowship's map/stats/leaderboard
  they're viewing.
- A **Global** option alongside the switcher shows every Fellowship
  membership in the system as a ghost marker (own semi-transparent, ~35–40%
  opacity sprite, positioned at that membership's `memberTotal`). Ghosts are
  non-interactive (no click/profile popover) and read-only — no pooled-
  Fellowship ring marker, no Sync button while in Global view.
- Achievements, Passport, and the leaderboard always reflect the currently
  selected Fellowship, never Global.

## Error Handling & Edge Cases

- **Reconnect Strava** (refresh token invalid) still needs the correct
  authorize URL — it must use the user's own stored `strava_client_id`, not
  any particular Fellowship's, since reconnecting isn't tied to joining
  anything.
- **Removing a user's last Fellowship membership** → rejected in the admin
  UI with an explicit error.
- **Brand-new Fellowship, no synced activity yet** → members start at the
  Shire (0 mi), same as today's brand-new-user case.
- **Multiple Fellowships cross landmarks in the same sync** → celebration
  modal shows all of them, each labeled with its Fellowship.
- **A Fellowship's allowed activity types change after activities were
  already imported** → no reconciliation needed; `memberTotal` is computed
  live, so it immediately reflects the new filter on next read.

## Testing

- **Unit:** per-Fellowship `memberTotal` aggregation (date floor + activity
  type filter together); earliest-start-date sync fetch floor across
  multiple Fellowships; two Fellowships independently crossing the same
  landmark in one sync (exercises the milestone unique-constraint fix);
  "last Fellowship" removal guard.
- **Integration:** admin create-Fellowship → invite-link → new-user OAuth
  join, using that Fellowship's Strava app credentials; existing-user
  add-to-Fellowship (no OAuth); sync across a user with 2+ Fellowships
  producing badges in both.
- **Manual:** admin screen end-to-end (create, edit, assign, remove-guard);
  Fellowship switcher on a phone; Global ghost rendering/opacity; the
  migration against a copy of production data, verifying no visible change
  for the current group.

## Scope Guardrails (YAGNI)

**In this pass:** many-to-many membership, per-Fellowship start date /
activity types / Strava app, admin Fellowship + membership management,
Fellowship switcher, Global ghost view.

**Out of scope:** Fellowship deletion, per-Fellowship character/color
choice (character stays one global choice per person, as today), any admin
tooling beyond Fellowship/membership management, non-admin ability to
create Fellowships, automating Strava app registration (still done by hand
on Strava's developer site).
