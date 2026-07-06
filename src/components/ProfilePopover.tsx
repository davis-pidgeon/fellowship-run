import type { Member } from "../api-client";
import { CHARACTERS } from "../../shared/characters";
import { ROUTE } from "../../shared/route";
import { SIDE_QUESTS } from "../../shared/sidequests";

export interface ProfileTarget {
  member: Member;
  pt: { x: number; y: number };
}
export interface ClusterTarget {
  members: Member[];
  pt: { x: number; y: number };
}

function spriteFor(character: string | null): string {
  return CHARACTERS.find((c) => c.key === character)?.sprite ?? "/sprites/frodo.png";
}
export function fmtPace(secPerMile: number | null): string {
  if (!secPerMile || !isFinite(secPerMile)) return "—";
  const m = Math.floor(secPerMile / 60);
  const s = Math.round(secPerMile % 60);
  return `${m}:${String(s).padStart(2, "0")}/mi`;
}
export function latestLandmark(miles: number): string {
  const reached = ROUTE.filter((w) => w.isLandmark && w.cumulativeMiles <= miles);
  return reached.length ? reached[reached.length - 1].name : "—";
}
export function latestNoteTitle(openedQuests: string[]): string {
  if (!openedQuests.length) return "—";
  const q = SIDE_QUESTS.find((n) => n.id === openedQuests[openedQuests.length - 1]);
  return q ? q.title : "—";
}

// A small card that floats above a tapped character with quick stats; the
// transparent backdrop closes it on any click-away.
export function ProfilePopover({
  target,
  onClose,
  onViewDetails,
}: {
  target: ProfileTarget | null;
  onClose: () => void;
  onViewDetails: (m: Member) => void;
}) {
  if (!target) return null;
  const { member, pt } = target;
  const s = member.stats;
  const rows: [string, string][] = [
    ["Runs", String(s.runs)],
    ["Avg pace", fmtPace(s.avgPaceSecPerMile)],
    ["Longest run", s.longestMiles ? `${s.longestMiles.toFixed(1)} mi` : "—"],
    ["Avg / run", s.avgMiles ? `${s.avgMiles.toFixed(1)} mi` : "—"],
    ["Latest landmark", latestLandmark(member.totalMiles)],
    ["Latest note", latestNoteTitle(member.openedQuests)],
  ];
  const color = member.color ?? "#fdd835";

  return (
    <div className="profile-backdrop" onClick={onClose}>
      <div
        className="profile-pop"
        style={{ left: pt.x, top: pt.y, borderColor: color }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="profile-pop-name" style={{ color }}>{member.displayName}</div>
        <div className="profile-pop-sub">{Math.round(member.totalMiles)} mi traveled</div>
        <div className="profile-pop-grid">
          {rows.map(([label, val]) => (
            <div className="profile-stat" key={label}>
              <span className="profile-stat-label">{label}</span>
              <span className="profile-stat-val">{val}</span>
            </div>
          ))}
        </div>
        <button className="profile-more" style={{ background: color }} onClick={() => onViewDetails(member)}>
          View more details
        </button>
        <div className="profile-pop-arrow" style={{ borderTopColor: color }} />
      </div>
    </div>
  );
}

// When several characters overlap, a tap fans them out into a chooser so you
// can pick exactly who to inspect.
export function ClusterPicker({
  target,
  onPick,
  onClose,
}: {
  target: ClusterTarget | null;
  onPick: (m: Member) => void;
  onClose: () => void;
}) {
  if (!target) return null;
  return (
    <div className="profile-backdrop" onClick={onClose}>
      <div className="cluster-pick" style={{ left: target.pt.x, top: target.pt.y }} onClick={(e) => e.stopPropagation()}>
        <div className="cluster-pick-title">Who's here?</div>
        <div className="cluster-pick-row">
          {target.members.map((m) => (
            <button
              key={m.id}
              className="cluster-chip"
              style={{ borderColor: m.color ?? "#fdd835" }}
              onClick={() => onPick(m)}
            >
              <img src={spriteFor(m.chosenCharacter)} alt={m.displayName} />
              <span>{m.displayName}</span>
            </button>
          ))}
        </div>
        <div className="profile-pop-arrow" />
      </div>
    </div>
  );
}
