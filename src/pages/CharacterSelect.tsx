import { useState } from "react";
import { api } from "../api-client";
import { CHARACTERS } from "../../shared/characters";
import type { CharacterKey } from "../../shared/types";

export default function CharacterSelect({ onChosen }: { onChosen: () => void }) {
  const [saving, setSaving] = useState(false);

  const choose = async (key: CharacterKey) => {
    setSaving(true);
    await api.chooseCharacter(key);
    onChosen();
  };

  return (
    <div className="centered">
      <h1>Choose your character</h1>
      <div className="character-grid">
        {CHARACTERS.map((c) => (
          <button key={c.key} disabled={saving} onClick={() => choose(c.key)}>
            <img src={c.sprite} alt={c.name} className="runner-sprite" width={48} height={48} />
            <span>{c.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
