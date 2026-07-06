import { useEffect } from "react";
import type { EarnedAchievement } from "../achievements";

// Transient "achievement unlocked" cards that auto-dismiss after a few seconds.
export function AchievementToasts({
  toasts,
  onDismiss,
}: {
  toasts: EarnedAchievement[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="ach-toasts">
      {toasts.map((t) => (
        <Toast key={t.id} ach={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function Toast({ ach, onDismiss }: { ach: EarnedAchievement; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(ach.id), 5500);
    return () => clearTimeout(timer);
  }, [ach.id, onDismiss]);
  return (
    <div className="ach-toast" onClick={() => onDismiss(ach.id)} role="status">
      <span className="ach-toast-icon">{ach.icon}</span>
      <div className="ach-toast-body">
        <div className="ach-toast-eyebrow">★ Achievement unlocked</div>
        <div className="ach-toast-name">{ach.name}</div>
      </div>
    </div>
  );
}
