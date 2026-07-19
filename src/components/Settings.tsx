import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type MeResponse } from "../api-client";
import { DEFAULT_COLOR } from "../../shared/characters.js";
import type { CharacterKey } from "../../shared/types.js";
import { CharacterPicker } from "./CharacterPicker";

// Gear button + modal to change your character and color after joining.
export function Settings({ me, refresh }: { me: MeResponse; refresh: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [color, setColor] = useState<string>(me.user.color ?? DEFAULT_COLOR);
  const navigate = useNavigate();

  const choose = async (key: CharacterKey) => {
    setSaving(true);
    try {
      await api.chooseCharacter(key, color);
      refresh();
      setOpen(false);
    } catch {
      alert("Could not save — please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button className="gear-btn" onClick={() => setOpen(true)} title="Settings" aria-label="Settings">
        <img src="/gear.png" alt="Settings" />
      </button>

      {open && (
        <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div className="modal pixel-frame settings-modal" onClick={(e) => e.stopPropagation()}>
            <button className="passport-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            <h2>Settings</h2>
            <CharacterPicker
              color={color}
              onColor={setColor}
              onPick={choose}
              saving={saving}
              currentCharacter={me.user.chosenCharacter}
            />
            {me.isAdmin && (
              <button
                className="admin-link-btn"
                onClick={() => { setOpen(false); navigate("/admin"); }}
              >
                ⚔ Admin
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
