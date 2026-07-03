import { useState } from "react";
import type { MeResponse } from "../api-client";
import { ROUTE, TOTAL_MILES } from "../../shared/route";
import { percentComplete } from "../../shared/progress";
import { DEFAULT_COLOR } from "../../shared/characters";

const FELLOWSHIP_COLOR = "#c0392b";

export function nextLandmark(miles: number): { name: string; milesAway: number } | null {
  const ahead = ROUTE.filter((w) => w.isLandmark && w.cumulativeMiles > miles)
    .sort((a, b) => a.cumulativeMiles - b.cumulativeMiles)[0];
  if (!ahead) return null;
  return { name: ahead.name, milesAway: Math.round((ahead.cumulativeMiles - miles) * 10) / 10 };
}

export function StatsPanel({
  me,
  onSync,
  syncing,
  onSelectMember,
  collapsed: collapsedProp,
  onCollapsedChange,
}: {
  me: MeResponse;
  onSync: () => void;
  syncing: boolean;
  onSelectMember: (id: string) => void;
  collapsed?: boolean;
  onCollapsedChange?: (v: boolean) => void;
}) {
  const [lens, setLens] = useState<"me" | "fellowship">("me");
  const [internalCollapsed, setInternalCollapsed] = useState(false);
  const collapsed = collapsedProp ?? internalCollapsed;
  const setCollapsed = onCollapsedChange ?? setInternalCollapsed;

  const personalPct = percentComplete(me.user.totalMiles, ROUTE);
  const fellowshipPct = percentComplete(me.fellowshipMiles, ROUTE);
  const lensMiles = lens === "me" ? me.user.totalMiles : me.fellowshipMiles;
  const lensPct = lens === "me" ? personalPct : fellowshipPct;
  const fillColor = lens === "me" ? me.user.color ?? DEFAULT_COLOR : FELLOWSHIP_COLOR;
  const next = nextLandmark(lensMiles);
  const leaders = [...me.members].sort((a, b) => b.totalMiles - a.totalMiles);
  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div
      className={"stats-panel" + (collapsed ? " is-collapsed" : "")}
      onClick={collapsed ? () => setCollapsed(false) : undefined}
    >
      <div className="panel-top">
        <button
          className="panel-refresh"
          onClick={(e) => {
            e.stopPropagation();
            window.location.reload();
          }}
          title="Refresh"
          aria-label="Refresh page"
        >
          ↻
        </button>
        <button
          className="panel-collapse"
          onClick={(e) => {
            e.stopPropagation();
            setCollapsed(!collapsed);
          }}
          title={collapsed ? "Expand" : "Collapse"}
          aria-label={collapsed ? "Expand panel" : "Collapse panel"}
        >
          {collapsed ? "⤢" : "▾"}
        </button>
      </div>

      <div className="headline">
        <div className={lens === "me" ? "hl active" : "hl"}>
          <span className="label">You</span><strong>{personalPct.toFixed(1)}%</strong>
        </div>
        <div className={lens === "fellowship" ? "hl active" : "hl"}>
          <span className="label">Fellowship</span><strong>{fellowshipPct.toFixed(1)}%</strong>
        </div>
      </div>

      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${lensPct}%`, background: fillColor }} />
      </div>

      <div className="panel-details">
        <div className="lens-toggle">
          <button aria-pressed={lens === "me"} onClick={() => setLens("me")}>Me</button>
          <button aria-pressed={lens === "fellowship"} onClick={() => setLens("fellowship")}>Fellowship</button>
        </div>

        <div className="mileage">
          {lens === "me" ? "You: " : "Fellowship: "}
          {Math.round(lensMiles)} / {TOTAL_MILES} mi to Mount Doom
        </div>

        <div data-testid="next-landmark" className="next-landmark">
          {next ? `🏅 Next: ${next.name} in ${next.milesAway} mi` : "🏔️ Mount Doom reached!"}
        </div>

        <ul className="leaderboard">
          {leaders.map((m, i) => (
            <li
              key={m.id}
              data-testid="leader-row"
              className={"leader-row" + (m.id === me.user.id ? " you" : "")}
              onClick={() => onSelectMember(m.id)}
              title="Show on map"
            >
              <span className="dot" style={{ background: m.color ?? "#fdd835" }} />
              {medals[i] ?? "•"} {m.displayName} — {Math.round(m.totalMiles)} mi
            </li>
          ))}
        </ul>

        <button className="sync-btn" onClick={onSync} disabled={syncing}>
          {syncing ? "Syncing…" : "⟳ Sync Strava"}
        </button>
      </div>
    </div>
  );
}
