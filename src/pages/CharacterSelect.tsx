import { useState } from "react";
import { api } from "../api-client";
import { CHARACTERS, MARKER_COLORS, DEFAULT_COLOR } from "../../shared/characters";
import type { CharacterKey } from "../../shared/types";

export default function CharacterSelect({ onChosen }: { onChosen: () => void }) {
  const [saving, setSaving] = useState(false);
  const [color, setColor] = useState<string>(DEFAULT_COLOR);

  const choose = async (key: CharacterKey) => {
    setSaving(true);
    try {
      await api.chooseCharacter(key, color);
      onChosen();
    } catch {
      alert("Could not save your character — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="centered">
      <h1>Choose your character</h1>

      <p className="subtitle">Pick your marker color</p>
      <div className="color-row">
        {MARKER_COLORS.map((c) => (
          <button
            key={c.hex}
            title={c.name}
            aria-label={c.name}
            aria-pressed={color === c.hex}
            onClick={() => setColor(c.hex)}
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
            onClick={() => choose(c.key)}
            className="character-card"
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
    </div>
  );
}
