import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CelebrationModal } from "./CelebrationModal";
import type { Milestone } from "../../shared/types";

const badges: Milestone[] = [
  { landmarkId: "rivendell", name: "Rivendell", message: "You have reached Rivendell!", lore: "A hidden valley.", cumulativeMiles: 458 },
  { landmarkId: "moria", name: "Moria", message: "You crossed Moria!", lore: "A dark mine.", cumulativeMiles: 800 },
];

describe("CelebrationModal", () => {
  it("renders nothing with no badges", () => {
    const { container } = render(<CelebrationModal badges={[]} onClose={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("advances through badges then closes", () => {
    const onClose = vi.fn();
    render(<CelebrationModal badges={badges} onClose={onClose} />);
    expect(screen.getByText("Rivendell")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByText("Moria")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
