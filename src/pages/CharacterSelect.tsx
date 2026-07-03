import { useState } from "react";
import { api } from "../api-client";
import { DEFAULT_COLOR } from "../../shared/characters.js";
import type { CharacterKey } from "../../shared/types.js";
import { CharacterPicker } from "../components/CharacterPicker";

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
      <CharacterPicker color={color} onColor={setColor} onPick={choose} saving={saving} />
    </div>
  );
}
