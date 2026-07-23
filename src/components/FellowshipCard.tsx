import { useEffect, useState } from "react";
import { api, type FellowshipCardData } from "../api-client";
import { CHARACTERS } from "../../shared/characters";

type Tab = "trophies" | "members";
function spriteFor(character: string | null): string {
  return CHARACTERS.find((c) => c.key === character)?.sprite ?? "/sprites/frodo.png";
}
function weekLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function FellowshipCard({ fellowshipId, isLeader, onClose }: {
  fellowshipId: string | null; isLeader: boolean; onClose: () => void;
}) {
  const [data, setData] = useState<FellowshipCardData | null>(null);
  const [tab, setTab] = useState<Tab>("trophies");

  useEffect(() => {
    if (!fellowshipId) { setData(null); return; }
    setData(null);
    api.fellowship(fellowshipId).then(setData).catch(() => setData(null));
  }, [fellowshipId]);

  if (!fellowshipId) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="fellowship-card" onClick={(e) => e.stopPropagation()}>
        <button className="passport-close" onClick={onClose} aria-label="Close">✕</button>
        {!data ? (
          <div className="fc-loading">Loading…</div>
        ) : (
          <>
            <h2 className="fc-name">{data.fellowship.name}</h2>
            <div className="fc-standing">
              {isLeader && <img className="fc-crown" src="/crown.png" alt="#1" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />}
              {isLeader ? "Currently #1 · " : ""}{Math.round(data.standing.pooledMiles)} / {data.standing.totalMiles} mi · {data.standing.memberCount} members
            </div>

            <div className="fc-tabs">
              <button className={"fc-tab" + (tab === "trophies" ? " on" : "")} onClick={() => setTab("trophies")}>Trophies</button>
              <button className={"fc-tab" + (tab === "members" ? " on" : "")} onClick={() => setTab("members")}>Members</button>
            </div>

            {tab === "trophies" && (
              <div className="fc-body">
                <div className="fc-shelf-head">Weekly Victories <span>{data.weeklyBadges.length}</span></div>
                <div className="fc-shelf">
                  {data.weeklyBadges.length === 0 && <div className="fc-empty">No weekly wins yet.</div>}
                  {data.weeklyBadges.map((b, i) => (
                    <div className="fc-badge" key={i} title={`Week of ${weekLabel(b.week_start)}`}>
                      <img src={b.scope === "global_pooled" ? "/badges/week-pooled.png" : "/badges/week-percapita.png"} alt={b.scope}
                        onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
                      <small>{weekLabel(b.week_start)}</small>
                    </div>
                  ))}
                </div>

                <div className="fc-shelf-head">Lands Reached <span>{data.landmarks.reached.length}/{data.landmarks.all.length}</span></div>
                <div className="fc-shelf">
                  {data.landmarks.all.map((l) => {
                    const got = data.landmarks.reached.includes(l.id);
                    return (
                      <div className={"fc-medal" + (got ? "" : " locked")} key={l.id} title={l.name}>
                        <img src={`/medals/${l.id}.png`} alt={l.name}
                          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")} />
                        <small>{l.name}</small>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === "members" && (
              <div className="fc-member-grid">
                {data.members.map((m, i) => (
                  <div className="fc-mtile" key={m.id} style={{ ["--c" as string]: m.color ?? "#fdd835" }}>
                    <div className="fc-mrank">#{i + 1} this wk</div>
                    <img className="fc-msprite" src={spriteFor(m.chosenCharacter)} alt={m.displayName} />
                    <div className="fc-mname">{m.displayName}</div>
                    <div className="fc-mstats">
                      <div><div className="fc-mv tot">{Math.round(m.totalMiles)}</div><div className="fc-mk">total mi</div></div>
                      <div><div className="fc-mv wk">+{Math.round(m.lastWeekMiles)}</div><div className="fc-mk">last wk</div></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
