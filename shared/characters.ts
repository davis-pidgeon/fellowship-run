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
