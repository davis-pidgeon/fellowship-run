import type { CharacterKey } from "./types";

export interface CharacterDef {
  key: CharacterKey;
  name: string;
  sprite: string; // path under /sprites, supplied as a pixel-art asset later
}

export const CHARACTERS: CharacterDef[] = [
  { key: "frodo", name: "Frodo (Hobbit)", sprite: "/sprites/frodo.png" },
  { key: "sam", name: "Sam (Hobbit)", sprite: "/sprites/sam.png" },
  { key: "aragorn", name: "Aragorn (Ranger)", sprite: "/sprites/aragorn.png" },
  { key: "legolas", name: "Legolas (Elf)", sprite: "/sprites/legolas.png" },
  { key: "gimli", name: "Gimli (Dwarf)", sprite: "/sprites/gimli.png" },
  { key: "gandalf", name: "Gandalf (Wizard)", sprite: "/sprites/gandalf.png" },
  { key: "boromir", name: "Boromir (Warrior)", sprite: "/sprites/boromir.png" },
];

export interface MarkerColor {
  name: string;
  hex: string;
}

// Selectable marker outline colors (single source of truth for client + server).
export const MARKER_COLORS: MarkerColor[] = [
  { name: "Crimson", hex: "#e53935" },
  { name: "Azure", hex: "#1e88e5" },
  { name: "Emerald", hex: "#43a047" },
  { name: "Gold", hex: "#fdd835" },
  { name: "Violet", hex: "#8e24aa" },
  { name: "Amber", hex: "#fb8c00" },
  { name: "Cyan", hex: "#00acc1" },
  { name: "Rose", hex: "#ec407a" },
];

export const DEFAULT_COLOR = MARKER_COLORS[3].hex; // Gold
