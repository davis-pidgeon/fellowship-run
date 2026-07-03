import type { SideQuest } from "../../shared/sidequests.js";

// A revealed side-quest note — styled as an aged letter, distinct from the
// celebration scene postcards.
export function QuestNote({ quest, onClose }: { quest: SideQuest | null; onClose: () => void }) {
  if (!quest) return null;
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="quest-note" onClick={(e) => e.stopPropagation()}>
        <button className="passport-close" onClick={onClose} aria-label="Close">✕</button>
        <div className="quest-seal" aria-hidden="true">✉</div>
        {quest.photo && (
          <img
            className="quest-photo"
            src={quest.photo}
            alt={quest.title}
            onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = "none")}
          />
        )}
        <h2 className="quest-title">{quest.title}</h2>
        <p className="quest-story">{quest.story}</p>
      </div>
    </div>
  );
}
