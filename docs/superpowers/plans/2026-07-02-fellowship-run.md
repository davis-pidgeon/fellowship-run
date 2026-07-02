# The Fellowship's Run — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private, invite-only web app where friends' Strava running miles move pixel-art character markers along the ~1,779-mile Hobbiton → Mount Doom route, with per-runner racing, a pooled Fellowship total, and landmark milestone celebrations.

**Architecture:** A React + Vite single-page frontend renders a top-down 16-bit pixel-art map (Leaflet `CRS.Simple` image overlay). Vercel serverless functions handle Strava OAuth, on-demand run import, and invite joins, persisting to Supabase (Postgres). Pure business logic (miles→position interpolation, milestone detection, sync computation) lives in framework-free modules shared by client and server and is developed test-first.

**Tech Stack:** TypeScript, React 18, Vite, react-leaflet + Leaflet, Vercel serverless functions (Node), Supabase (`@supabase/supabase-js`), `jose` (session JWT), Node `crypto` (token encryption at rest), Vitest + @testing-library/react (tests).

## Global Constraints

- **Language:** TypeScript everywhere. `"strict": true` in `tsconfig.json`.
- **Node runtime:** serverless functions target Node 20 (`"engines": { "node": "20.x" }`).
- **Route total distance:** exactly `1779` miles (Hobbiton → Mount Doom).
- **Miles conversion factor:** 1 mile = `1609.344` meters. Never hardcode a rounded factor.
- **Activity filter:** only Strava activities with `type === "Run"` count.
- **Dedupe key:** `strava_activity_id` is globally unique; never insert a duplicate.
- **Milestone idempotency:** a milestone fires exactly once per `(scope, user_id, landmark_id)`.
- **Art style (copy/UX rule):** all art is 16-bit pixel art; map images render with `image-rendering: pixelated`. Art assets are supplied externally (see spec Appendix A) — this plan uses placeholder assets so the app runs without them.
- **Secrets:** `STRAVA_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY` are server-only and never shipped to the browser or committed. `.env*` is gitignored.
- **Environment variables (exact names):**
  - Server: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REDIRECT_URI`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY` (64 hex chars = 32 bytes).
  - Client (Vite, `VITE_` prefix): `VITE_STRAVA_CLIENT_ID`, `VITE_STRAVA_REDIRECT_URI`.
- **Commits:** conventional commits, one per task minimum.

---

## File Structure

```
/
├── package.json                     # scripts, deps, engines
├── tsconfig.json                    # strict TS, shared
├── tsconfig.node.json               # vite config typing
├── vite.config.ts                   # Vite + Vitest config
├── vercel.json                      # SPA rewrites + function config
├── .env.example                     # documents every env var
├── index.html
├── README.md                        # setup + deploy steps
├── supabase/
│   └── migrations/
│       └── 0001_init.sql            # tables: fellowship, users, activities, milestone_awards
├── shared/                          # framework-free, imported by client AND api
│   ├── types.ts                     # Waypoint, RunActivity, Position, Milestone, CharacterKey
│   ├── units.ts                     # metersToMiles
│   ├── route.ts                     # ROUTE waypoints + TOTAL_MILES
│   ├── characters.ts                # CHARACTERS list
│   ├── progress.ts                  # positionForMiles, percentComplete
│   ├── milestones.ts                # crossedLandmarks
│   └── sync-core.ts                 # computeSync (pure)
├── api/                             # Vercel serverless functions
│   ├── _lib/
│   │   ├── env.ts                   # typed server env access
│   │   ├── supabase.ts              # service-role client factory
│   │   ├── session.ts              # signSession / verifySession (JWT cookie)
│   │   ├── crypto.ts               # encrypt / decrypt (AES-256-GCM)
│   │   ├── strava.ts               # exchangeCode / refreshTokens / fetchRunsSince
│   │   └── http.ts                 # cookie + json helpers, readSession
│   ├── auth/
│   │   ├── strava-callback.ts
│   │   └── logout.ts
│   ├── me.ts
│   ├── invite.ts
│   └── sync.ts
├── src/                             # frontend
│   ├── main.tsx
│   ├── App.tsx                      # routing + session gate
│   ├── api-client.ts                # typed fetch wrappers to /api/*
│   ├── useSession.ts                # session/profile hook
│   ├── assets/
│   │   └── placeholder-map.png      # placeholder pixel map (real asset swapped later)
│   ├── components/
│   │   ├── MapView.tsx
│   │   ├── StatsPanel.tsx
│   │   └── CelebrationModal.tsx
│   └── pages/
│       ├── Login.tsx
│       ├── Join.tsx
│       ├── CharacterSelect.tsx
│       └── Dashboard.tsx
└── tests/                           # colocated *.test.ts also allowed; shared logic tested here
```

---

### Task 1: Project scaffold and tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `.env.example`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: working `npm run dev`, `npm run build`, `npm test`. Vitest configured with `environment: 'jsdom'` and globals enabled.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "fellowship-run",
  "private": true,
  "type": "module",
  "engines": { "node": "20.x" },
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "jose": "^5.9.0",
    "leaflet": "^1.9.4",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-leaflet": "^4.2.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.0",
    "@testing-library/react": "^16.0.0",
    "@types/leaflet": "^1.9.12",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^25.0.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "shared", "api", "tests"]
}
```

- [ ] **Step 3: Create `tsconfig.node.json` and `vite.config.ts`**

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
  },
});
```

- [ ] **Step 4: Create `index.html`, `src/main.tsx`, `src/App.tsx`, `tests/setup.ts`**

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
    <title>The Fellowship's Run</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/App.tsx`:
```tsx
export default function App() {
  return <div>The Fellowship's Run</div>;
}
```

`src/main.tsx`:
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

`tests/setup.ts`:
```ts
import "@testing-library/jest-dom";
```

- [ ] **Step 5: Create `.env.example`**

```bash
# Server-only secrets (set in Vercel project settings; never commit real values)
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_REDIRECT_URI=http://localhost:5173/api/auth/strava-callback
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SESSION_SECRET=
TOKEN_ENCRYPTION_KEY= # 64 hex characters (32 bytes)

# Client (exposed to browser via Vite)
VITE_STRAVA_CLIENT_ID=
VITE_STRAVA_REDIRECT_URI=http://localhost:5173/api/auth/strava-callback
```

- [ ] **Step 6: Write the smoke test**

`tests/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("runs tests", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 7: Install and verify**

Run: `npm install && npm test`
Expected: install succeeds; Vitest reports `1 passed`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TypeScript + Vitest"
```

---

### Task 2: Shared types and unit conversion

**Files:**
- Create: `shared/types.ts`, `shared/units.ts`
- Test: `shared/units.test.ts`

**Interfaces:**
- Produces:
  - `type CharacterKey = "frodo" | "sam" | "aragorn" | "legolas" | "gimli" | "gandalf" | "boromir"`
  - `interface Waypoint { name: string; x: number; y: number; cumulativeMiles: number; isLandmark: boolean; landmarkId?: string; message?: string; lore?: string }`
  - `interface RunActivity { stravaActivityId: number; distanceMiles: number; runDate: string; name: string }`
  - `interface Position { x: number; y: number; segmentIndex: number }`
  - `interface Milestone { landmarkId: string; name: string; message: string; lore: string; cumulativeMiles: number }`
  - `function metersToMiles(meters: number): number`

- [ ] **Step 1: Write the failing test**

`shared/units.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { metersToMiles } from "./units";

describe("metersToMiles", () => {
  it("converts a marathon (42195 m) to ~26.2187 miles", () => {
    expect(metersToMiles(42195)).toBeCloseTo(26.2187, 3);
  });
  it("returns 0 for 0 meters", () => {
    expect(metersToMiles(0)).toBe(0);
  });
  it("converts exactly one mile", () => {
    expect(metersToMiles(1609.344)).toBeCloseTo(1, 9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/units.test.ts`
Expected: FAIL — cannot find module `./units`.

- [ ] **Step 3: Create `shared/types.ts`**

```ts
export type CharacterKey =
  | "frodo" | "sam" | "aragorn" | "legolas" | "gimli" | "gandalf" | "boromir";

export interface Waypoint {
  name: string;
  x: number;
  y: number;
  cumulativeMiles: number;
  isLandmark: boolean;
  landmarkId?: string;
  message?: string;
  lore?: string;
}

export interface RunActivity {
  stravaActivityId: number;
  distanceMiles: number;
  runDate: string; // ISO 8601
  name: string;
}

export interface Position {
  x: number;
  y: number;
  segmentIndex: number;
}

export interface Milestone {
  landmarkId: string;
  name: string;
  message: string;
  lore: string;
  cumulativeMiles: number;
}
```

- [ ] **Step 4: Create `shared/units.ts`**

```ts
const METERS_PER_MILE = 1609.344;

export function metersToMiles(meters: number): number {
  return meters / METERS_PER_MILE;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run shared/units.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add shared/types.ts shared/units.ts shared/units.test.ts
git commit -m "feat: shared types and meters-to-miles conversion"
```

---

### Task 3: Route and character configuration

**Files:**
- Create: `shared/route.ts`, `shared/characters.ts`
- Test: `shared/route.test.ts`

**Interfaces:**
- Consumes: `Waypoint`, `CharacterKey` from `shared/types`.
- Produces:
  - `const ROUTE: Waypoint[]` (ordered by `cumulativeMiles`, first at 0, last = Mount Doom at 1779).
  - `const TOTAL_MILES: number` (= last waypoint's `cumulativeMiles` = 1779).
  - `interface CharacterDef { key: CharacterKey; name: string; sprite: string }` and `const CHARACTERS: CharacterDef[]`.

> Pixel coordinates below assume a 600×1200 portrait map image and are **placeholders** to be recalibrated against the real asset (edit only the `x`/`y` fields; mileages and IDs stay fixed). Lore strings are original short flavor text.

- [ ] **Step 1: Write the failing test**

`shared/route.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ROUTE, TOTAL_MILES } from "./route";

describe("ROUTE", () => {
  it("starts at the Shire at mile 0", () => {
    expect(ROUTE[0].cumulativeMiles).toBe(0);
    expect(ROUTE[0].landmarkId).toBe("shire");
  });
  it("ends at Mount Doom at 1779 miles", () => {
    const last = ROUTE[ROUTE.length - 1];
    expect(last.landmarkId).toBe("mount-doom");
    expect(last.cumulativeMiles).toBe(1779);
    expect(TOTAL_MILES).toBe(1779);
  });
  it("has strictly increasing cumulative miles", () => {
    for (let i = 1; i < ROUTE.length; i++) {
      expect(ROUTE[i].cumulativeMiles).toBeGreaterThan(ROUTE[i - 1].cumulativeMiles);
    }
  });
  it("gives every landmark a message and lore", () => {
    for (const w of ROUTE.filter((w) => w.isLandmark)) {
      expect(w.message && w.message.length).toBeTruthy();
      expect(w.lore && w.lore.length).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/route.test.ts`
Expected: FAIL — cannot find module `./route`.

- [ ] **Step 3: Create `shared/route.ts`**

```ts
import type { Waypoint } from "./types";

export const ROUTE: Waypoint[] = [
  {
    name: "The Shire", x: 300, y: 60, cumulativeMiles: 0,
    isLandmark: true, landmarkId: "shire",
    message: "Your journey begins in the Shire.",
    lore: "A green and peaceful homeland of rolling hills and round doors.",
  },
  {
    name: "Rivendell", x: 340, y: 300, cumulativeMiles: 458,
    isLandmark: true, landmarkId: "rivendell",
    message: "You have reached Rivendell!",
    lore: "A hidden elven valley of waterfalls, where weary travelers find rest.",
  },
  {
    name: "Mines of Moria", x: 300, y: 470, cumulativeMiles: 800,
    isLandmark: true, landmarkId: "moria",
    message: "You have crossed the Mines of Moria!",
    lore: "An ancient dwarven kingdom, now dark and deep beneath the mountains.",
  },
  {
    name: "Lothlorien", x: 330, y: 560, cumulativeMiles: 920,
    isLandmark: true, landmarkId: "lothlorien",
    message: "You have entered Lothlorien!",
    lore: "A golden wood of tall silver trees, radiant and timeless.",
  },
  {
    name: "Rauros Falls", x: 340, y: 760, cumulativeMiles: 1309,
    isLandmark: true, landmarkId: "rauros",
    message: "You have reached the Falls of Rauros!",
    lore: "A great cascade on the river, guarded by two towering stone kings.",
  },
  {
    name: "Minas Tirith", x: 380, y: 940, cumulativeMiles: 1500,
    isLandmark: true, landmarkId: "minas-tirith",
    message: "You have arrived at Minas Tirith!",
    lore: "A white city of seven tiers, gleaming against the mountainside.",
  },
  {
    name: "The Black Gate", x: 430, y: 1060, cumulativeMiles: 1650,
    isLandmark: true, landmarkId: "black-gate",
    message: "You stand before the Black Gate!",
    lore: "A vast iron barrier at the threshold of a ruined, ashen land.",
  },
  {
    name: "Mount Doom", x: 470, y: 1140, cumulativeMiles: 1779,
    isLandmark: true, landmarkId: "mount-doom",
    message: "You have reached Mount Doom — the quest is complete!",
    lore: "A lone volcano wreathed in smoke and fire at the journey's end.",
  },
];

export const TOTAL_MILES = ROUTE[ROUTE.length - 1].cumulativeMiles;
```

- [ ] **Step 4: Create `shared/characters.ts`**

```ts
import type { CharacterKey } from "./types";

export interface CharacterDef {
  key: CharacterKey;
  name: string;
  sprite: string; // path under /sprites, supplied as a pixel-art asset later
}

export const CHARACTERS: CharacterDef[] = [
  { key: "frodo", name: "Frodo (Hobbit)", sprite: "/sprites/frodo.png" },
  { key: "sam", name: "Sam (Hobbit)", sprite: "/sprites/sam.png" },
  { key: "aragorn", name: "Aragorn (Ranger)", sprite: "/sprites/aragorn.png" },
  { key: "legolas", name: "Legolas (Elf)", sprite: "/sprites/legolas.png" },
  { key: "gimli", name: "Gimli (Dwarf)", sprite: "/sprites/gimli.png" },
  { key: "gandalf", name: "Gandalf (Wizard)", sprite: "/sprites/gandalf.png" },
  { key: "boromir", name: "Boromir (Warrior)", sprite: "/sprites/boromir.png" },
];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run shared/route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add shared/route.ts shared/characters.ts shared/route.test.ts
git commit -m "feat: route waypoints and character definitions"
```

---

### Task 4: Progress engine (miles → map position)

**Files:**
- Create: `shared/progress.ts`
- Test: `shared/progress.test.ts`

**Interfaces:**
- Consumes: `Waypoint`, `Position` from `shared/types`.
- Produces:
  - `function positionForMiles(miles: number, route: Waypoint[]): Position` — clamps below 0 to the first waypoint and at/above the last cumulative distance to the last waypoint; otherwise linearly interpolates `x`/`y` within the containing segment. `segmentIndex` is the index of the segment's start waypoint.
  - `function percentComplete(miles: number, route: Waypoint[]): number` — `0`–`100`, clamped, relative to the last waypoint's `cumulativeMiles`.

- [ ] **Step 1: Write the failing test**

`shared/progress.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { positionForMiles, percentComplete } from "./progress";
import type { Waypoint } from "./types";

const R: Waypoint[] = [
  { name: "A", x: 0, y: 0, cumulativeMiles: 0, isLandmark: true, landmarkId: "a" },
  { name: "B", x: 100, y: 0, cumulativeMiles: 100, isLandmark: true, landmarkId: "b" },
  { name: "C", x: 100, y: 200, cumulativeMiles: 300, isLandmark: true, landmarkId: "c" },
];

describe("positionForMiles", () => {
  it("clamps negative miles to the first waypoint", () => {
    expect(positionForMiles(-5, R)).toEqual({ x: 0, y: 0, segmentIndex: 0 });
  });
  it("returns exact waypoint position on a threshold", () => {
    expect(positionForMiles(100, R)).toEqual({ x: 100, y: 0, segmentIndex: 1 });
  });
  it("interpolates within the first segment", () => {
    expect(positionForMiles(50, R)).toEqual({ x: 50, y: 0, segmentIndex: 0 });
  });
  it("interpolates within a later, longer segment", () => {
    // 200 miles = 100 mi into the 200-mile B->C segment => halfway
    expect(positionForMiles(200, R)).toEqual({ x: 100, y: 100, segmentIndex: 1 });
  });
  it("clamps beyond the end to the last waypoint", () => {
    expect(positionForMiles(9999, R)).toEqual({ x: 100, y: 200, segmentIndex: 2 });
  });
});

describe("percentComplete", () => {
  it("is 0 at the start", () => expect(percentComplete(0, R)).toBe(0));
  it("is 50 at the halfway distance", () => expect(percentComplete(150, R)).toBe(50));
  it("clamps to 100 past the end", () => expect(percentComplete(400, R)).toBe(100));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/progress.test.ts`
Expected: FAIL — cannot find module `./progress`.

- [ ] **Step 3: Create `shared/progress.ts`**

```ts
import type { Waypoint, Position } from "./types";

export function positionForMiles(miles: number, route: Waypoint[]): Position {
  const first = route[0];
  const last = route[route.length - 1];

  if (miles <= first.cumulativeMiles) {
    return { x: first.x, y: first.y, segmentIndex: 0 };
  }
  if (miles >= last.cumulativeMiles) {
    return { x: last.x, y: last.y, segmentIndex: route.length - 1 };
  }

  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    if (miles >= a.cumulativeMiles && miles <= b.cumulativeMiles) {
      const span = b.cumulativeMiles - a.cumulativeMiles;
      const t = span === 0 ? 0 : (miles - a.cumulativeMiles) / span;
      // exact landing on b's threshold reports b's position and index
      if (miles === b.cumulativeMiles) {
        return { x: b.x, y: b.y, segmentIndex: i + 1 };
      }
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        segmentIndex: i,
      };
    }
  }
  return { x: last.x, y: last.y, segmentIndex: route.length - 1 };
}

export function percentComplete(miles: number, route: Waypoint[]): number {
  const total = route[route.length - 1].cumulativeMiles;
  if (total <= 0) return 0;
  const pct = (miles / total) * 100;
  return Math.max(0, Math.min(100, pct));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run shared/progress.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/progress.ts shared/progress.test.ts
git commit -m "feat: miles-to-position interpolation and percent complete"
```

---

### Task 5: Milestone detection

**Files:**
- Create: `shared/milestones.ts`
- Test: `shared/milestones.test.ts`

**Interfaces:**
- Consumes: `Waypoint`, `Milestone` from `shared/types`.
- Produces:
  - `function crossedLandmarks(oldMiles: number, newMiles: number, route: Waypoint[]): Milestone[]` — returns landmarks whose `cumulativeMiles` is in the half-open interval `(oldMiles, newMiles]`, ordered by distance. Non-landmark waypoints and landmarks missing `message`/`lore` are skipped. A start-at-0 landmark never fires when `oldMiles === 0`.

- [ ] **Step 1: Write the failing test**

`shared/milestones.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { crossedLandmarks } from "./milestones";
import type { Waypoint } from "./types";

const R: Waypoint[] = [
  { name: "Start", x: 0, y: 0, cumulativeMiles: 0, isLandmark: true, landmarkId: "start", message: "m", lore: "l" },
  { name: "L1", x: 0, y: 0, cumulativeMiles: 100, isLandmark: true, landmarkId: "l1", message: "m1", lore: "lore1" },
  { name: "L2", x: 0, y: 0, cumulativeMiles: 200, isLandmark: true, landmarkId: "l2", message: "m2", lore: "lore2" },
  { name: "waypoint", x: 0, y: 0, cumulativeMiles: 250, isLandmark: false },
];

describe("crossedLandmarks", () => {
  it("returns nothing when no landmark is between old and new", () => {
    expect(crossedLandmarks(10, 90, R)).toEqual([]);
  });
  it("does not re-fire the start landmark for a new runner at 0", () => {
    expect(crossedLandmarks(0, 50, R)).toEqual([]);
  });
  it("fires a landmark crossed this sync", () => {
    const out = crossedLandmarks(90, 150, R);
    expect(out.map((m) => m.landmarkId)).toEqual(["l1"]);
  });
  it("fires multiple landmarks crossed in one sync, in order", () => {
    const out = crossedLandmarks(50, 205, R);
    expect(out.map((m) => m.landmarkId)).toEqual(["l1", "l2"]);
  });
  it("fires on an exact threshold hit (inclusive upper bound)", () => {
    expect(crossedLandmarks(150, 200, R).map((m) => m.landmarkId)).toEqual(["l2"]);
  });
  it("ignores non-landmark waypoints", () => {
    expect(crossedLandmarks(210, 300, R)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/milestones.test.ts`
Expected: FAIL — cannot find module `./milestones`.

- [ ] **Step 3: Create `shared/milestones.ts`**

```ts
import type { Waypoint, Milestone } from "./types";

export function crossedLandmarks(
  oldMiles: number,
  newMiles: number,
  route: Waypoint[]
): Milestone[] {
  return route
    .filter(
      (w) =>
        w.isLandmark &&
        w.landmarkId &&
        w.message &&
        w.lore &&
        w.cumulativeMiles > oldMiles &&
        w.cumulativeMiles <= newMiles
    )
    .sort((a, b) => a.cumulativeMiles - b.cumulativeMiles)
    .map((w) => ({
      landmarkId: w.landmarkId as string,
      name: w.name,
      message: w.message as string,
      lore: w.lore as string,
      cumulativeMiles: w.cumulativeMiles,
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run shared/milestones.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/milestones.ts shared/milestones.test.ts
git commit -m "feat: landmark crossing detection"
```

---

### Task 6: Sync core (pure computation)

**Files:**
- Create: `shared/sync-core.ts`
- Test: `shared/sync-core.test.ts`

**Interfaces:**
- Consumes: `RunActivity`, `Waypoint`, `Milestone`; `crossedLandmarks` from `shared/milestones`.
- Produces:
  - `interface SyncComputeInput { fetched: RunActivity[]; existingActivityIds: number[]; previousTotalMiles: number; route: Waypoint[] }`
  - `interface SyncComputeResult { newActivities: RunActivity[]; newTotalMiles: number; crossed: Milestone[] }`
  - `function computeSync(input: SyncComputeInput): SyncComputeResult` — drops fetched activities whose `stravaActivityId` is already known, sums the new miles onto `previousTotalMiles`, and computes landmarks crossed between the old and new totals.

- [ ] **Step 1: Write the failing test**

`shared/sync-core.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeSync } from "./sync-core";
import type { RunActivity, Waypoint } from "./types";

const route: Waypoint[] = [
  { name: "Start", x: 0, y: 0, cumulativeMiles: 0, isLandmark: true, landmarkId: "start", message: "m", lore: "l" },
  { name: "L1", x: 0, y: 0, cumulativeMiles: 10, isLandmark: true, landmarkId: "l1", message: "m1", lore: "lore1" },
];

const run = (id: number, miles: number): RunActivity => ({
  stravaActivityId: id, distanceMiles: miles, runDate: "2026-07-01T00:00:00Z", name: "Run",
});

describe("computeSync", () => {
  it("dedupes activities already stored", () => {
    const res = computeSync({
      fetched: [run(1, 3), run(2, 4)],
      existingActivityIds: [1],
      previousTotalMiles: 0,
      route,
    });
    expect(res.newActivities.map((a) => a.stravaActivityId)).toEqual([2]);
    expect(res.newTotalMiles).toBe(4);
  });
  it("accumulates onto the previous total", () => {
    const res = computeSync({
      fetched: [run(5, 2.5)],
      existingActivityIds: [],
      previousTotalMiles: 6,
      route,
    });
    expect(res.newTotalMiles).toBe(8.5);
  });
  it("reports a landmark crossed by the new miles", () => {
    const res = computeSync({
      fetched: [run(9, 7)],
      existingActivityIds: [],
      previousTotalMiles: 6,
      route,
    });
    expect(res.crossed.map((m) => m.landmarkId)).toEqual(["l1"]);
  });
  it("reports no crossings when nothing new is added", () => {
    const res = computeSync({
      fetched: [run(1, 3)],
      existingActivityIds: [1],
      previousTotalMiles: 6,
      route,
    });
    expect(res.newActivities).toEqual([]);
    expect(res.crossed).toEqual([]);
    expect(res.newTotalMiles).toBe(6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run shared/sync-core.test.ts`
Expected: FAIL — cannot find module `./sync-core`.

- [ ] **Step 3: Create `shared/sync-core.ts`**

```ts
import type { RunActivity, Waypoint, Milestone } from "./types";
import { crossedLandmarks } from "./milestones";

export interface SyncComputeInput {
  fetched: RunActivity[];
  existingActivityIds: number[];
  previousTotalMiles: number;
  route: Waypoint[];
}

export interface SyncComputeResult {
  newActivities: RunActivity[];
  newTotalMiles: number;
  crossed: Milestone[];
}

export function computeSync(input: SyncComputeInput): SyncComputeResult {
  const known = new Set(input.existingActivityIds);
  const newActivities = input.fetched.filter((a) => !known.has(a.stravaActivityId));
  const added = newActivities.reduce((sum, a) => sum + a.distanceMiles, 0);
  const newTotalMiles = input.previousTotalMiles + added;
  const crossed = crossedLandmarks(input.previousTotalMiles, newTotalMiles, input.route);
  return { newActivities, newTotalMiles, crossed };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run shared/sync-core.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add shared/sync-core.ts shared/sync-core.test.ts
git commit -m "feat: pure sync computation (dedupe, totals, crossings)"
```

---

### Task 7: Database schema migration and Supabase client

**Files:**
- Create: `supabase/migrations/0001_init.sql`, `api/_lib/env.ts`, `api/_lib/supabase.ts`

**Interfaces:**
- Produces:
  - Tables `fellowship`, `users`, `activities`, `milestone_awards` (columns below).
  - `function getEnv(name: string): string` — throws if the variable is missing.
  - `function getServiceClient(): SupabaseClient` — a service-role client (server-only).

- [ ] **Step 1: Create the migration**

`supabase/migrations/0001_init.sql`:
```sql
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
```

- [ ] **Step 2: Create `api/_lib/env.ts`**

```ts
export function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
```

- [ ] **Step 3: Create `api/_lib/supabase.ts`**

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "./env";

export function getServiceClient(): SupabaseClient {
  return createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

- [ ] **Step 4: Document how to apply the migration**

Add to `README.md` (create the file if absent) under a "Database" heading:
```markdown
## Database
Create a Supabase project, then run `supabase/migrations/0001_init.sql` in the
Supabase SQL editor (or `supabase db push` with the CLI). Copy the project URL
and service-role key into `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`.
```

- [ ] **Step 5: Verify SQL parses (typecheck the TS)**

Run: `npx tsc -b`
Expected: no type errors. (SQL is applied manually against Supabase; there is no local DB in CI.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0001_init.sql api/_lib/env.ts api/_lib/supabase.ts README.md
git commit -m "feat: database schema and supabase service client"
```

---

### Task 8: Session tokens and encryption-at-rest

**Files:**
- Create: `api/_lib/session.ts`, `api/_lib/crypto.ts`
- Test: `api/_lib/session.test.ts`, `api/_lib/crypto.test.ts`

**Interfaces:**
- Produces:
  - `async function signSession(userId: string, secret: string): Promise<string>`
  - `async function verifySession(token: string, secret: string): Promise<{ userId: string } | null>` — returns `null` on any invalid/expired token.
  - `function encrypt(plaintext: string, keyHex: string): string` — AES-256-GCM, output `ivHex:tagHex:cipherHex`.
  - `function decrypt(payload: string, keyHex: string): string`.

- [ ] **Step 1: Write the failing tests**

`api/_lib/session.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { signSession, verifySession } from "./session";

const SECRET = "test-secret-value-32-chars-min-len!";

describe("session", () => {
  it("round-trips a signed session", async () => {
    const token = await signSession("user-123", SECRET);
    expect(await verifySession(token, SECRET)).toEqual({ userId: "user-123" });
  });
  it("rejects a token signed with a different secret", async () => {
    const token = await signSession("user-123", SECRET);
    expect(await verifySession(token, "another-secret-value-least-32chars!!")).toBeNull();
  });
  it("rejects garbage", async () => {
    expect(await verifySession("not.a.jwt", SECRET)).toBeNull();
  });
});
```

`api/_lib/crypto.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "./crypto";

// 32 bytes as 64 hex chars
const KEY = "0".repeat(64);

describe("crypto", () => {
  it("round-trips a secret", () => {
    const enc = encrypt("my-strava-refresh-token", KEY);
    expect(enc).not.toContain("my-strava-refresh-token");
    expect(decrypt(enc, KEY)).toBe("my-strava-refresh-token");
  });
  it("produces different ciphertext each call (random IV)", () => {
    expect(encrypt("same", KEY)).not.toBe(encrypt("same", KEY));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run api/_lib/session.test.ts api/_lib/crypto.test.ts`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Create `api/_lib/session.ts`**

```ts
import { SignJWT, jwtVerify } from "jose";

export async function signSession(userId: string, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(key);
}

export async function verifySession(
  token: string,
  secret: string
): Promise<{ userId: string } | null> {
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    if (typeof payload.userId !== "string") return null;
    return { userId: payload.userId };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Create `api/_lib/crypto.ts`**

```ts
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

export function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, "hex");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${ct.toString("hex")}`;
}

export function decrypt(payload: string, keyHex: string): string {
  const [ivHex, tagHex, ctHex] = payload.split(":");
  const key = Buffer.from(keyHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ctHex, "hex")), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run api/_lib/session.test.ts api/_lib/crypto.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add api/_lib/session.ts api/_lib/crypto.ts api/_lib/session.test.ts api/_lib/crypto.test.ts
git commit -m "feat: session JWT and AES-256-GCM token encryption"
```

---

### Task 9: Strava API client

**Files:**
- Create: `api/_lib/strava.ts`
- Test: `api/_lib/strava.test.ts`

**Interfaces:**
- Consumes: `RunActivity` from `shared/types`; `metersToMiles` from `shared/units`.
- Produces:
  - `interface StravaTokens { accessToken: string; refreshToken: string; expiresAt: number }` (`expiresAt` = epoch seconds)
  - `interface StravaAthlete { id: number; firstname: string; lastname: string; profile: string }`
  - `async function exchangeCode(code: string, deps: StravaDeps): Promise<{ tokens: StravaTokens; athlete: StravaAthlete }>`
  - `async function refreshTokens(refreshToken: string, deps: StravaDeps): Promise<StravaTokens>`
  - `async function fetchRunsSince(accessToken: string, afterEpoch: number, fetchImpl?: typeof fetch): Promise<RunActivity[]>` — paginates `per_page=200`, filters `type === "Run"`, maps distance via `metersToMiles`.
  - `interface StravaDeps { clientId: string; clientSecret: string; fetchImpl?: typeof fetch }`

- [ ] **Step 1: Write the failing test**

`api/_lib/strava.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { exchangeCode, refreshTokens, fetchRunsSince } from "./strava";

const deps = { clientId: "cid", clientSecret: "secret" };

function jsonResponse(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
}

describe("exchangeCode", () => {
  it("posts the code and returns tokens + athlete", async () => {
    const fetchImpl = vi.fn(() =>
      jsonResponse({
        access_token: "acc", refresh_token: "ref", expires_at: 1000,
        athlete: { id: 42, firstname: "Sam", lastname: "G", profile: "http://x/p.png" },
      })
    ) as unknown as typeof fetch;
    const res = await exchangeCode("thecode", { ...deps, fetchImpl });
    expect(res.tokens).toEqual({ accessToken: "acc", refreshToken: "ref", expiresAt: 1000 });
    expect(res.athlete.id).toBe(42);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://www.strava.com/oauth/token",
      expect.objectContaining({ method: "POST" })
    );
  });
});

describe("refreshTokens", () => {
  it("returns refreshed tokens", async () => {
    const fetchImpl = vi.fn(() =>
      jsonResponse({ access_token: "a2", refresh_token: "r2", expires_at: 2000 })
    ) as unknown as typeof fetch;
    expect(await refreshTokens("oldref", { ...deps, fetchImpl })).toEqual({
      accessToken: "a2", refreshToken: "r2", expiresAt: 2000,
    });
  });
});

describe("fetchRunsSince", () => {
  it("keeps only runs, converts meters to miles, and stops on a short page", async () => {
    const page1 = [
      { id: 1, type: "Run", distance: 1609.344, start_date: "2026-07-01T00:00:00Z", name: "Morning" },
      { id: 2, type: "Ride", distance: 20000, start_date: "2026-07-01T00:00:00Z", name: "Bike" },
    ];
    const fetchImpl = vi.fn(() => jsonResponse(page1)) as unknown as typeof fetch;
    const runs = await fetchRunsSince("acc", 0, fetchImpl);
    expect(runs).toHaveLength(1);
    expect(runs[0].stravaActivityId).toBe(1);
    expect(runs[0].distanceMiles).toBeCloseTo(1, 6);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // short page => no page 2
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_lib/strava.test.ts`
Expected: FAIL — cannot find module `./strava`.

- [ ] **Step 3: Create `api/_lib/strava.ts`**

```ts
import type { RunActivity } from "../../shared/types";
import { metersToMiles } from "../../shared/units";

export interface StravaTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch seconds
}

export interface StravaAthlete {
  id: number;
  firstname: string;
  lastname: string;
  profile: string;
}

export interface StravaDeps {
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}

const TOKEN_URL = "https://www.strava.com/oauth/token";
const ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities";

async function postToken(body: Record<string, string>, deps: StravaDeps) {
  const f = deps.fetchImpl ?? fetch;
  const res = await f(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: deps.clientId, client_secret: deps.clientSecret, ...body }),
  });
  if (!res.ok) throw new Error(`Strava token request failed: ${res.status}`);
  return res.json();
}

export async function exchangeCode(code: string, deps: StravaDeps) {
  const data = await postToken({ code, grant_type: "authorization_code" }, deps);
  const tokens: StravaTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_at,
  };
  const a = data.athlete;
  const athlete: StravaAthlete = {
    id: a.id, firstname: a.firstname, lastname: a.lastname, profile: a.profile,
  };
  return { tokens, athlete };
}

export async function refreshTokens(refreshToken: string, deps: StravaDeps): Promise<StravaTokens> {
  const data = await postToken({ grant_type: "refresh_token", refresh_token: refreshToken }, deps);
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: data.expires_at };
}

export async function fetchRunsSince(
  accessToken: string,
  afterEpoch: number,
  fetchImpl?: typeof fetch
): Promise<RunActivity[]> {
  const f = fetchImpl ?? fetch;
  const perPage = 200;
  const runs: RunActivity[] = [];
  for (let page = 1; ; page++) {
    const url = `${ACTIVITIES_URL}?after=${afterEpoch}&per_page=${perPage}&page=${page}`;
    const res = await f(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.status === 429) throw new Error("Strava rate limit reached");
    if (!res.ok) throw new Error(`Strava activities request failed: ${res.status}`);
    const batch = (await res.json()) as Array<{
      id: number; type: string; distance: number; start_date: string; name: string;
    }>;
    for (const a of batch) {
      if (a.type === "Run") {
        runs.push({
          stravaActivityId: a.id,
          distanceMiles: metersToMiles(a.distance),
          runDate: a.start_date,
          name: a.name,
        });
      }
    }
    if (batch.length < perPage) break;
  }
  return runs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_lib/strava.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add api/_lib/strava.ts api/_lib/strava.test.ts
git commit -m "feat: Strava OAuth + activity fetch client"
```

---

### Task 10: HTTP helpers and session reader

**Files:**
- Create: `api/_lib/http.ts`
- Test: `api/_lib/http.test.ts`

**Interfaces:**
- Consumes: `verifySession` from `./session`; `getEnv` from `./env`.
- Produces:
  - `function parseCookies(header: string | undefined): Record<string, string>`
  - `function sessionCookie(token: string): string` — `Set-Cookie` value: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`.
  - `const CLEAR_COOKIE: string` — expires the cookie immediately.
  - `async function readSessionUserId(req: { headers: Record<string, string | string[] | undefined> }): Promise<string | null>` — reads the `fr_session` cookie and verifies it with `SESSION_SECRET`.
  - Cookie name constant `SESSION_COOKIE = "fr_session"`.

- [ ] **Step 1: Write the failing test**

`api/_lib/http.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseCookies, sessionCookie, CLEAR_COOKIE, readSessionUserId, SESSION_COOKIE } from "./http";
import { signSession } from "./session";

describe("parseCookies", () => {
  it("parses a cookie header", () => {
    expect(parseCookies("a=1; b=two")).toEqual({ a: "1", b: "two" });
  });
  it("handles undefined", () => {
    expect(parseCookies(undefined)).toEqual({});
  });
});

describe("cookie builders", () => {
  it("marks the session cookie HttpOnly and Lax", () => {
    const c = sessionCookie("tok");
    expect(c).toContain(`${SESSION_COOKIE}=tok`);
    expect(c).toContain("HttpOnly");
    expect(c).toContain("SameSite=Lax");
  });
  it("clears with Max-Age=0", () => {
    expect(CLEAR_COOKIE).toContain("Max-Age=0");
  });
});

describe("readSessionUserId", () => {
  it("returns the userId from a valid session cookie", async () => {
    process.env.SESSION_SECRET = "a-test-secret-that-is-long-enough!!";
    const token = await signSession("u-9", process.env.SESSION_SECRET);
    const req = { headers: { cookie: `${SESSION_COOKIE}=${token}` } };
    expect(await readSessionUserId(req)).toBe("u-9");
  });
  it("returns null when no cookie is present", async () => {
    expect(await readSessionUserId({ headers: {} })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/_lib/http.test.ts`
Expected: FAIL — cannot find module `./http`.

- [ ] **Step 3: Create `api/_lib/http.ts`**

```ts
import { verifySession } from "./session";
import { getEnv } from "./env";

export const SESSION_COOKIE = "fr_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k) out[k] = decodeURIComponent(v.join("="));
  }
  return out;
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`;
}

export const CLEAR_COOKIE = `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

export async function readSessionUserId(req: {
  headers: Record<string, string | string[] | undefined>;
}): Promise<string | null> {
  const raw = req.headers.cookie;
  const cookieHeader = Array.isArray(raw) ? raw.join("; ") : raw;
  const token = parseCookies(cookieHeader)[SESSION_COOKIE];
  if (!token) return null;
  const session = await verifySession(token, getEnv("SESSION_SECRET"));
  return session?.userId ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/_lib/http.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add api/_lib/http.ts api/_lib/http.test.ts
git commit -m "feat: cookie helpers and session reader"
```

---

### Task 11: Auth endpoints (Strava callback + logout)

**Files:**
- Create: `api/auth/strava-callback.ts`, `api/auth/logout.ts`, `vercel.json`

**Interfaces:**
- Consumes: `exchangeCode` (strava), `encrypt` (crypto), `signSession`, `sessionCookie`/`CLEAR_COOKIE` (http), `getServiceClient` (supabase), `getEnv`.
- Produces: HTTP endpoints:
  - `GET /api/auth/strava-callback?code=...&state=<inviteToken>` — exchanges the code, upserts the user into the invited fellowship, sets the session cookie, redirects to `/`. If `state` is missing/invalid **and** the athlete is not already a user, redirects to `/join?error=invite`.
  - `POST /api/auth/logout` — clears the cookie, returns 204.

> Vercel Node functions export `default (req, res) => ...` with `req.query`, `req.method`, `req.headers`, and `res.status().json()/send()/setHeader()/redirect()`.

- [ ] **Step 1: Create `vercel.json`**

```json
{
  "functions": { "api/**/*.ts": { "runtime": "@vercel/node@3" } },
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }]
}
```

- [ ] **Step 2: Create `api/auth/strava-callback.ts`**

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { exchangeCode } from "../_lib/strava";
import { encrypt } from "../_lib/crypto";
import { signSession } from "../_lib/session";
import { sessionCookie } from "../_lib/http";
import { getServiceClient } from "../_lib/supabase";
import { getEnv } from "../_lib/env";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = req.query.code as string | undefined;
  const inviteToken = req.query.state as string | undefined;
  if (!code) return res.redirect("/?error=oauth");

  const { tokens, athlete } = await exchangeCode(code, {
    clientId: getEnv("STRAVA_CLIENT_ID"),
    clientSecret: getEnv("STRAVA_CLIENT_SECRET"),
  });

  const db = getServiceClient();
  const key = getEnv("TOKEN_ENCRYPTION_KEY");
  const displayName = `${athlete.firstname} ${athlete.lastname}`.trim();
  const expiresIso = new Date(tokens.expiresAt * 1000).toISOString();

  // Existing user?
  const { data: existing } = await db
    .from("users").select("id").eq("strava_athlete_id", athlete.id).maybeSingle();

  let userId: string;
  if (existing) {
    userId = existing.id;
    await db.from("users").update({
      display_name: displayName,
      avatar_url: athlete.profile,
      strava_access_token: encrypt(tokens.accessToken, key),
      strava_refresh_token: encrypt(tokens.refreshToken, key),
      token_expires_at: expiresIso,
    }).eq("id", userId);
  } else {
    // New user must present a valid invite token
    const { data: fellowship } = inviteToken
      ? await db.from("fellowship").select("id").eq("invite_token", inviteToken).maybeSingle()
      : { data: null };
    if (!fellowship) return res.redirect("/join?error=invite");

    const { data: created, error } = await db.from("users").insert({
      strava_athlete_id: athlete.id,
      display_name: displayName,
      avatar_url: athlete.profile,
      fellowship_id: fellowship.id,
      strava_access_token: encrypt(tokens.accessToken, key),
      strava_refresh_token: encrypt(tokens.refreshToken, key),
      token_expires_at: expiresIso,
    }).select("id").single();
    if (error || !created) return res.redirect("/?error=signup");
    userId = created.id;
  }

  const session = await signSession(userId, getEnv("SESSION_SECRET"));
  res.setHeader("Set-Cookie", sessionCookie(session));
  return res.redirect("/");
}
```

- [ ] **Step 3: Create `api/auth/logout.ts`**

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { CLEAR_COOKIE } from "../_lib/http";

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader("Set-Cookie", CLEAR_COOKIE);
  return res.status(204).end();
}
```

- [ ] **Step 4: Add the Vercel Node types dependency**

Run: `npm install -D @vercel/node@^3`
Expected: installs successfully.

- [ ] **Step 5: Typecheck**

Run: `npx tsc -b`
Expected: no type errors.

- [ ] **Step 6: Commit**

```bash
git add api/auth/strava-callback.ts api/auth/logout.ts vercel.json package.json package-lock.json
git commit -m "feat: Strava OAuth callback and logout endpoints"
```

---

### Task 12: Invite endpoint and `me` endpoint

**Files:**
- Create: `api/invite.ts`, `api/me.ts`

**Interfaces:**
- Consumes: `getServiceClient`, `readSessionUserId`.
- Produces:
  - `POST /api/invite` body `{ name: string }` → creates a new fellowship with a random `invite_token`, returns `{ inviteToken, fellowshipId }`. (Used once to bootstrap the group.)
  - `GET /api/invite?token=...` → `{ valid: boolean, fellowshipName?: string }`.
  - `GET /api/me` → `401` if no session; else `{ user: { id, displayName, avatarUrl, chosenCharacter, totalMiles }, fellowship: { id, name }, members: Array<{ id, displayName, chosenCharacter, totalMiles }>, fellowshipMiles: number }`.

- [ ] **Step 1: Create `api/invite.ts`**

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomBytes } from "node:crypto";
import { getServiceClient } from "./_lib/supabase";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const db = getServiceClient();

  if (req.method === "POST") {
    const name = (req.body?.name as string) || "The Fellowship";
    const inviteToken = randomBytes(9).toString("base64url");
    const { data, error } = await db
      .from("fellowship").insert({ name, invite_token: inviteToken })
      .select("id").single();
    if (error || !data) return res.status(500).json({ error: "could not create fellowship" });
    return res.status(201).json({ inviteToken, fellowshipId: data.id });
  }

  if (req.method === "GET") {
    const token = req.query.token as string | undefined;
    if (!token) return res.status(400).json({ valid: false });
    const { data } = await db
      .from("fellowship").select("name").eq("invite_token", token).maybeSingle();
    return res.status(200).json({ valid: !!data, fellowshipName: data?.name });
  }

  return res.status(405).end();
}
```

- [ ] **Step 2: Create `api/me.ts`**

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getServiceClient } from "./_lib/supabase";
import { readSessionUserId } from "./_lib/http";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const userId = await readSessionUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthenticated" });

  const db = getServiceClient();
  const { data: user } = await db
    .from("users")
    .select("id, display_name, avatar_url, chosen_character, total_miles, fellowship_id")
    .eq("id", userId).maybeSingle();
  if (!user) return res.status(401).json({ error: "unauthenticated" });

  const { data: fellowship } = await db
    .from("fellowship").select("id, name").eq("id", user.fellowship_id).single();

  const { data: members } = await db
    .from("users")
    .select("id, display_name, chosen_character, total_miles")
    .eq("fellowship_id", user.fellowship_id);

  const memberList = (members ?? []).map((m) => ({
    id: m.id, displayName: m.display_name,
    chosenCharacter: m.chosen_character, totalMiles: m.total_miles,
  }));
  const fellowshipMiles = memberList.reduce((s, m) => s + (m.totalMiles ?? 0), 0);

  return res.status(200).json({
    user: {
      id: user.id, displayName: user.display_name, avatarUrl: user.avatar_url,
      chosenCharacter: user.chosen_character, totalMiles: user.total_miles,
    },
    fellowship: { id: fellowship!.id, name: fellowship!.name },
    members: memberList,
    fellowshipMiles,
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add api/invite.ts api/me.ts
git commit -m "feat: invite creation/validation and me endpoint"
```

---

### Task 13: Character selection endpoint

**Files:**
- Create: `api/character.ts`
- Test: `api/character.test.ts`

**Interfaces:**
- Consumes: `getServiceClient`, `readSessionUserId`; `CHARACTERS` from `shared/characters`.
- Produces:
  - `POST /api/character` body `{ character: CharacterKey }` → validates the key against `CHARACTERS`, updates the user's `chosen_character`, returns `{ ok: true }`. Invalid key → 400. No session → 401.
  - `function isValidCharacter(key: string): key is CharacterKey` (exported for testing).

- [ ] **Step 1: Write the failing test**

`api/character.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isValidCharacter } from "./character";

describe("isValidCharacter", () => {
  it("accepts a known character", () => expect(isValidCharacter("frodo")).toBe(true));
  it("rejects an unknown character", () => expect(isValidCharacter("sauron")).toBe(false));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run api/character.test.ts`
Expected: FAIL — cannot find module `./character`.

- [ ] **Step 3: Create `api/character.ts`**

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getServiceClient } from "./_lib/supabase";
import { readSessionUserId } from "./_lib/http";
import { CHARACTERS } from "../shared/characters";
import type { CharacterKey } from "../shared/types";

const VALID = new Set(CHARACTERS.map((c) => c.key));

export function isValidCharacter(key: string): key is CharacterKey {
  return VALID.has(key as CharacterKey);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const userId = await readSessionUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthenticated" });

  const character = req.body?.character as string | undefined;
  if (!character || !isValidCharacter(character)) {
    return res.status(400).json({ error: "invalid character" });
  }

  const db = getServiceClient();
  await db.from("users").update({ chosen_character: character }).eq("id", userId);
  return res.status(200).json({ ok: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run api/character.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add api/character.ts api/character.test.ts
git commit -m "feat: character selection endpoint"
```

---

### Task 14: Sync endpoint

**Files:**
- Create: `api/sync.ts`

**Interfaces:**
- Consumes: `readSessionUserId`, `getServiceClient`, `getEnv`, `decrypt`/`encrypt`, `refreshTokens`/`fetchRunsSince` (strava), `computeSync` (sync-core), `ROUTE`, `crossedLandmarks` semantics.
- Produces:
  - `POST /api/sync` (authenticated) → refreshes the Strava token if expired, fetches runs since `last_sync_at`, computes new activities + total + crossings, inserts activities, updates the user's `total_miles`/`last_sync_at`, records personal + fellowship milestone awards idempotently, and returns `{ importedCount, totalMiles, fellowshipMiles, newBadges: Milestone[] }`. On a revoked token (refresh fails) → `409 { error: "reconnect" }`. On rate limit → `429 { error: "rate_limited" }`.

- [ ] **Step 1: Create `api/sync.ts`**

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readSessionUserId } from "./_lib/http";
import { getServiceClient } from "./_lib/supabase";
import { getEnv } from "./_lib/env";
import { decrypt, encrypt } from "./_lib/crypto";
import { refreshTokens, fetchRunsSince } from "./_lib/strava";
import { computeSync } from "../shared/sync-core";
import { crossedLandmarks } from "../shared/milestones";
import { ROUTE } from "../shared/route";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const userId = await readSessionUserId(req);
  if (!userId) return res.status(401).json({ error: "unauthenticated" });

  const db = getServiceClient();
  const key = getEnv("TOKEN_ENCRYPTION_KEY");

  const { data: user } = await db
    .from("users")
    .select("id, fellowship_id, strava_access_token, strava_refresh_token, token_expires_at, last_sync_at, total_miles")
    .eq("id", userId).single();
  if (!user) return res.status(401).json({ error: "unauthenticated" });

  // Refresh token if expired
  let accessToken = decrypt(user.strava_access_token, key);
  const expiresMs = new Date(user.token_expires_at).getTime();
  if (Date.now() >= expiresMs - 60_000) {
    try {
      const refreshed = await refreshTokens(decrypt(user.strava_refresh_token, key), {
        clientId: getEnv("STRAVA_CLIENT_ID"),
        clientSecret: getEnv("STRAVA_CLIENT_SECRET"),
      });
      accessToken = refreshed.accessToken;
      await db.from("users").update({
        strava_access_token: encrypt(refreshed.accessToken, key),
        strava_refresh_token: encrypt(refreshed.refreshToken, key),
        token_expires_at: new Date(refreshed.expiresAt * 1000).toISOString(),
      }).eq("id", userId);
    } catch {
      return res.status(409).json({ error: "reconnect" });
    }
  }

  // Fetch runs since last sync
  const afterEpoch = user.last_sync_at
    ? Math.floor(new Date(user.last_sync_at).getTime() / 1000)
    : 0;
  let fetched;
  try {
    fetched = await fetchRunsSince(accessToken, afterEpoch);
  } catch (e) {
    if (e instanceof Error && e.message.includes("rate limit")) {
      return res.status(429).json({ error: "rate_limited" });
    }
    return res.status(502).json({ error: "strava_unavailable" });
  }

  const { data: existing } = await db
    .from("activities").select("strava_activity_id").eq("user_id", userId);
  const existingIds = (existing ?? []).map((a) => a.strava_activity_id);

  const result = computeSync({
    fetched,
    existingActivityIds: existingIds,
    previousTotalMiles: user.total_miles,
    route: ROUTE,
  });

  if (result.newActivities.length > 0) {
    await db.from("activities").insert(
      result.newActivities.map((a) => ({
        user_id: userId,
        strava_activity_id: a.stravaActivityId,
        distance_miles: a.distanceMiles,
        run_date: a.runDate,
        name: a.name,
      }))
    );
  }
  await db.from("users").update({
    total_miles: result.newTotalMiles,
    last_sync_at: new Date().toISOString(),
  }).eq("id", userId);

  // Personal milestone awards (idempotent via unique constraint; ignore conflicts)
  for (const m of result.crossed) {
    await db.from("milestone_awards").upsert(
      { scope: "user", user_id: userId, fellowship_id: user.fellowship_id, landmark_id: m.landmarkId },
      { onConflict: "scope,user_id,landmark_id", ignoreDuplicates: true }
    );
  }

  // Fellowship-level crossings
  const { data: members } = await db
    .from("users").select("total_miles").eq("fellowship_id", user.fellowship_id);
  const fellowshipMiles = (members ?? []).reduce((s, m) => s + (m.total_miles ?? 0), 0);
  const priorFellowshipMiles = fellowshipMiles - result.newActivities.reduce((s, a) => s + a.distanceMiles, 0);
  const fellowshipCrossed = crossedLandmarks(priorFellowshipMiles, fellowshipMiles, ROUTE);
  for (const m of fellowshipCrossed) {
    await db.from("milestone_awards").upsert(
      { scope: "fellowship", user_id: null, fellowship_id: user.fellowship_id, landmark_id: m.landmarkId },
      { onConflict: "scope,user_id,landmark_id", ignoreDuplicates: true }
    );
  }

  return res.status(200).json({
    importedCount: result.newActivities.length,
    totalMiles: result.newTotalMiles,
    fellowshipMiles,
    newBadges: result.crossed,
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add api/sync.ts
git commit -m "feat: on-demand Strava sync endpoint with milestone awards"
```

---

### Task 15: Frontend API client and session hook

**Files:**
- Create: `src/api-client.ts`, `src/useSession.ts`
- Test: `src/api-client.test.ts`

**Interfaces:**
- Produces:
  - Types `MeResponse`, `SyncResponse`, `Member`.
  - `const api = { me, sync, chooseCharacter, createFellowship, checkInvite, logout }` — typed wrappers over `fetch` with `credentials: "include"`.
  - `function stravaAuthUrl(inviteToken?: string): string` — builds the Strava authorize URL from `VITE_STRAVA_CLIENT_ID` / `VITE_STRAVA_REDIRECT_URI`, scope `activity:read`, `state` = invite token.
  - `function useSession(): { data: MeResponse | null; loading: boolean; refresh: () => void }`.

- [ ] **Step 1: Write the failing test**

`src/api-client.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { stravaAuthUrl, api } from "./api-client";

beforeEach(() => {
  vi.stubEnv("VITE_STRAVA_CLIENT_ID", "12345");
  vi.stubEnv("VITE_STRAVA_REDIRECT_URI", "http://localhost:5173/api/auth/strava-callback");
});

describe("stravaAuthUrl", () => {
  it("includes client id, scope, and invite token as state", () => {
    const url = stravaAuthUrl("inv-abc");
    expect(url).toContain("client_id=12345");
    expect(url).toContain("scope=activity%3Aread");
    expect(url).toContain("state=inv-abc");
    expect(url).toContain("response_type=code");
  });
});

describe("api.sync", () => {
  it("POSTs to /api/sync with credentials", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ importedCount: 0, totalMiles: 0, fellowshipMiles: 0, newBadges: [] }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await api.sync();
    expect(res.importedCount).toBe(0);
    expect(fetchMock).toHaveBeenCalledWith("/api/sync", expect.objectContaining({ method: "POST", credentials: "include" }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/api-client.test.ts`
Expected: FAIL — cannot find module `./api-client`.

- [ ] **Step 3: Create `src/api-client.ts`**

```ts
import type { CharacterKey, Milestone } from "../shared/types";

export interface Member {
  id: string;
  displayName: string;
  chosenCharacter: CharacterKey | null;
  totalMiles: number;
}
export interface MeResponse {
  user: { id: string; displayName: string; avatarUrl: string | null; chosenCharacter: CharacterKey | null; totalMiles: number };
  fellowship: { id: string; name: string };
  members: Member[];
  fellowshipMiles: number;
}
export interface SyncResponse {
  importedCount: number;
  totalMiles: number;
  fellowshipMiles: number;
  newBadges: Milestone[];
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

export function stravaAuthUrl(inviteToken?: string): string {
  const params = new URLSearchParams({
    client_id: import.meta.env.VITE_STRAVA_CLIENT_ID,
    redirect_uri: import.meta.env.VITE_STRAVA_REDIRECT_URI,
    response_type: "code",
    scope: "activity:read",
    approval_prompt: "auto",
  });
  if (inviteToken) params.set("state", inviteToken);
  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}

export const api = {
  me: () => fetch("/api/me", { credentials: "include" }).then((r) => (r.status === 401 ? null : json<MeResponse>(r))),
  sync: () => fetch("/api/sync", { method: "POST", credentials: "include" }).then(json<SyncResponse>),
  chooseCharacter: (character: CharacterKey) =>
    fetch("/api/character", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ character }),
    }).then(json<{ ok: true }>),
  createFellowship: (name: string) =>
    fetch("/api/invite", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }).then(json<{ inviteToken: string; fellowshipId: string }>),
  checkInvite: (token: string) =>
    fetch(`/api/invite?token=${encodeURIComponent(token)}`).then(json<{ valid: boolean; fellowshipName?: string }>),
  logout: () => fetch("/api/auth/logout", { method: "POST", credentials: "include" }),
};
```

- [ ] **Step 4: Create `src/useSession.ts`**

```ts
import { useCallback, useEffect, useState } from "react";
import { api, type MeResponse } from "./api-client";

export function useSession() {
  const [data, setData] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(() => {
    setLoading(true);
    api.me().then((d) => setData(d)).catch(() => setData(null)).finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  return { data, loading, refresh };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/api-client.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/api-client.ts src/useSession.ts src/api-client.test.ts
git commit -m "feat: frontend API client and session hook"
```

---

### Task 16: Stats panel component

**Files:**
- Create: `src/components/StatsPanel.tsx`
- Test: `src/components/StatsPanel.test.tsx`

**Interfaces:**
- Consumes: `MeResponse`, `Member` from `src/api-client`; `percentComplete`, `ROUTE`, `crossedLandmarks`/route helpers; `positionForMiles` not needed here.
- Produces:
  - `function StatsPanel(props: { me: MeResponse; onSync: () => void; syncing: boolean }): JSX.Element`
  - Shows **both** personal % and fellowship % as headline numbers; a `Me | Fellowship` toggle switches the "next landmark" detail and which figure is emphasized; renders the leaderboard sorted by `totalMiles` desc; a Sync button.
  - `function nextLandmark(miles: number): { name: string; milesAway: number } | null` (exported) — the first landmark ahead of `miles`, or `null` if past the end.

- [ ] **Step 1: Write the failing test**

`src/components/StatsPanel.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StatsPanel, nextLandmark } from "./StatsPanel";
import type { MeResponse } from "../api-client";

const me: MeResponse = {
  user: { id: "u1", displayName: "Davis", avatarUrl: null, chosenCharacter: "aragorn", totalMiles: 458 },
  fellowship: { id: "f1", name: "The Fellowship" },
  members: [
    { id: "u1", displayName: "Davis", chosenCharacter: "aragorn", totalMiles: 458 },
    { id: "u2", displayName: "Sam", chosenCharacter: "frodo", totalMiles: 200 },
  ],
  fellowshipMiles: 658,
};

describe("nextLandmark", () => {
  it("returns the next landmark ahead", () => {
    expect(nextLandmark(458)?.name).toBe("Mines of Moria");
  });
  it("returns null past the end", () => {
    expect(nextLandmark(2000)).toBeNull();
  });
});

describe("StatsPanel", () => {
  it("shows both personal and fellowship percentages", () => {
    render(<StatsPanel me={me} onSync={() => {}} syncing={false} />);
    // personal: 458/1779 ≈ 25.7% ; fellowship: 658/1779 ≈ 37.0%
    expect(screen.getByText(/25\.7%/)).toBeInTheDocument();
    expect(screen.getByText(/37\.0%/)).toBeInTheDocument();
  });
  it("lists members sorted by miles", () => {
    render(<StatsPanel me={me} onSync={() => {}} syncing={false} />);
    const rows = screen.getAllByTestId("leader-row");
    expect(rows[0]).toHaveTextContent("Davis");
    expect(rows[1]).toHaveTextContent("Sam");
  });
  it("fires onSync when the button is clicked", () => {
    const onSync = vi.fn();
    render(<StatsPanel me={me} onSync={onSync} syncing={false} />);
    fireEvent.click(screen.getByRole("button", { name: /sync/i }));
    expect(onSync).toHaveBeenCalled();
  });
  it("toggles the detail lens between Me and Fellowship", () => {
    render(<StatsPanel me={me} onSync={() => {}} syncing={false} />);
    fireEvent.click(screen.getByRole("button", { name: /fellowship/i }));
    // fellowship at 658 mi -> next landmark still Moria (800), distance 142
    expect(screen.getByTestId("next-landmark")).toHaveTextContent(/142/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/StatsPanel.test.tsx`
Expected: FAIL — cannot find module `./StatsPanel`.

- [ ] **Step 3: Create `src/components/StatsPanel.tsx`**

```tsx
import { useState } from "react";
import type { MeResponse } from "../api-client";
import { ROUTE, TOTAL_MILES } from "../../shared/route";
import { percentComplete } from "../../shared/progress";

export function nextLandmark(miles: number): { name: string; milesAway: number } | null {
  const ahead = ROUTE.filter((w) => w.isLandmark && w.cumulativeMiles > miles)
    .sort((a, b) => a.cumulativeMiles - b.cumulativeMiles)[0];
  if (!ahead) return null;
  return { name: ahead.name, milesAway: Math.round((ahead.cumulativeMiles - miles) * 10) / 10 };
}

export function StatsPanel({ me, onSync, syncing }: {
  me: MeResponse; onSync: () => void; syncing: boolean;
}) {
  const [lens, setLens] = useState<"me" | "fellowship">("me");
  const personalPct = percentComplete(me.user.totalMiles, ROUTE);
  const fellowshipPct = percentComplete(me.fellowshipMiles, ROUTE);
  const lensMiles = lens === "me" ? me.user.totalMiles : me.fellowshipMiles;
  const next = nextLandmark(lensMiles);
  const leaders = [...me.members].sort((a, b) => b.totalMiles - a.totalMiles);
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="stats-panel">
      <div className="headline">
        <div><span className="label">You</span><strong>{personalPct.toFixed(1)}%</strong></div>
        <div><span className="label">Fellowship</span><strong>{fellowshipPct.toFixed(1)}%</strong></div>
      </div>
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${fellowshipPct}%` }} />
      </div>
      <div className="mileage">
        {Math.round(me.fellowshipMiles)} / {TOTAL_MILES} mi to Mount Doom
      </div>

      <div className="lens-toggle">
        <button aria-pressed={lens === "me"} onClick={() => setLens("me")}>Me</button>
        <button aria-pressed={lens === "fellowship"} onClick={() => setLens("fellowship")}>Fellowship</button>
      </div>
      <div data-testid="next-landmark" className="next-landmark">
        {next ? `🏅 Next: ${next.name} in ${next.milesAway} mi` : "🏔️ Mount Doom reached!"}
      </div>

      <ul className="leaderboard">
        {leaders.map((m, i) => (
          <li key={m.id} data-testid="leader-row">
            {medals[i] ?? "•"} {m.displayName} — {Math.round(m.totalMiles)} mi
          </li>
        ))}
      </ul>

      <button className="sync-btn" onClick={onSync} disabled={syncing}>
        {syncing ? "Syncing…" : "⟳ Sync Strava"}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/StatsPanel.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/StatsPanel.tsx src/components/StatsPanel.test.tsx
git commit -m "feat: stats panel with dual %, Me/Fellowship toggle, leaderboard"
```

---

### Task 17: Celebration modal component

**Files:**
- Create: `src/components/CelebrationModal.tsx`
- Test: `src/components/CelebrationModal.test.tsx`

**Interfaces:**
- Consumes: `Milestone` from `shared/types`.
- Produces:
  - `function CelebrationModal(props: { badges: Milestone[]; onClose: () => void }): JSX.Element | null` — renders nothing when `badges` is empty; otherwise shows the first badge's `name`, `message`, and `lore`, plus a "Continue" button that advances through remaining badges and calls `onClose` after the last.

- [ ] **Step 1: Write the failing test**

`src/components/CelebrationModal.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CelebrationModal } from "./CelebrationModal";
import type { Milestone } from "../../shared/types";

const badges: Milestone[] = [
  { landmarkId: "rivendell", name: "Rivendell", message: "You have reached Rivendell!", lore: "A hidden valley.", cumulativeMiles: 458 },
  { landmarkId: "moria", name: "Moria", message: "You crossed Moria!", lore: "A dark mine.", cumulativeMiles: 800 },
];

describe("CelebrationModal", () => {
  it("renders nothing with no badges", () => {
    const { container } = render(<CelebrationModal badges={[]} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("advances through badges then closes", () => {
    const onClose = vi.fn();
    render(<CelebrationModal badges={badges} onClose={onClose} />);
    expect(screen.getByText("Rivendell")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByText("Moria")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/CelebrationModal.test.tsx`
Expected: FAIL — cannot find module `./CelebrationModal`.

- [ ] **Step 3: Create `src/components/CelebrationModal.tsx`**

```tsx
import { useState } from "react";
import type { Milestone } from "../../shared/types";

export function CelebrationModal({ badges, onClose }: {
  badges: Milestone[]; onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  if (badges.length === 0) return null;
  const badge = badges[index];

  const advance = () => {
    if (index + 1 < badges.length) setIndex(index + 1);
    else onClose();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal pixel-frame">
        <div className="badge-scene" data-landmark={badge.landmarkId} />
        <h2>{badge.name}</h2>
        <p className="message">{badge.message}</p>
        <p className="lore">{badge.lore}</p>
        <button onClick={advance}>Continue</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/CelebrationModal.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/CelebrationModal.tsx src/components/CelebrationModal.test.tsx
git commit -m "feat: landmark celebration modal"
```

---

### Task 18: Map view component

**Files:**
- Create: `src/components/MapView.tsx`, `src/assets/placeholder-map.png` (any 600×1200 PNG placeholder), `src/styles.css`
- Test: manual (Leaflet requires a real DOM; the position math is already covered by `shared/progress.test.ts`).

**Interfaces:**
- Consumes: `Member` from `src/api-client`; `positionForMiles`, `ROUTE`; `CHARACTERS` for sprite lookup.
- Produces:
  - `function MapView(props: { members: Member[]; fellowshipMiles: number }): JSX.Element` — renders a Leaflet map with `CRS.Simple`, an `ImageOverlay` of the pixel map (bounds `[[0,0],[1200,600]]`), a marker per member at `positionForMiles(member.totalMiles)`, and a distinct Fellowship marker at `positionForMiles(fellowshipMiles)`. Leaflet pane uses `image-rendering: pixelated` via CSS.

> Leaflet's `CRS.Simple` uses `[y, x]` LatLng ordering with y growing downward when bounds are `[[0,0],[height,width]]`. Convert a `Position` to `[position.y, position.x]`.

- [ ] **Step 1: Add the placeholder asset and styles**

Create `src/assets/placeholder-map.png` — any 600×1200 PNG (a plain green rectangle is fine for now; the real pixel-art map is dropped in later). Create `src/styles.css`:
```css
.leaflet-container { background: #6b8f47; }
.leaflet-image-layer { image-rendering: pixelated; }
.runner-sprite { image-rendering: pixelated; }
.stats-panel { position: absolute; top: 12px; right: 12px; width: 220px;
  background: rgba(30,22,14,0.88); color: #f0e2c0; border: 2px solid #8a6b42;
  border-radius: 8px; padding: 12px; font-family: Georgia, serif; z-index: 1000; }
.headline { display: flex; justify-content: space-between; }
.progress-bar { height: 8px; background: #4a3a26; border-radius: 4px; overflow: hidden; margin: 6px 0; }
.progress-fill { height: 100%; background: #c0392b; }
.lens-toggle button[aria-pressed="true"] { background: #c0392b; color: #fff; }
.sync-btn { width: 100%; margin-top: 10px; background: #c0392b; color: #fff;
  border: none; border-radius: 6px; padding: 8px; }
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center; z-index: 2000; }
.pixel-frame { image-rendering: pixelated; background: #efe0bd; padding: 20px;
  border: 4px solid #6b4a2b; max-width: 480px; text-align: center; }
```

- [ ] **Step 2: Create `src/components/MapView.tsx`**

```tsx
import { MapContainer, ImageOverlay, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import type { Member } from "../api-client";
import { positionForMiles, ROUTE } from "../../shared/progress";
import { ROUTE as ROUTE_WAYPOINTS } from "../../shared/route";
import { CHARACTERS } from "../../shared/characters";
import mapUrl from "../assets/placeholder-map.png";

const HEIGHT = 1200;
const WIDTH = 600;
const bounds: L.LatLngBoundsExpression = [[0, 0], [HEIGHT, WIDTH]];

function spriteFor(character: string | null): string {
  return CHARACTERS.find((c) => c.key === character)?.sprite ?? "/sprites/frodo.png";
}

function spriteIcon(url: string) {
  return L.icon({ iconUrl: url, iconSize: [24, 24], className: "runner-sprite", iconAnchor: [12, 12] });
}

const fellowshipIcon = L.divIcon({ html: "⭐", className: "fellowship-marker", iconSize: [24, 24] });

export function MapView({ members, fellowshipMiles }: { members: Member[]; fellowshipMiles: number }) {
  const fellowshipPos = positionForMiles(fellowshipMiles, ROUTE_WAYPOINTS);
  return (
    <MapContainer crs={L.CRS.Simple} bounds={bounds} minZoom={-2} maxZoom={2}
      style={{ height: "100vh", width: "100vw" }}>
      <ImageOverlay url={mapUrl} bounds={bounds} />
      {members.map((m) => {
        const p = positionForMiles(m.totalMiles, ROUTE_WAYPOINTS);
        return (
          <Marker key={m.id} position={[p.y, p.x]} icon={spriteIcon(spriteFor(m.chosenCharacter))}>
            <Popup>{m.displayName} — {Math.round(m.totalMiles)} mi</Popup>
          </Marker>
        );
      })}
      <Marker position={[fellowshipPos.y, fellowshipPos.x]} icon={fellowshipIcon}>
        <Popup>The Fellowship — {Math.round(fellowshipMiles)} mi</Popup>
      </Marker>
    </MapContainer>
  );
}
```

> Note: `progress.ts` does not re-export `ROUTE`; the import line `import { positionForMiles, ROUTE } from "../../shared/progress"` must be `import { positionForMiles } from "../../shared/progress"`. Use `ROUTE_WAYPOINTS` from `shared/route` everywhere below. Fix this import before running.

- [ ] **Step 3: Correct the import in `MapView.tsx`**

Replace the two import lines with:
```tsx
import { positionForMiles } from "../../shared/progress";
import { ROUTE as ROUTE_WAYPOINTS } from "../../shared/route";
```

- [ ] **Step 4: Import Leaflet CSS in `src/main.tsx`**

Add these lines to the top of `src/main.tsx`:
```tsx
import "leaflet/dist/leaflet.css";
import "./styles.css";
```

- [ ] **Step 5: Typecheck and build**

Run: `npx tsc -b && npm run build`
Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/MapView.tsx src/assets/placeholder-map.png src/styles.css src/main.tsx
git commit -m "feat: Leaflet pixel-art map with runner and fellowship markers"
```

---

### Task 19: Pages and app composition (Login, Join, CharacterSelect, Dashboard, routing)

**Files:**
- Create: `src/pages/Login.tsx`, `src/pages/Join.tsx`, `src/pages/CharacterSelect.tsx`, `src/pages/Dashboard.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `useSession`, `api`, `stravaAuthUrl`; `CHARACTERS`; `MapView`, `StatsPanel`, `CelebrationModal`.
- Produces: routed SPA:
  - `/login` — Login page (Connect with Strava button using `stravaAuthUrl()`).
  - `/join` — Join page: reads `?token=` from the URL, validates via `api.checkInvite`, shows the fellowship name and a "Join with Strava" button (`stravaAuthUrl(token)`).
  - `/` — gated: if no session → redirect to `/login`; if session but `chosenCharacter` is null → `CharacterSelect`; else `Dashboard`.

- [ ] **Step 1: Create `src/pages/Login.tsx`**

```tsx
import { stravaAuthUrl } from "../api-client";

export default function Login() {
  return (
    <div className="centered">
      <h1>The Fellowship's Run</h1>
      <p>Run from the Shire to Mount Doom.</p>
      <a className="sync-btn" href={stravaAuthUrl()}>Connect with Strava</a>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/pages/Join.tsx`**

```tsx
import { useEffect, useState } from "react";
import { api, stravaAuthUrl } from "../api-client";

export default function Join() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [state, setState] = useState<{ valid: boolean; name?: string } | null>(null);

  useEffect(() => {
    if (!token) { setState({ valid: false }); return; }
    api.checkInvite(token).then((r) => setState({ valid: r.valid, name: r.fellowshipName }));
  }, [token]);

  if (!state) return <div className="centered">Loading…</div>;
  if (!state.valid) return <div className="centered"><h1>Invalid invite</h1><p>Ask your friend for a fresh link.</p></div>;

  return (
    <div className="centered">
      <h1>Join {state.name}</h1>
      <p>Connect Strava to join the fellowship.</p>
      <a className="sync-btn" href={stravaAuthUrl(token)}>Join with Strava</a>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/pages/CharacterSelect.tsx`**

```tsx
import { useState } from "react";
import { api } from "../api-client";
import { CHARACTERS } from "../../shared/characters";
import type { CharacterKey } from "../../shared/types";

export default function CharacterSelect({ onChosen }: { onChosen: () => void }) {
  const [saving, setSaving] = useState(false);

  const choose = async (key: CharacterKey) => {
    setSaving(true);
    await api.chooseCharacter(key);
    onChosen();
  };

  return (
    <div className="centered">
      <h1>Choose your character</h1>
      <div className="character-grid">
        {CHARACTERS.map((c) => (
          <button key={c.key} disabled={saving} onClick={() => choose(c.key)}>
            <img src={c.sprite} alt={c.name} className="runner-sprite" width={48} height={48} />
            <span>{c.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/pages/Dashboard.tsx`**

```tsx
import { useState } from "react";
import type { MeResponse } from "../api-client";
import { api } from "../api-client";
import type { Milestone } from "../../shared/types";
import { MapView } from "../components/MapView";
import { StatsPanel } from "../components/StatsPanel";
import { CelebrationModal } from "../components/CelebrationModal";

export default function Dashboard({ me, refresh }: { me: MeResponse; refresh: () => void }) {
  const [syncing, setSyncing] = useState(false);
  const [badges, setBadges] = useState<Milestone[]>([]);

  const onSync = async () => {
    setSyncing(true);
    try {
      const res = await api.sync();
      if (res.newBadges.length) setBadges(res.newBadges);
      refresh();
    } catch (e) {
      if (e instanceof Error && e.message === "409") alert("Please reconnect Strava.");
      else if (e instanceof Error && e.message === "429") alert("Strava is busy — try again shortly.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="dashboard">
      <MapView members={me.members} fellowshipMiles={me.fellowshipMiles} />
      <StatsPanel me={me} onSync={onSync} syncing={syncing} />
      <CelebrationModal badges={badges} onClose={() => setBadges([])} />
    </div>
  );
}
```

- [ ] **Step 5: Rewrite `src/App.tsx` with routing and gating**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useSession } from "./useSession";
import Login from "./pages/Login";
import Join from "./pages/Join";
import CharacterSelect from "./pages/CharacterSelect";
import Dashboard from "./pages/Dashboard";

function Home() {
  const { data, loading, refresh } = useSession();
  if (loading) return <div className="centered">Loading…</div>;
  if (!data) return <Navigate to="/login" replace />;
  if (!data.user.chosenCharacter) return <CharacterSelect onChosen={refresh} />;
  return <Dashboard me={data} refresh={refresh} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/join" element={<Join />} />
        <Route path="/" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 6: Typecheck, build, and run the full test suite**

Run: `npx tsc -b && npm run build && npm test`
Expected: build succeeds; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/pages src/App.tsx
git commit -m "feat: pages and routed app composition with session gating"
```

---

### Task 20: Deployment configuration and docs

**Files:**
- Modify: `README.md`
- Verify: `.gitignore`, `.env.example`, `vercel.json`

**Interfaces:**
- Produces: documented setup so a teammate can deploy from zero.

- [ ] **Step 1: Confirm `.gitignore` excludes secrets and build output**

Ensure `.gitignore` contains:
```
node_modules/
dist/
.env
.env.local
.superpowers/
.vercel/
```

- [ ] **Step 2: Write `README.md` setup + deploy sections**

```markdown
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

## Tests
`npm test` runs the Vitest suite (pure logic, API helpers, and components).

## Art assets
The map, character sprites, and celebration scenes are 16-bit pixel art supplied
separately (see the design spec's Appendix A for generation prompts). Drop map
art at `src/assets/placeholder-map.png` and sprites under `public/sprites/`.
```

- [ ] **Step 3: Final full verification**

Run: `npm install && npx tsc -b && npm run build && npm test`
Expected: all steps succeed; entire test suite passes.

- [ ] **Step 4: Commit**

```bash
git add README.md .gitignore
git commit -m "docs: setup, deploy, and bootstrap instructions"
```

---

## Self-Review

**1. Spec coverage:**
- Hybrid model (individual + pooled) → Tasks 4, 14, 16 (per-member markers + fellowship marker/percent). ✓
- One-tap Strava import → Tasks 9, 14, 16/19 (Sync button). ✓
- Big milestone moments → Tasks 5, 14 (awards), 17 (celebration modal). ✓
- Pixel-art map, `image-rendering: pixelated` → Task 18 styles + global constraint. ✓
- Long-haul 1,779 mi, no deadline → Task 3 route (no deadline logic anywhere). ✓
- Invite-link based → Tasks 11 (callback requires invite for new users), 12, 19 (Join page). ✓
- Character selection → Tasks 3, 13, 19. ✓
- Dashboard Me/Fellowship toggle + both %s → Task 16. ✓
- Architecture (React/Vite + Vercel functions + Supabase + Leaflet) → Tasks 1, 7, 11–14, 18. ✓
- Data model (fellowship/users/activities/milestone_awards) → Task 7. ✓
- Sync flow (refresh, fetch after last_sync, runs-only, dedupe, recompute, detect crossings) → Tasks 9, 6, 14. ✓
- Error handling (expired/revoked token, rate limit, dupes, new user at Shire, invalid invite) → Tasks 14 (409/429), 7 (unique constraint), 4 (clamp at 0), 12/19 (invite). ✓
- Testing (unit interpolation/crossing/conversion/dedupe; integration OAuth/sync/invite; manual map) → Tasks 2,4,5,6 (unit), 8,9,10,13,15 (helpers/integration), 18 (manual note). ✓
- Known v1 limitation (no activity-edit reconciliation) → sync only ever adds new activities (Task 14); no reconciliation added, matching spec. ✓
- Out-of-scope items (webhooks, social feed, push, multi-quest) → not implemented. ✓

**2. Placeholder scan:** No "TBD"/"implement later"/"add error handling" placeholders; every code step contains complete code. Pixel-coordinate values in Task 3 are explicit numbers flagged as recalibratable (data, not a code gap). ✓

**3. Type consistency:** `RunActivity`, `Waypoint`, `Position`, `Milestone`, `CharacterKey` defined once in Task 2 and reused verbatim. `computeSync`/`SyncComputeResult` (Task 6) consumed unchanged in Task 14. `MeResponse`/`SyncResponse`/`Member` defined in Task 15 and reused in Tasks 16, 19. `SESSION_COOKIE`/`readSessionUserId` defined in Task 10 and used in Tasks 11–14. Task 18 flags and corrects the one import mismatch (`ROUTE` is not exported from `progress.ts`) inline. ✓
