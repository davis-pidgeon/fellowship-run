# The Fellowship's Run — Design Spec

**Date:** 2026-07-02
**Status:** Approved design, ready for implementation planning

## Summary

A private, invite-only web app where a small group of friends' real running
miles — auto-imported from Strava — move them along the ~1,779-mile Hobbiton →
Mount Doom route on a film-style illustrated map. Each person races as their own
character marker *and* pools miles into a shared Fellowship total. There is no
deadline; it is an ongoing quest. Passing landmarks (Rivendell, Moria, etc.)
triggers themed celebrations.

The app exists to keep the group consistent and motivated in their running.

## Core Decisions

| Decision | Choice |
|---|---|
| Journey model | **Hybrid** — individual racing markers + pooled Fellowship total |
| Strava integration | **One-tap import** — tap "Sync" to pull recent runs on demand (OAuth + serverless token exchange). No always-on server. |
| Landmarks | **Big milestone moments** — badge + themed message + lore when passing |
| Map style | **Film-style illustrated background image** (Option A), sourced legally |
| Journey scale | **Long-haul, no deadline** — full ~1,779 mi, pooled; the Aug 28 half is a checkpoint |
| Group scope | **Invite-link based** — private, join via shareable invite token |
| Characters | Each person picks a Fellowship archetype as their marker + avatar |
| Dashboard | **Me / Fellowship toggle**; headline shows both %s side by side |

## Core Experience

1. **Log in with Strava.** Strava OAuth is the only login. A valid invite token
   is required for a first-time user to join the Fellowship.
2. **Pick your character** (Frodo/hobbit, Sam, Aragorn/ranger-king, Legolas/elf
   archer, Gimli/dwarf, Gandalf/grey wizard, Boromir, etc.).
3. **Tap Sync.** New runs import from Strava, totals update, the map animates.
4. **The map** shows every runner's marker racing down the same road, a red
   trail for the pooled Fellowship progress, illustrated landmarks, and a glowing
   Mount Doom at the finish.
5. **The stats panel** shows both your % and the Fellowship % side by side, with
   a **Me / Fellowship toggle** that switches the detail view (your next
   landmark & rank, or the group's next landmark & pooled progress).
6. **Passing a landmark** fires a celebration modal: a themed badge, a message
   ("You've reached Rivendell!"), and a bit of lore. Both personal and
   Fellowship-level crossings can trigger these.

## Architecture

The "one-tap import" model — runs on free tiers at ~$0/month, no always-on
server to maintain.

- **Frontend:** React + Vite single-page app (TypeScript), deployed on Vercel
  free tier. Mobile-first (this is opened on phones).
- **Map rendering:** Leaflet using the illustrated map as a static image layer
  (`L.CRS.Simple` + `L.imageOverlay`), so markers and the route are placed in
  image pixel coordinates and the map pans/zooms on mobile.
- **Serverless functions** (Vercel functions):
  - `strava/callback` — OAuth authorization-code → token exchange (holds the
    Strava client secret, which cannot live in the browser).
  - `sync` — refresh token if expired → fetch new activities → filter runs →
    dedupe → store → recompute totals → detect crossed landmarks → return badges.
  - `invite` — validate an invite token and join the Fellowship.
- **Database:** Supabase (Postgres, free tier).
- **Identity/sessions:** Strava OAuth is the login. First login + valid invite
  creates the user and joins the Fellowship. Session is a signed cookie issued
  by our callback function.

## The Route Model

The route is a config file: an ordered list of **waypoints**, each with:

- `name`
- `x`, `y` — pixel coordinates on the map image asset
- `cumulativeMiles` — real-journey miles from Hobbiton to this waypoint
- `isLandmark` — whether it triggers a milestone celebration
- `message` / `lore` — celebration copy for landmarks

Given any runner's total miles, the app finds the surrounding segment and
linearly interpolates the exact pixel position between waypoints. Landmark
`cumulativeMiles` thresholds drive celebrations.

**Approximate landmark mileages** (based on the widely-used "Eowyn Challenge /
Walk to Mordor" distance dataset — to be refined and expanded with intermediate
waypoints during implementation):

| Landmark | Cumulative miles |
|---|---|
| The Shire (Hobbiton / Bag End) | 0 |
| Rivendell | ~458 |
| Mines of Moria (crossing) | ~800 |
| Lothlórien | ~920 |
| Rauros Falls | ~1,309 |
| Minas Tirith / Gondor | ~1,500 |
| The Black Gate / Cirith Ungol | ~1,650 |
| Mount Doom | ~1,779 |

Total route ≈ **1,779 miles**.

## Data Model

- **fellowship** — `id`, `name`, `invite_token`, `created_at`
- **users** — `id`, `strava_athlete_id` (unique), `display_name`, `avatar_url`,
  `chosen_character`, `fellowship_id`, `strava_access_token` (encrypted),
  `strava_refresh_token` (encrypted), `token_expires_at`, `last_sync_at`,
  `total_miles` (cached)
- **activities** — `id`, `user_id`, `strava_activity_id` (unique → dedupe),
  `distance_miles`, `run_date`, `name`, `imported_at`
- **milestone_awards** — `id`, `scope` (`'user'` | `'fellowship'`), `user_id`
  (nullable for fellowship-scope), `landmark_id`, `achieved_at`. Unique on
  (`scope`, `user_id`, `landmark_id`) so each milestone fires exactly once.

Progress is derived from the sum of a user's `activities.distance_miles`; the
Fellowship total is the sum across all users. `users.total_miles` caches the
per-user sum for fast rendering.

## Strava Sync Flow

On tapping Sync:

1. Refresh the access token if `token_expires_at` has passed.
2. Fetch activities from Strava since `last_sync_at` (using the `after`
   parameter), paginated.
3. Keep **runs only** (filter by activity type).
4. Convert distance from meters → miles.
5. Insert new activities; the `strava_activity_id` unique constraint silently
   dedupes re-fetched ones.
6. Recompute the user's total and the Fellowship total.
7. Compare old vs. new cumulative miles to detect **landmarks crossed** this
   sync (handles multiple landmarks crossed in one sync and exact-threshold
   hits). Create `milestone_awards` idempotently.
8. Return any newly earned badges to the client for the celebration modal.

## Error Handling & Edge Cases

- **Expired token** → auto-refresh. If the refresh fails (user revoked access)
  → show a "Reconnect Strava" prompt.
- **Strava rate limits** → on-demand + paginated + graceful back-off; surface a
  friendly "try again shortly" message if throttled.
- **Duplicate runs** → DB unique constraint on `strava_activity_id`.
- **Brand-new user** → positioned at the Shire (0 mi).
- **Invalid / expired invite** → friendly error screen.
- **Known v1 limitation:** if a user edits or deletes a Strava activity *after*
  import, the app keeps the imported snapshot (no reconciliation in v1).

## Testing

- **Unit:** miles → pixel interpolation; landmark-crossing detection (including
  two landmarks in one sync and exact-threshold hits); meters → miles
  conversion; dedupe logic.
- **Integration:** OAuth callback; sync against mocked Strava API responses;
  invite-join flow.
- **Manual:** map pan/zoom on a phone; celebration modal; character selection.

## Scope Guardrails (YAGNI)

**In v1:** one Fellowship, runs-only, on-demand sync, character markers,
milestone celebrations, invite links, Me/Fellowship toggle.

**Out of v1 (possible later):** auto-sync via Strava webhooks, comments/social
feed, push notifications, activity-edit reconciliation, multiple simultaneous
quests, walking/cycling support.

## Assets Note

The illustrated map and character art are **produced outside this app** —
AI-generated in a cinematic fantasy style, commissioned, or Creative-Commons
licensed — and integrated into the app. The build code places the route,
positions markers, and animates landmarks around whatever image assets are
supplied.

**Legal note:** This is a private, non-commercial app for a small group of
friends and is not distributed publicly. The official Tolkien/film maps and
character designs are copyrighted; to stay clean we use *original* art generated
or commissioned in a similar aesthetic rather than the studio's actual assets.
"Non-commercial" does not by itself make copyrighted material legal to use — it
only limits damages — so original, generated, or licensed art is the
responsible path.

---

## Appendix A — Asset Generation Prompts

Paste these into an image generator (ChatGPT/DALL·E, Gemini, or Midjourney).
They are written to produce **original cinematic-fantasy art** — not copies of
the films — which is both the legally-clean choice and what these tools do best.
Adjust names/details to taste.

### A1. Map background (the centerpiece)

> A hand-painted high-fantasy world map on aged parchment, cinematic and highly
> detailed, in the style of an epic adventure film's opening map. A long winding
> journey path crosses the map from a lush green rolling-hills homeland region
> in the northwest to a dark volcanic wasteland with a smoking mountain in the
> southeast. Along the way: misty snow-capped mountain ranges, dense forests, a
> deep river, an elven valley, a golden woodland, a great white walled city, and
> a shadowy fortress. Ornate decorative border, a compass rose, subtle ink
> lettering placeholders for region names, soft aged texture, warm sepia and
> muted green/blue tones. Top-down cartographic view, no modern elements, no
> text logos. Ultra-detailed, 4K, wide landscape orientation.

Tips: generate at the highest resolution available and in landscape; ask for a
version "with no labels" so the app can place its own landmark text cleanly.

### A2. Character markers (reusable template)

Generate each as a **circular portrait icon on a transparent or plain
background** so it drops onto the map as a marker. Base template:

> A circular character portrait icon, painted cinematic fantasy style, bust
> framing, facing forward, clean plain background, subtle golden ring border,
> consistent art style across a set. [CHARACTER DESCRIPTION]. High detail,
> centered, suitable as a game map marker.

Swap `[CHARACTER DESCRIPTION]` per person (original archetypes, not film
likenesses):

- **Hobbit adventurer** — "a young hobbit with curly hair, a green travel cloak,
  determined expression"
- **Loyal gardener companion** — "a sturdy hobbit with sandy hair, a brown cloak
  and a cooking pot, kind face"
- **Ranger king** — "a rugged human ranger with dark hair, weathered cloak, a
  noble bearing"
- **Elf archer** — "a fair-haired elf with a longbow and quiver, elegant green
  and silver garb"
- **Dwarf warrior** — "a stout red-bearded dwarf in armor with a battle axe,
  fierce grin"
- **Grey wizard** — "an old wizard with a long grey beard, wide-brimmed grey hat
  and staff, wise eyes"
- **Warrior of the white city** — "a tall human warrior with a horn and a shield
  bearing a white tree emblem"

Ask for "the same art style and framing" each time so the set looks cohesive.

### A3. Landmark milestone badges

> A set of ornate circular achievement badges in painted fantasy style, gold and
> jewel-tone, each with a decorative border, on a plain background: [1] an elven
> valley waterfall, [2] a dark mine gate in a mountain, [3] a golden forest, [4]
> a great waterfall, [5] a white walled city, [6] a dark fortress gate, [7] a
> smoking volcano. Consistent style, celebratory, suitable as reward badges.

### A4. Mount Doom finish / celebration art (optional)

> A dramatic painted fantasy illustration of a lone smoking volcanic mountain
> under a red-and-black stormy sky, glowing lava, epic cinematic lighting,
> celebratory "journey complete" mood, no text. Vertical or square framing for a
> full-screen victory modal.

### A5. Character selection screen art (optional)

> A row of painted fantasy hero portraits in consistent cinematic style,
> full-body, neutral standing poses, on a subtle parchment background, evenly
> spaced, suitable for a character-select screen. [reuse the character
> descriptions from A2].

**Delivery:** hand me the resulting image files (PNG; transparent background for
markers/badges where possible) and note which file is which. The app config
maps each character key to its marker image and each landmark to its badge.
