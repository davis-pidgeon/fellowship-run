import type { Waypoint, Position } from "./types";

export function positionForMiles(miles: number, route: Waypoint[]): Position {
  const first = route[0];
  const last = route[route.length - 1];

  if (miles <= first.cumulativeMiles) {
    return { x: first.x, y: first.y, segmentIndex: 0 };
  }
  if (miles >= last.cumulativeMiles) {
    return { x: last.x, y: last.y, segmentIndex: route.length - 1 };
  }

  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i];
    const b = route[i + 1];
    if (miles >= a.cumulativeMiles && miles <= b.cumulativeMiles) {
      const span = b.cumulativeMiles - a.cumulativeMiles;
      const t = span === 0 ? 0 : (miles - a.cumulativeMiles) / span;
      // exact landing on b's threshold reports b's position and index
      if (miles === b.cumulativeMiles) {
        return { x: b.x, y: b.y, segmentIndex: i + 1 };
      }
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        segmentIndex: i,
      };
    }
  }
  return { x: last.x, y: last.y, segmentIndex: route.length - 1 };
}

export function percentComplete(miles: number, route: Waypoint[]): number {
  const total = route[route.length - 1].cumulativeMiles;
  if (total <= 0) return 0;
  const pct = (miles / total) * 100;
  return Math.max(0, Math.min(100, pct));
}
