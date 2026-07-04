import type { Waypoint } from "./types.js";

// Pixel coordinates are in the map image's own space (1448 x 1086). Landmarks
// carry the celebration data + fixed mileages; the non-landmark points between
// them bend the trail so it hugs the drawn yellow dotted path. Most points were
// traced from the map art by computer vision (.superpowers/extract.mjs); the
// Black Gate -> Mount Doom climb is hand-drawn (no dotted path there, only lava)
// so the marker finishes at the crater. Leaflet CRS.Simple maps a Position to
// LatLng [y, x].
export const ROUTE: Waypoint[] = [
  {
    name: "The Shire", x: 200, y: 352, cumulativeMiles: 0,
    isLandmark: true, landmarkId: "shire",
    message: "Your journey begins in the Shire.",
    lore: "A green and peaceful homeland of rolling hills and round doors.",
  },
  { name: "", x: 213, y: 290, cumulativeMiles: 43, isLandmark: false },
  { name: "", x: 235, y: 292, cumulativeMiles: 71, isLandmark: false },
  { name: "", x: 302, y: 334, cumulativeMiles: 258, isLandmark: false },
  { name: "", x: 321, y: 337, cumulativeMiles: 283, isLandmark: false },
  { name: "", x: 422, y: 304, cumulativeMiles: 391, isLandmark: false },
  { name: "", x: 460, y: 322, cumulativeMiles: 436, isLandmark: false },
  {
    name: "Rivendell", x: 477, y: 334, cumulativeMiles: 458,
    isLandmark: true, landmarkId: "rivendell",
    message: "You have reached Rivendell!",
    lore: "A hidden elven valley of waterfalls, where weary travelers find rest.",
  },
  { name: "", x: 559, y: 346, cumulativeMiles: 577, isLandmark: false },
  { name: "", x: 633, y: 357, cumulativeMiles: 703, isLandmark: false },
  { name: "", x: 655, y: 351, cumulativeMiles: 744, isLandmark: false },
  {
    name: "Mines of Moria", x: 693, y: 344, cumulativeMiles: 800,
    isLandmark: true, landmarkId: "moria",
    message: "You have crossed the Mines of Moria!",
    lore: "An ancient dwarven kingdom, now dark and deep beneath the mountains.",
  },
  { name: "", x: 733, y: 351, cumulativeMiles: 864, isLandmark: false },
  { name: "", x: 769, y: 375, cumulativeMiles: 877, isLandmark: false },
  { name: "", x: 824, y: 412, cumulativeMiles: 896, isLandmark: false },
  {
    name: "Lothlorien", x: 848, y: 448, cumulativeMiles: 920,
    isLandmark: true, landmarkId: "lothlorien",
    message: "You have entered Lothlorien!",
    lore: "A golden wood of tall silver trees, radiant and timeless.",
  },
  { name: "", x: 855, y: 484, cumulativeMiles: 1080, isLandmark: false },
  { name: "", x: 873, y: 494, cumulativeMiles: 1150, isLandmark: false },
  { name: "", x: 899, y: 512, cumulativeMiles: 1220, isLandmark: false },
  { name: "", x: 939, y: 510, cumulativeMiles: 1288, isLandmark: false },
  {
    name: "Rauros Falls", x: 969, y: 510, cumulativeMiles: 1309,
    isLandmark: true, landmarkId: "rauros",
    message: "You have reached the Falls of Rauros!",
    lore: "A great cascade on the river, guarded by two towering stone kings.",
  },
  { name: "", x: 993, y: 510, cumulativeMiles: 1329, isLandmark: false },
  { name: "", x: 957, y: 604, cumulativeMiles: 1414, isLandmark: false },
  { name: "", x: 962, y: 619, cumulativeMiles: 1435, isLandmark: false },
  { name: "", x: 975, y: 662, cumulativeMiles: 1473, isLandmark: false },
  { name: "", x: 963, y: 685, cumulativeMiles: 1495, isLandmark: false },
  {
    name: "Minas Tirith", x: 969, y: 686, cumulativeMiles: 1500,
    isLandmark: true, landmarkId: "minas-tirith",
    message: "You have arrived at Minas Tirith!",
    lore: "A white city of seven tiers, gleaming against the mountainside.",
  },
  { name: "", x: 1137, y: 739, cumulativeMiles: 1561, isLandmark: false },
  { name: "", x: 1215, y: 760, cumulativeMiles: 1598, isLandmark: false },
  { name: "", x: 1257, y: 752, cumulativeMiles: 1633, isLandmark: false },
  {
    name: "The Black Gate", x: 1274, y: 747, cumulativeMiles: 1650,
    isLandmark: true, landmarkId: "black-gate",
    message: "You stand before the Black Gate!",
    lore: "A vast iron barrier at the threshold of a ruined, ashen land.",
  },
  { name: "", x: 1255, y: 630, cumulativeMiles: 1680, isLandmark: false },
  { name: "", x: 1235, y: 520, cumulativeMiles: 1705, isLandmark: false },
  { name: "", x: 1222, y: 420, cumulativeMiles: 1728, isLandmark: false },
  { name: "", x: 1230, y: 320, cumulativeMiles: 1748, isLandmark: false },
  { name: "", x: 1255, y: 235, cumulativeMiles: 1765, isLandmark: false },
  { name: "", x: 1275, y: 180, cumulativeMiles: 1773, isLandmark: false },
  {
    name: "Mount Doom", x: 1288, y: 140, cumulativeMiles: 1779,
    isLandmark: true, landmarkId: "mount-doom",
    message: "You have reached Mount Doom — the quest is complete!",
    lore: "A lone volcano wreathed in smoke and fire at the journey's end.",
  },
];

export const TOTAL_MILES = ROUTE[ROUTE.length - 1].cumulativeMiles;
