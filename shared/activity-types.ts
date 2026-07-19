export interface ActivityTypeDef {
  key: string;
  label: string;
}

// Strava sport_type values the app knows how to classify. Used both to
// validate admin input and to render the admin checklist.
export const ACTIVITY_TYPES: ActivityTypeDef[] = [
  { key: "Run", label: "Run" },
  { key: "TrailRun", label: "Trail Run" },
  { key: "VirtualRun", label: "Virtual Run" },
  { key: "Walk", label: "Walk" },
  { key: "Hike", label: "Hike" },
  { key: "Ride", label: "Ride" },
  { key: "VirtualRide", label: "Virtual Ride" },
];
