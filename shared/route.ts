import type { Waypoint } from "./types";

export const ROUTE: Waypoint[] = [
  {
    name: "The Shire", x: 300, y: 60, cumulativeMiles: 0,
    isLandmark: true, landmarkId: "shire",
    message: "Your journey begins in the Shire.",
    lore: "A green and peaceful homeland of rolling hills and round doors.",
  },
  {
    name: "Rivendell", x: 340, y: 300, cumulativeMiles: 458,
    isLandmark: true, landmarkId: "rivendell",
    message: "You have reached Rivendell!",
    lore: "A hidden elven valley of waterfalls, where weary travelers find rest.",
  },
  {
    name: "Mines of Moria", x: 300, y: 470, cumulativeMiles: 800,
    isLandmark: true, landmarkId: "moria",
    message: "You have crossed the Mines of Moria!",
    lore: "An ancient dwarven kingdom, now dark and deep beneath the mountains.",
  },
  {
    name: "Lothlorien", x: 330, y: 560, cumulativeMiles: 920,
    isLandmark: true, landmarkId: "lothlorien",
    message: "You have entered Lothlorien!",
    lore: "A golden wood of tall silver trees, radiant and timeless.",
  },
  {
    name: "Rauros Falls", x: 340, y: 760, cumulativeMiles: 1309,
    isLandmark: true, landmarkId: "rauros",
    message: "You have reached the Falls of Rauros!",
    lore: "A great cascade on the river, guarded by two towering stone kings.",
  },
  {
    name: "Minas Tirith", x: 380, y: 940, cumulativeMiles: 1500,
    isLandmark: true, landmarkId: "minas-tirith",
    message: "You have arrived at Minas Tirith!",
    lore: "A white city of seven tiers, gleaming against the mountainside.",
  },
  {
    name: "The Black Gate", x: 430, y: 1060, cumulativeMiles: 1650,
    isLandmark: true, landmarkId: "black-gate",
    message: "You stand before the Black Gate!",
    lore: "A vast iron barrier at the threshold of a ruined, ashen land.",
  },
  {
    name: "Mount Doom", x: 470, y: 1140, cumulativeMiles: 1779,
    isLandmark: true, landmarkId: "mount-doom",
    message: "You have reached Mount Doom — the quest is complete!",
    lore: "A lone volcano wreathed in smoke and fire at the journey's end.",
  },
];

export const TOTAL_MILES = ROUTE[ROUTE.length - 1].cumulativeMiles;
