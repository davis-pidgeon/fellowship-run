import { useState, useEffect } from "react";
import type { Member, RecentActivity } from "../api-client";
import { CHARACTERS } from "../../shared/characters";
import { ROUTE, TOTAL_MILES } from "../../shared/route";
import { percentComplete } from "../../shared/progress";
import { SIDE_QUESTS, ARCS, type QuestArc } from "../../shared/sidequests";
import { fmtPace, latestLandmark, latestNoteTitle } from "./ProfilePopover";
import { computeAchievements } from "../achievements";

type Tab = "stats" | "achievements" | "collection" | "sayings";
const TABS: { key: Tab; label: string }[] = [
  { key: "stats", label: "Stats" },
  { key: "achievements", label: "Achievements" },
  { key: "collection", label: "Collection" },
  { key: "sayings", label: "Sayings" },
];

function spriteFor(character: string | null): string {
  return CHARACTERS.find((c) => c.key === character)?.sprite ?? "/sprites/frodo.png";
}
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// A speech bubble above the profile sprite that cycles through ALL of the
// character's activity names (newest first), continuously.
function StatSpeechBubble({ activities }: { activities: RecentActivity[] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (activities.length <= 1) return;
    const iv = setInterval(() => setI((x) => (x + 1) % activities.length), 3500);
    return () => clearInterval(iv);
  }, [activities.length]);
  if (!activities.length) return null;
  return <div className="pd-speech" key={i}>{activities[i % activities.length].name}</div>;
}
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="pd-stat">
      <span className="pd-stat-label">{label}</span>
      <span className="pd-stat-val">{value}</span>
    </div>
  );
}

// Full-screen character profile: sprite centered, stats radiating around it,
// with tabs for Stats / Achievements / Collection / Sayings.
export function ProfileDetail({ member, onClose }: { member: Member | null; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("stats");
  if (!member) return null;
  const s = member.stats;
  const color = member.color ?? "#fdd835";
  const pct = percentComplete(member.totalMiles, ROUTE);

  const left: [string, string][] = [
    ["Runs", String(s.runs)],
    ["Avg pace", fmtPace(s.avgPaceSecPerMile)],
    ["Longest run", s.longestMiles ? `${s.longestMiles.toFixed(1)} mi` : "—"],
    ["Avg / run", s.avgMiles ? `${s.avgMiles.toFixed(1)} mi` : "—"],
  ];
  const right: [string, string][] = [
    ["Total miles", `${member.totalMiles.toFixed(1)}`],
    ["Journey", `${pct.toFixed(1)}%`],
    ["Latest landmark", latestLandmark(member.totalMiles)],
    ["Latest note", latestNoteTitle(member.openedQuests)],
  ];

  const openedSet = new Set(member.openedQuests);
  const arcOrder = Object.keys(ARCS) as QuestArc[];
  const collections = arcOrder.map((arc) => {
    const all = SIDE_QUESTS.filter((q) => q.arc === arc);
    return { arc, info: ARCS[arc], total: all.length, found: all.filter((q) => openedSet.has(q.id)).length };
  });
  const landmarksReached = ROUTE.filter((w) => w.isLandmark && w.cumulativeMiles <= member.totalMiles).length;
  const totalLandmarks = ROUTE.filter((w) => w.isLandmark).length;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="profile-detail" onClick={(e) => e.stopPropagation()} style={{ borderColor: color }}>
        <button className="passport-close" onClick={onClose} aria-label="Close">✕</button>
        <h2 className="pd-name" style={{ color }}>{member.displayName}</h2>

        <div className="pd-tabs">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={"pd-tab" + (tab === t.key ? " active" : "")}
              style={tab === t.key ? { borderBottomColor: color, color: "#f0e2c0" } : undefined}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "stats" && (
          <div className="pd-stats-body">
            <div className="pd-col">{left.map(([l, v]) => <StatCard key={l} label={l} value={v} />)}</div>
            <div className="pd-center">
              <StatSpeechBubble activities={member.activities} />
              <img className="pd-sprite" src={spriteFor(member.chosenCharacter)} alt={member.displayName}
                style={{ filter: `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 6px ${color})` }} />
              {member.fellowshipName && <div className="pd-fellowship">{member.fellowshipName}</div>}
              <div className="pd-progress"><div className="pd-progress-fill" style={{ width: `${pct}%`, background: color }} /></div>
              <div className="pd-progress-label">{member.totalMiles.toFixed(1)} / {TOTAL_MILES} mi</div>
            </div>
            <div className="pd-col">{right.map(([l, v]) => <StatCard key={l} label={l} value={v} />)}</div>
          </div>
        )}

        {tab === "collection" && (
          <div className="pd-list">
            <div className="pd-collect-row">
              <span className="collection-dot" style={{ background: "#c9a24a" }} />
              <span>Landmarks</span>
              <span className="collection-count">{landmarksReached}/{totalLandmarks}</span>
            </div>
            {collections.map((c) => (
              <div className="pd-collect-row" key={c.arc}>
                <span className="collection-dot" style={{ background: c.info.color }} />
                <span>{c.info.title}</span>
                <span className="collection-count">{c.found}/{c.total}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "achievements" && (() => {
          const badges = computeAchievements(member);
          const earned = badges.filter((b) => b.earned).length;
          return (
            <div className="pd-badges">
              <div className="pd-badges-head">{earned} / {badges.length} earned</div>
              <div className="pd-badge-grid">
                {badges.map((b) => (
                  <div key={b.id} className={"pd-badge" + (b.earned ? " earned" : "")} title={b.description}>
                    <span className="pd-badge-icon">{b.earned ? b.icon : "🔒"}</span>
                    <span className="pd-badge-name">{b.name}</span>
                    <span className="pd-badge-desc">{b.description}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
        {tab === "sayings" && (
          member.activities.length === 0 ? (
            <div className="pd-empty">💬 No runs yet — your character's sayings come from your Strava activity names.</div>
          ) : (
            <div className="pd-list">
              <div className="pd-badges-head">Your character says your Strava activity names</div>
              {member.activities.map((a, i) => (
                <div className="pd-saying-row" key={i}>
                  <span className="pd-saying-name">“{a.name}”</span>
                  <span className="pd-saying-date">{fmtDate(a.date)}</span>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
