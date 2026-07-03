import { CHARACTERS, MARKER_COLORS } from "../../shared/characters.js";
import type { CharacterKey } from "../../shared/types.js";

// Shared character + color picker used by first-time select and Settings.
export function CharacterPicker({
  color,
  onColor,
  onPick,
  saving,
  currentCharacter,
}: {
  color: string;
  onColor: (hex: string) => void;
  onPick: (key: CharacterKey) => void;
  saving: boolean;
  currentCharacter?: CharacterKey | null;
}) {
  return (
    <>
      <p className="subtitle">Pick your marker color</p>
      <div className="color-row">
        {MARKER_COLORS.map((c) => (
          <button
            key={c.hex}
            title={c.name}
            aria-label={c.name}
            aria-pressed={color === c.hex}
            onClick={() => onColor(c.hex)}
            className={"color-swatch" + (color === c.hex ? " selected" : "")}
            style={{ background: c.hex }}
          />
        ))}
      </div>

      <p className="subtitle">Then pick your hero</p>
      <div className="character-grid">
        {CHARACTERS.map((c) => (
          <button
            key={c.key}
            disabled={saving}
            onClick={() => onPick(c.key)}
            className={"character-card" + (currentCharacter === c.key ? " current" : "")}
            style={{ borderColor: color }}
          >
            <img
              src={c.sprite}
              alt={c.name}
              className="runner-sprite"
              width={64}
              height={96}
              style={{ filter: `drop-shadow(0 0 3px ${color})` }}
            />
            <span>{c.name}</span>
          </button>
        ))}
      </div>
    </>
  );
}
