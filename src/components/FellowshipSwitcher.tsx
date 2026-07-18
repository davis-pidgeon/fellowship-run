import type { FellowshipSummary } from "../api-client";
import type { DashboardView } from "../useSession";

export function FellowshipSwitcher({
  fellowships, fellowshipId, view, onSelect, onGlobal,
}: {
  fellowships: FellowshipSummary[];
  fellowshipId: string | undefined;
  view: DashboardView;
  onSelect: (id: string) => void;
  onGlobal: () => void;
}) {
  if (fellowships.length <= 1) return null;
  return (
    <div className="fellowship-switcher">
      {fellowships.map((f) => (
        <button
          key={f.id}
          className={view === "fellowship" && fellowshipId === f.id ? "active" : ""}
          onClick={() => onSelect(f.id)}
        >
          {f.name}
        </button>
      ))}
      <button className={view === "global" ? "active" : ""} onClick={onGlobal}>Global</button>
    </div>
  );
}
