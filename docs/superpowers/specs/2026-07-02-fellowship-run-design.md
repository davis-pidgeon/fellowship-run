# The Fellowship's Run — Design Spec

**Date:** 2026-07-02
**Status:** Approved design, ready for implementation planning

## Summary

A private, invite-only web app where a small group of friends' real running
miles — auto-imported from Strava — move them along the ~1,779-mile Hobbiton →
Mount Doom route on a **16-bit pixel-art** map. Each person races as their own
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
| Map style | **16-bit pixel-art** top-down map; side-scroll pixel scenes for celebrations |
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
4. **The map** is a top-down 16-bit pixel-art world (rolling green hills,
   pixel forests, rivers, mountain ranges, a volcanic Mount Doom). It shows
   every runner's pixel-sprite marker racing down the same road, a highlighted
   trail for the pooled Fellowship progress, pixel-art landmarks, and Mount Doom
   at the finish.
5. **The stats panel** shows both your % and the Fellowship % side by side, with
   a **Me / Fellowship toggle** that switches the detail view (your next
   landmark & rank, or the group's next landmark & pooled progress).
6. **Passing a landmark** fires a celebration modal built around a **side-scroll
   pixel-art scene** of that place (e.g. the fellowship crossing a bridge past an
   elven city), plus a themed badge, a message ("You've reached Rivendell!"), and
   a bit of lore. Both personal and Fellowship-level crossings can trigger these.

## Architecture

The "one-tap import" model — runs on free tiers at ~$0/month, no always-on
server to maintain.

- **Frontend:** React + Vite single-page app (TypeScript), deployed on Vercel
  free tier. Mobile-first (this is opened on phones).
- **Map rendering:** Leaflet using the pixel-art map as a static image layer
  (`L.CRS.Simple` + `L.imageOverlay`), so markers and the route are placed in
  image pixel coordinates and the map pans/zooms on mobile. Apply
  `image-rendering: pixelated` (and integer/nearest-neighbor scaling) so the
  pixel art stays crisp when zoomed rather than blurring. Character markers are
  small pixel sprites; consider a 2-frame idle/bob animation for life.
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

**Art style: 16-bit pixel art** — a top-down pixel-art world map (rolling hills,
pixel forests, rivers, mountains, a volcanic Mount Doom) for the dashboard, and
side-scroll pixel-art scenes for landmark celebrations and the character-select
screen. Character markers are small pixel sprites.

All art is **produced outside this app** — AI-generated, commissioned, or
Creative-Commons licensed — and integrated by the build code, which places the
route, positions sprite markers, and animates landmarks around whatever assets
are supplied.

**Legal note:** This is a private, non-commercial app for a small group of
friends, not distributed publicly. We use *original* pixel art in a
high-fantasy aesthetic rather than any studio's copyrighted maps or character
designs. Original stylized pixel art keeps the project cleanly clear of the
copyrighted source material.

---

## Appendix A — Asset Generation Prompts (Pixel Art)

Paste these into an image generator (ChatGPT/DALL·E, Gemini, or Midjourney).
They target an **original 16-bit pixel-art high-fantasy style** — matching the
reference look (top-down world map + side-scroll scenes) — which is both the
legally-clean choice and a cohesive, distinctive aesthetic. Adjust to taste.

**Style keywords to reuse across every prompt** (keeps the set cohesive):
> 16-bit pixel art, retro SNES/JRPG style, limited muted palette, clean crisp
> pixels, no anti-aliasing, no text, no watermark.

### A1. Top-down world map (the centerpiece)

> A top-down 16-bit pixel-art fantasy world map, retro SNES JRPG overworld
> style. A long winding path crosses from a lush green rolling-hills homeland in
> the northwest to a dark volcanic wasteland with a smoking mountain in the
> southeast. Along the way: pixel forests of pine trees, a winding blue river,
> grey pixel mountain ranges, an elven valley, a golden-leaf woodland, a white
> walled city, and a shadowy fortress. Muted natural palette (greens, blues,
> earthy browns), clean crisp pixels, no anti-aliasing, no text labels,
> no watermark. Tall/portrait or wide orientation, high resolution.

Tips: request **no text labels** so the app places its own; generate large so it
holds up when zoomed. A tall vertical map (like the reference) suits a phone.

### A2. Character sprite markers (reusable template)

Generate each as a **small pixel-art character sprite on a transparent
background**, so it drops onto the map as a marker. Base template:

> A single 16-bit pixel-art character sprite, retro JRPG style, full body,
> front-facing, standing, on a transparent background, clean crisp pixels, no
> anti-aliasing, small game-marker size, no text. [CHARACTER DESCRIPTION].

Swap `[CHARACTER DESCRIPTION]` per person (original archetypes, not film
likenesses):

- **Hobbit adventurer** — "a young barefoot hobbit with curly brown hair and a
  green travelling cloak"
- **Loyal gardener companion** — "a sturdy sandy-haired hobbit with a brown
  cloak and a small pack"
- **Ranger king** — "a rugged human ranger with dark hair, a weathered grey
  cloak and a sword"
- **Elf archer** — "a fair-haired elf in green and silver with a longbow and
  quiver"
- **Dwarf warrior** — "a stout red-bearded dwarf in armor with a battle axe"
- **Grey wizard** — "an old wizard with a long grey beard, a wide grey hat and a
  wooden staff"
- **Warrior of the white city** — "a tall human warrior in silver armor with a
  horn"

Ask for "the same sprite size, style, and framing" each time so the party looks
cohesive. Optional: request a **2-frame idle animation** (or a small sprite
sheet) so markers gently bob on the map.

### A3. Landmark celebration scenes (side-scroll)

One per landmark, matching the reference side-scroll style:

> A 16-bit pixel-art side-scroll landscape scene, retro JRPG style, atmospheric
> lighting, muted palette, clean crisp pixels, no text, no watermark. Scene:
> [SCENE]. Wide/landscape framing suitable for a full-screen celebration banner.

Swap `[SCENE]` per landmark:

- **Rivendell** — "an elven city of graceful buildings among misty cliffs and
  waterfalls, golden autumn trees, a stone bridge, warm sunrise light"
- **Moria** — "a huge dark stone gate set into a mountainside beside a still
  black lake, torchlight"
- **Lothlórien** — "a glowing golden forest of tall silver-trunked trees with
  soft light"
- **Rauros Falls** — "a colossal waterfall over a great river with two tall
  stone statues flanking it"
- **Minas Tirith** — "a white multi-tiered mountain city gleaming at dawn"
- **The Black Gate** — "a massive iron gate before a dark ashen wasteland,
  ominous red sky"
- **Mount Doom** — "a lone smoking volcano with glowing lava cracks under a
  red-and-black stormy sky"

### A4. Landmark badges (optional, pixel style)

> A set of small 16-bit pixel-art achievement badge icons, circular, clean crisp
> pixels, transparent background, no text: an elven waterfall, a dark mine gate,
> a golden forest, a great waterfall, a white city, a dark fortress gate, a
> smoking volcano. Consistent pixel style, celebratory.

### A5. Character-select screen backdrop (optional)

> A 16-bit pixel-art side-scroll scene of a party of fantasy heroes standing on
> a stone bridge before a misty elven city with golden autumn trees, retro JRPG
> style, muted warm palette, clean crisp pixels, no text — used as a
> character-select background.

**Delivery:** hand me the resulting image files (PNG; **transparent background**
for sprites/badges). Note which file is which. The app config maps each
character key to its sprite, and each landmark to its scene + badge.
