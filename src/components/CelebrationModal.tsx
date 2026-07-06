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
        <img
          className="badge-scene"
          data-landmark={badge.landmarkId}
          src={`/scenes/${badge.landmarkId}.png`}
          alt={badge.name}
          style={{
            width: "100%",
            maxHeight: 220,
            objectFit: "cover",
            imageRendering: "pixelated",
            borderRadius: 4,
            marginBottom: 12,
            display: "block",
          }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <h2>{badge.name}</h2>
        <div className="badge-mi">Reached at {badge.cumulativeMiles} mi</div>
        <p className="message">{badge.message}</p>
        <p className="lore">{badge.lore}</p>
        <button onClick={advance}>Continue</button>
      </div>
    </div>
  );
}
