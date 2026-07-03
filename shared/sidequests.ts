// Side quests: hidden "envelope" easter eggs scattered off the main path.
// A quest reveals on a runner's map once their total miles reach `revealMiles`.
//
// TO ADD A REAL ONE: append an entry below with
//   - revealMiles: the mileage at which it appears
//   - x, y:        pixel position on the map image (941 x 1672). Put it OFF the
//                  trail in open space (trail sits around x 400-640).
//   - title, story: the note shown when clicked
//   - photo:       OPTIONAL image path, e.g. "/quests/my-photo.png"
export interface SideQuest {
  id: string;
  revealMiles: number;
  x: number;
  y: number;
  title: string;
  story: string;
  photo?: string;
}

// --- TEST DATA (placeholder flavor text; replace with your real notes) ---
export const SIDE_QUESTS: SideQuest[] = [
  {
    id: "milestone-cake",
    revealMiles: 5,
    x: 180,
    y: 210,
    title: "A Crumb on the Milestone",
    story:
      "A weathered milestone leans by the roadside. Someone has left half a seed-cake and a scrawled note: 'Second breakfast — highly recommended for the road ahead.'",
  },
  {
    id: "sealed-letter",
    revealMiles: 27,
    x: 760,
    y: 175,
    title: "A Sealed Letter",
    story:
      "An envelope pinned beneath a stone, its red wax cracked with age. The ink has faded, but a single line remains legible: 'Keep to the path, and mind the marshes after dark.'",
  },
  {
    id: "old-signpost",
    revealMiles: 100,
    x: 165,
    y: 300,
    title: "The Crooked Signpost",
    story:
      "A signpost with too many arms points in every direction at once. Every arrow has been turned to face the way you came — a traveler's small joke, or a warning.",
  },
  {
    id: "campfire-song",
    revealMiles: 300,
    x: 785,
    y: 540,
    title: "Embers of a Campfire",
    story:
      "The ashes are still warm. Whoever rested here scratched a tune's worth of tally-marks into a log and left a boot-print pointing onward. They were in good spirits, and in a hurry.",
  },
  {
    id: "watchers-stone",
    revealMiles: 600,
    x: 175,
    y: 800,
    title: "The Watcher's Stone",
    story:
      "A tall stone stands alone, carved with a single open eye worn nearly smooth. Birds refuse to land on it. You feel, briefly, that the road behind you is being counted.",
  },
];
