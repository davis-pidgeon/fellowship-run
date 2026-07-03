# The Fellowship's Run

A private, invite-only web app that turns your group's Strava running miles into
a pixel-art journey from the Shire to Mount Doom.

## Setup
1. `npm install`
2. Create a Supabase project; run `supabase/migrations/0001_init.sql` in its SQL editor.
3. Create a Strava API app (https://www.strava.com/settings/api). Set the
   Authorization Callback Domain to your deploy domain (and `localhost` for dev).
4. Copy `.env.example` to `.env` and fill in every value. Generate
   `TOKEN_ENCRYPTION_KEY` with `openssl rand -hex 32` and `SESSION_SECRET` with
   `openssl rand -base64 32`.
5. `npm run dev` for local development.

## Deploy (Vercel)
1. Import the repo into Vercel.
2. Add every variable from `.env.example` in Project Settings → Environment Variables.
3. Deploy. `vercel.json` routes `/api/*` to serverless functions and everything
   else to the SPA.

## Bootstrapping the group
Sign in yourself once, then `POST /api/invite` with `{ "name": "The Fellowship" }`
to mint an invite token. Share `https://<domain>/join?token=<inviteToken>` with
your friends.

## Database

Create a Supabase project, then run `supabase/migrations/0001_init.sql` in the
Supabase SQL editor (or `supabase db push` with the CLI). Copy the project URL
and service-role key into `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.

## Tests
`npm test` runs the Vitest suite (pure logic, API helpers, and components).

## Art assets
The map, character sprites, and celebration scenes are 16-bit pixel art supplied
separately (see the design spec's Appendix A for generation prompts). Drop map
art at `src/assets/placeholder-map.png` and sprites under `public/sprites/`.
