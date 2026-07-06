export type CharacterKey =
  | "frodo" | "sam" | "aragorn" | "legolas" | "gimli" | "gandalf" | "boromir"
  | "merry" | "pippin";

export interface Waypoint {
  name: string;
  x: number;
  y: number;
  cumulativeMiles: number;
  isLandmark: boolean;
  landmarkId?: string;
  message?: string;
  lore?: string;
}

export interface RunActivity {
  stravaActivityId: number;
  distanceMiles: number;
  runDate: string; // ISO 8601
  name: string;
  movingSeconds?: number; // Strava moving_time, for pace; optional for older data
}

export interface Position {
  x: number;
  y: number;
  segmentIndex: number;
}

export interface Milestone {
  landmarkId: string;
  name: string;
  message: string;
  lore: string;
  cumulativeMiles: number;
}
