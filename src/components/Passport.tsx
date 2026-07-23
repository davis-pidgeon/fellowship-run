import { useState } from "react";
import { ROUTE } from "../../shared/route";
import { SIDE_QUESTS, ARCS } from "../../shared/sidequests";

type Filter = "all" | "postcards" | "letters" | "badges";

interface Item {
  kind: "postcard" | "letter" | "badge";
  id: string;
  title: string;
  sortKey: number; // higher = more recent; used for recency ordering
  scene?: string;  // postcard image path
  lore?: string;   // postcard/letter body
  arcColor?: string;
  mi?: number;
}

export function Passport({ totalMiles, openedQuestIds, weeklyBadges }: {
  totalMiles: number;
  openedQuestIds: string[];
  weeklyBadges: { week_start: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [reading, setReading] = useState<Item | null>(null);

  const postcards: Item[] = ROUTE.filter((w) => w.isLandmark && w.cumulativeMiles <= totalMiles).map((w) => ({
    kind: "postcard", id: w.landmarkId!, title: w.name, sortKey: w.cumulativeMiles, scene: `/scenes/${w.landmarkId}.png`, lore: w.lore, mi: w.cumulativeMiles,
  }));
  const openedSet = new Set(openedQuestIds);
  const letters: Item[] = SIDE_QUESTS.filter((q) => openedSet.has(q.id)).map((q) => ({
    kind: "letter", id: q.id, title: q.title, sortKey: q.revealMiles, lore: q.story, arcColor: ARCS[q.arc]?.color, mi: q.revealMiles,
  }));
  const badges: Item[] = weeklyBadges.map((b) => ({
    kind: "badge", id: `week-${b.week_start}`, title: `Member of the Week`, sortKey: new Date(`${b.week_start}T00:00:00Z`).getTime() / 1e9,
    lore: `You logged the most miles the week of ${b.week_start}.`,
  }));

  const all = [...postcards, ...letters, ...badges].sort((a, b) => b.sortKey - a.sortKey);
  const shown = filter === "all" ? all
    : filter === "postcards" ? postcards.slice().sort((a, b) => b.sortKey - a.sortKey)
    : filter === "letters" ? letters.slice().sort((a, b) => b.sortKey - a.sortKey)
    : badges.slice().sort((a, b) => b.sortKey - a.sortKey);
  const narrative = filter === "letters" || filter === "postcards";

  const iconFor = (it: Item) => it.kind === "postcard" ? "🖼️" : it.kind === "letter" ? "✉️" : "🏅";

  return (
    <>
      <button className="backpack-btn" onClick={() => setOpen(true)} title="Your journey" aria-label="Open your journey log">
        <img src="/pack.png" alt="Backpack" />
      </button>

      {open && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div className="modal pixel-frame passport" onClick={(e) => e.stopPropagation()}>
            <button className="passport-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            <h2>Your Journey</h2>

            <div className="bp-chips">
              {(["all", "postcards", "letters", "badges"] as Filter[]).map((f) => (
                <button key={f} className={"bp-chip" + (filter === f ? " on" : "")} onClick={() => { setFilter(f); setReading(null); }}>
                  {f[0].toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            {all.length === 0 ? (
              <p className="lore">No postcards, letters, or badges yet — lace up and reach a landmark, find a letter, or win a week!</p>
            ) : reading ? (
              <div className="bp-reader">
                <button className="bp-back" onClick={() => setReading(null)}>← Back</button>
                {reading.scene && <img className="postcard-scene" src={reading.scene} alt={reading.title} onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />}
                <h4>{reading.title}{reading.mi != null ? ` · ${reading.mi} mi` : ""}</h4>
                <p className="lore">{reading.lore}</p>
              </div>
            ) : shown.length === 0 ? (
              <p className="lore">Nothing here yet — try another filter.</p>
            ) : narrative ? (
              <div className="bp-reading-list">
                {shown.map((it) => (
                  <div key={it.id} className="bp-rl-item" style={{ borderLeftColor: it.arcColor ?? "#c9a24a" }} onClick={() => setReading(it)}>
                    <span className="bp-rl-ic">{iconFor(it)}</span>
                    <span className="bp-rl-tt">{it.title}</span>
                    <span className="bp-rl-mi">{it.mi != null ? `${it.mi} mi` : ""}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bp-grid">
                {shown.map((it) => (
                  <button key={it.id} className={"bp-tile bp-" + it.kind} onClick={() => setReading(it)} title={it.title}>
                    <span className="bp-tile-ic">{iconFor(it)}</span>
                    <span className="bp-tile-tt">{it.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
