import { useEffect, useState } from "react";
import { api, type AdminFellowship } from "../api-client";
import { ACTIVITY_TYPES } from "../../shared/activity-types";

const DEFAULT_TYPES = ["Run", "TrailRun", "VirtualRun", "Walk", "Hike"];

export function AdminFellowshipsPanel() {
  const [fellowships, setFellowships] = useState<AdminFellowship[]>([]);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("2026-07-01");
  const [types, setTypes] = useState<string[]>(DEFAULT_TYPES);
  const [multipliers, setMultipliers] = useState<Record<string, number>>({});
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = () => api.adminListFellowships().then((r) => setFellowships(r.fellowships));
  useEffect(() => { load(); }, []);

  const toggleType = (key: string) =>
    setTypes((prev) => {
      if (prev.includes(key)) {
        setMultipliers((m) => {
          const next = { ...m };
          delete next[key];
          return next;
        });
        return prev.filter((t) => t !== key);
      }
      setMultipliers((m) => ({ ...m, [key]: m[key] ?? 1 }));
      return [...prev, key];
    });

  const setMultiplier = (key: string, value: number) =>
    setMultipliers((prev) => ({ ...prev, [key]: value }));

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setStartDate("2026-07-01");
    setTypes(DEFAULT_TYPES);
    setMultipliers({});
    setClientId("");
    setClientSecret("");
  };

  const startEdit = (f: AdminFellowship) => {
    setEditingId(f.id);
    setName(f.name);
    setStartDate(f.startDate);
    setTypes(f.allowedActivityTypes);
    setMultipliers({ ...f.activityMultipliers });
    setClientId("");
    setClientSecret("");
  };

  const buildMultipliers = () =>
    Object.fromEntries(types.map((t) => [t, multipliers[t] ?? 1]));

  const submit = async () => {
    if (!name || types.length === 0) return;
    setSaving(true);
    try {
      if (editingId) {
        await api.adminUpdateFellowship({
          id: editingId, name, startDate, allowedActivityTypes: types,
          activityMultipliers: buildMultipliers(),
          stravaClientId: clientId || undefined, stravaClientSecret: clientSecret || undefined,
        });
      } else {
        await api.adminCreateFellowship({
          name, startDate, allowedActivityTypes: types,
          activityMultipliers: buildMultipliers(),
          stravaClientId: clientId || undefined, stravaClientSecret: clientSecret || undefined,
        });
      }
      resetForm();
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-panel">
      <h2>Fellowships</h2>
      <ul className="admin-list">
        {fellowships.map((f) => (
          <li key={f.id} className="admin-list-row">
            <strong>{f.name}</strong> — {f.memberCount} member{f.memberCount === 1 ? "" : "s"}, starts {f.startDate}
            <div className="admin-list-sub">{f.allowedActivityTypes.join(", ")} {f.hasCustomStravaApp ? "· dedicated Strava app" : "· default Strava app"}</div>
            <button
              onClick={() => navigator.clipboard.writeText(`${window.location.origin}/join?token=${f.inviteToken}`)}
            >
              Copy invite link
            </button>
            <button onClick={() => startEdit(f)}>Edit</button>
          </li>
        ))}
      </ul>

      <h3>{editingId ? "Edit Fellowship" : "Create a Fellowship"}</h3>
      <div className="admin-form">
        <label>Name <input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Start date <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <div className="admin-type-checklist">
          {ACTIVITY_TYPES.map((t) => (
            <label key={t.key}>
              <input type="checkbox" checked={types.includes(t.key)} onChange={() => toggleType(t.key)} />
              {t.label}
              {types.includes(t.key) && (
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={multipliers[t.key] ?? 1}
                  onChange={(e) => setMultiplier(t.key, Number(e.target.value))}
                />
              )}
            </label>
          ))}
        </div>
        <label>Strava client ID (optional — blank uses the default app)
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} />
        </label>
        <label>Strava client secret (optional)
          <input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} type="password" />
        </label>
        <button onClick={submit} disabled={saving || !name || types.length === 0}>
          {editingId ? "Save Changes" : "Create Fellowship"}
        </button>
        {editingId && <button onClick={resetForm} disabled={saving}>Cancel</button>}
      </div>
    </div>
  );
}
