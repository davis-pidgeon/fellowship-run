import { ARCS, type SideQuest } from "../../shared/sidequests.js";

// A revealed side-quest note — styled as a weathered, discovered letter,
// deliberately distinct from the bright celebration scene postcards.
export function QuestNote({ quest, onClose }: { quest: SideQuest | null; onClose: () => void }) {
  if (!quest) return null;
  const arc = ARCS[quest.arc];
  // General notes keep the default weathered styling; story threads get a tint.
  const accent = quest.arc === "general" ? undefined : arc.color;
  const eyebrow =
    quest.arc === "general" ? "✦ A note found along the road ✦" : `✦ From the tale of ${arc.title} ✦`;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="quest-note" onClick={(e) => e.stopPropagation()} style={{ borderColor: accent }}>
        <button className="passport-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="quest-wax" aria-hidden="true">❦</div>
        <div className="quest-eyebrow" style={{ color: accent }}>{eyebrow}</div>
        {quest.photo && (
          <img
            className="quest-photo"
            src={quest.photo}
            alt={quest.title}
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
          />
        )}
        <h2 className="quest-title">{quest.title}</h2>
        <div className="quest-divider" aria-hidden="true" />
        <p className="quest-story">{quest.story}</p>
        <div className="quest-mileage">Revealed at {quest.revealMiles} mi</div>
      </div>
    </div>
  );
}
