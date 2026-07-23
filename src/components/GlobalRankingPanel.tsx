import { useState } from "react";
import type { RankingRow } from "../api-client";

type Metric = "pooled" | "percapita";

function valueFor(r: RankingRow, metric: Metric, timeframe: "all" | "week"): number {
  if (timeframe === "all") return metric === "pooled" ? r.pooledMiles : r.memberCount ? r.pooledMiles / r.memberCount : 0;
  return metric === "pooled" ? r.weekPooled : r.weekPerCapita;
}

function Rows({ rows, metric, timeframe, myId, onSelect, week }: {
  rows: RankingRow[]; metric: Metric; timeframe: "all" | "week"; myId: string | undefined;
  onSelect: (id: string) => void; week: boolean;
}) {
  const sorted = [...rows].sort((a, b) => valueFor(b, metric, timeframe) - valueFor(a, metric, timeframe));
  const medals = ["🥇", "🥈", "🥉"];
  return (
    <>
      {sorted.map((r, i) => (
        <div
          key={r.id}
          className={"rank-row" + (r.id === myId ? " me" : "")}
          onClick={() => onSelect(r.id)}
          title="Open fellowship card"
        >
          <span className="rank-rk">{!week && r.isProgressLeader ? "👑" : (medals[i] ?? i + 1)}</span>
          <span className="rank-nm">{r.name}</span>
          <span className="rank-val">{week ? "+" : ""}{Math.round(valueFor(r, metric, timeframe))}</span>
        </div>
      ))}
    </>
  );
}

export function GlobalRankingPanel({ rankings, myFellowshipId, onSelectFellowship }: {
  rankings: RankingRow[]; myFellowshipId: string | undefined; onSelectFellowship: (id: string) => void;
}) {
  const [metric, setMetric] = useState<Metric>("pooled");
  const [expanded, setExpanded] = useState(false);
  const top3all = [...rankings].sort((a, b) => valueFor(b, metric, "all") - valueFor(a, metric, "all")).slice(0, 3);
  const top3week = [...rankings].sort((a, b) => valueFor(b, metric, "week") - valueFor(a, metric, "week")).slice(0, 3);

  return (
    <div className={"global-panel" + (expanded ? " expanded" : "")}>
      <div className="global-panel-head">🌍 Fellowships</div>
      <div className="metric-toggle">
        <button aria-pressed={metric === "pooled"} onClick={() => setMetric("pooled")}>Pooled</button>
        <button aria-pressed={metric === "percapita"} onClick={() => setMetric("percapita")}>Per-capita</button>
      </div>

      {expanded ? (
        <div className="global-cols">
          <div>
            <div className="mini-head">All-time</div>
            <Rows rows={rankings} metric={metric} timeframe="all" myId={myFellowshipId} onSelect={onSelectFellowship} week={false} />
          </div>
          <div>
            <div className="mini-head">This week</div>
            <Rows rows={rankings} metric={metric} timeframe="week" myId={myFellowshipId} onSelect={onSelectFellowship} week={true} />
          </div>
        </div>
      ) : (
        <>
          <Rows rows={top3all} metric={metric} timeframe="all" myId={myFellowshipId} onSelect={onSelectFellowship} week={false} />
          <div className="mini-head">This week</div>
          <Rows rows={top3week} metric={metric} timeframe="week" myId={myFellowshipId} onSelect={onSelectFellowship} week={true} />
        </>
      )}

      <button className="expand-btn" onClick={() => setExpanded((e) => !e)}>
        {expanded ? "Collapse ▾" : "See full rankings ⤢"}
      </button>
    </div>
  );
}
