import { useState } from "react";
import { ROUTE } from "../../shared/route";

// A journey log: the backpack button opens a book of "postcards" — one per
// landmark the runner has already reached, flipped through one at a time.
export function Passport({ totalMiles }: { totalMiles: number }) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  // Includes the Shire (mile 0) so the book always opens with your homeland.
  const visited = ROUTE.filter((w) => w.isLandmark && w.cumulativeMiles <= totalMiles);

  const show = () => {
    setI(0);
    setOpen(true);
  };
  const step = (d: number) => setI((prev) => (prev + d + visited.length) % visited.length);

  return (
    <>
      <button className="backpack-btn" onClick={show} title="Your journey" aria-label="Open your journey log">
        <img src="/pack.png" alt="Backpack" />
      </button>

      {open && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div className="modal pixel-frame passport" onClick={(e) => e.stopPropagation()}>
            <button className="passport-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            <h2>Your Journey</h2>

            {visited.length === 0 ? (
              <p className="lore">
                No postcards yet — lace up and reach your first landmark to start your collection!
              </p>
            ) : (
              <>
                <img
                  className="postcard-scene"
                  src={`/scenes/${visited[i].landmarkId}.png`}
                  alt={visited[i].name}
                  onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
                />
                <h3>{visited[i].name}</h3>
                <p className="lore">{visited[i].lore}</p>
                <div className="passport-nav">
                  <button onClick={() => step(-1)} aria-label="Previous">◀</button>
                  <span>{i + 1} / {visited.length}</span>
                  <button onClick={() => step(1)} aria-label="Next">▶</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
