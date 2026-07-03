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
