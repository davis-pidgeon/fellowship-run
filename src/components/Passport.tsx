import { useState } from "react";
import { ROUTE } from "../../shared/route";
import { SIDE_QUESTS, ARCS, type QuestArc } from "../../shared/sidequests";

// A journey log: the backpack opens a book grouped into collections — the
// landmark postcards you've reached, plus each story thread of notes you've
// opened (opening a note on the map moves it here). Progress shows per thread.
export function Passport({
  totalMiles,
  openedQuestIds,
}: {
  totalMiles: number;
  openedQuestIds: string[];
}) {
  const [open, setOpen] = useState(false);

  const totalLandmarks = ROUTE.filter((w) => w.isLandmark).length;
  const landmarks = ROUTE.filter((w) => w.isLandmark && w.cumulativeMiles <= totalMiles);

  const openedSet = new Set(openedQuestIds);
  const arcOrder = Object.keys(ARCS) as QuestArc[];
  const collections = arcOrder
    .map((arc) => {
      const all = SIDE_QUESTS.filter((q) => q.arc === arc);
      const found = all.filter((q) => openedSet.has(q.id));
      return { arc, info: ARCS[arc], total: all.length, found };
    })
    .filter((c) => c.found.length > 0);

  const nothing = landmarks.length === 0 && collections.length === 0;

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

            {nothing ? (
              <p className="lore">
                No postcards or notes yet — lace up and reach your first landmark, or find a letter along the road, to start your collection!
              </p>
            ) : (
              <div className="passport-scroll">
                {landmarks.length > 0 && (
                  <section className="collection">
                    <h3 className="collection-head">
                      Landmarks <span className="collection-count">{landmarks.length}/{totalLandmarks}</span>
                    </h3>
                    {landmarks.map((w) => (
                      <div className="postcard-entry" key={w.landmarkId}>
                        <img
                          className="postcard-scene"
                          src={`/scenes/${w.landmarkId}.png`}
                          alt={w.name}
                          onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                        />
                        <h4>{w.name} <span className="entry-mi">· {w.cumulativeMiles} mi</span></h4>
                        <p className="lore">{w.lore}</p>
                      </div>
                    ))}
                  </section>
                )}

                {collections.map((c) => (
                  <section className="collection" key={c.arc}>
                    <h3
                      className="collection-head"
                      style={{ color: c.arc === "general" ? undefined : c.info.color }}
                    >
                      <span className="collection-dot" style={{ background: c.info.color }} />
                      {c.info.title} <span className="collection-count">{c.found.length}/{c.total}</span>
                    </h3>
                    {c.found.map((q) => (
                      <div
                        className="note-entry"
                        key={q.id}
                        style={{ borderColor: c.arc === "general" ? undefined : c.info.color }}
                      >
                        <h4>{q.title} <span className="entry-mi">· {q.revealMiles} mi</span></h4>
                        <p className="lore">{q.story}</p>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
