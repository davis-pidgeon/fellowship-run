import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StatsPanel, nextLandmark } from "./StatsPanel";
import type { MeResponse } from "../api-client";

const me: MeResponse = {
  user: { id: "u1", displayName: "Davis", avatarUrl: null, chosenCharacter: "aragorn", color: "#e53935", totalMiles: 458 },
  isAdmin: false,
  fellowships: [{ id: "f1", name: "The Fellowship" }],
  fellowship: { id: "f1", name: "The Fellowship" },
  members: [
    { id: "u1", displayName: "Davis", chosenCharacter: "aragorn", color: "#e53935", totalMiles: 458, openedQuests: [], stats: { runs: 0, longestMiles: 0, avgMiles: 0, avgPaceSecPerMile: null, weekStreak: 0 }, activities: [] },
    { id: "u2", displayName: "Sam", chosenCharacter: "frodo", color: "#1e88e5", totalMiles: 200, openedQuests: [], stats: { runs: 0, longestMiles: 0, avgMiles: 0, avgPaceSecPerMile: null, weekStreak: 0 }, activities: [] },
  ],
  fellowshipMiles: 658,
  openedQuests: [],
  notifiedAchievements: [],
};

describe("nextLandmark", () => {
  it("returns the next landmark ahead", () => {
    expect(nextLandmark(458)?.name).toBe("Mines of Moria");
  });
  it("returns null past the end", () => {
    expect(nextLandmark(2000)).toBeNull();
  });
});

describe("StatsPanel", () => {
  it("shows both personal and fellowship percentages", () => {
    render(<StatsPanel me={me} onSync={() => {}} syncing={false} onSelectMember={() => {}} fellowships={me.fellowships} fellowshipId="f1" onSelectFellowship={() => {}} />);
    // personal: 458/1779 ≈ 25.7% ; fellowship: 658/1779 ≈ 37.0%
    expect(screen.getByText(/25\.7%/)).toBeInTheDocument();
    expect(screen.getByText(/37\.0%/)).toBeInTheDocument();
  });
  it("lists members sorted by miles", () => {
    render(<StatsPanel me={me} onSync={() => {}} syncing={false} onSelectMember={() => {}} fellowships={me.fellowships} fellowshipId="f1" onSelectFellowship={() => {}} />);
    const rows = screen.getAllByTestId("leader-row");
    expect(rows[0]).toHaveTextContent("Davis");
    expect(rows[1]).toHaveTextContent("Sam");
  });
  it("fires onSync when the button is clicked", () => {
    const onSync = vi.fn();
    render(<StatsPanel me={me} onSync={onSync} syncing={false} onSelectMember={() => {}} fellowships={me.fellowships} fellowshipId="f1" onSelectFellowship={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /sync/i }));
    expect(onSync).toHaveBeenCalled();
  });
  it("toggles the detail lens between Me and Fellowship", () => {
    render(<StatsPanel me={me} onSync={() => {}} syncing={false} onSelectMember={() => {}} fellowships={me.fellowships} fellowshipId="f1" onSelectFellowship={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /fellowship/i }));
    // fellowship at 658 mi -> next landmark still Moria (800), distance 142
    expect(screen.getByTestId("next-landmark")).toHaveTextContent(/142/);
  });
});
